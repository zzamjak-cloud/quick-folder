use super::python::python_for_font_merge;
use crate::modules::error::{AppError, Result};

pub async fn merge_fonts(
    base_path: String,
    merge_path: String,
    output_path: String,
) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Python fonttools를 사용한 폰트 병합
        // A 폰트를 베이스로, B 폰트에서 A에 없는 글리프만 복사
        let script = r#"
import sys
from fontTools.ttLib import TTFont

base = TTFont(sys.argv[1])
source = TTFont(sys.argv[2])
output_path = sys.argv[3]

# cmap 테이블에서 코드포인트 → 글리프 이름 매핑 가져오기
base_cmap = base.getBestCmap() or {}
src_cmap = source.getBestCmap() or {}

# B에만 있는 코드포인트 찾기
missing = set(src_cmap.keys()) - set(base_cmap.keys())

if missing:
    has_glyf = 'glyf' in base and 'glyf' in source

    for cp in missing:
        glyph_name = src_cmap[cp]

        # cmap 테이블에 코드포인트 등록
        for table in base['cmap'].tables:
            if hasattr(table, 'cmap') and table.format in (4, 12):
                table.cmap[cp] = glyph_name

        # glyf 테이블에서 글리프 데이터 복사 (TrueType)
        if has_glyf and glyph_name in source['glyf']:
            base['glyf'][glyph_name] = source['glyf'][glyph_name]

        # hmtx (수평 메트릭) 복사
        if 'hmtx' in base and 'hmtx' in source:
            if glyph_name in source['hmtx'].metrics:
                base['hmtx'][glyph_name] = source['hmtx'].metrics[glyph_name]

        # vmtx (수직 메트릭) 복사 (존재 시)
        if 'vmtx' in base and 'vmtx' in source:
            if glyph_name in source['vmtx'].metrics:
                base['vmtx'][glyph_name] = source['vmtx'].metrics[glyph_name]

    # 글리프 순서 업데이트
    new_glyphs = [src_cmap[cp] for cp in missing if src_cmap[cp] not in base.getGlyphOrder()]
    if new_glyphs:
        base.setGlyphOrder(base.getGlyphOrder() + new_glyphs)

    # maxp 테이블 업데이트 (글리프 수)
    if 'maxp' in base:
        base['maxp'].numGlyphs = len(base.getGlyphOrder())

base.save(output_path)
count = len(missing)
print(f'OK:{count}')
"#;

        let python = python_for_font_merge().ok_or_else(|| AppError::ToolNotFound {
            tool: "fonttools".to_string(),
        })?;

        let mut cmd = std::process::Command::new(&python);
        cmd.args(["-c", script, &base_path, &merge_path, &output_path]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd.output().map_err(|e| AppError::ToolExecution {
            tool: "Python".to_string(),
            reason: e.to_string(),
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("No module named 'fontTools'")
                || stderr.contains("No module named 'fonttools'")
            {
                return Err(AppError::ToolNotFound {
                    tool: "fonttools 패키지".to_string(),
                });
            }
            return Err(AppError::FontProcessing(stderr.to_string()));
        }

        Ok(output_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("폰트 병합 태스크 실패: {}", e)))?
}
