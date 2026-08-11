//! PDF 압축 (순수 Rust 구현)
//!
//! Ghostscript(AGPL) 의존을 제거하기 위해 lopdf + image 크레이트만으로 PDF를 압축한다.
//! 핵심 전략은 PDF 안에 포함된 이미지 XObject를 재인코딩하여 용량을 줄이는 것이다.
//! - DCTDecode(JPEG): 긴 변이 1600px를 넘으면 다운스케일 후 품질 75로 재인코딩
//! - FlateDecode 원시 비트맵(8bit RGB/Gray): 동일 규칙으로 JPEG(DCTDecode) 전환
//! - CMYK/Indexed/ICC/CCITT/JBIG2/JPX/SMask 등 특수 케이스는 안전하게 건너뛴다.
//!
//! 손상 방지 원칙: 교체는 결과가 더 작아질 때만 수행하며, 파싱/재인코딩 실패 시
//! 해당 이미지는 건드리지 않고 넘어간다. 최종 산출물이 원본보다 크거나 같으면
//! 산출물을 삭제하고 에러를 반환하므로 원본은 절대 손상되지 않는다.

use crate::modules::error::{AppError, Result};
use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ImageFormat};
use lopdf::{Document, Object, ObjectId};
use std::collections::HashSet;

/// 다운스케일 기준 (긴 변 픽셀)
const MAX_LONG_SIDE: u32 = 1600;
/// JPEG 재인코딩 품질
const JPEG_QUALITY: u8 = 75;

fn format_file_size(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

/// 이미지 색 공간 분류 (재인코딩 가능한 경우만 구분)
#[derive(Clone, Copy, PartialEq)]
enum ColorKind {
    Rgb,
    Gray,
    /// CMYK/Indexed/ICC 등 처리 대상이 아닌 색 공간
    Other,
}

/// ColorSpace 객체(이름/참조)를 해석한다. 배열(ICCBased/Indexed 등)은 Other로 취급한다.
fn resolve_colorspace(doc: &Document, obj: &Object) -> ColorKind {
    match obj {
        Object::Name(name) => match name.as_slice() {
            b"DeviceRGB" => ColorKind::Rgb,
            b"DeviceGray" => ColorKind::Gray,
            _ => ColorKind::Other,
        },
        Object::Reference(id) => doc
            .get_object(*id)
            .map(|o| resolve_colorspace(doc, o))
            .unwrap_or(ColorKind::Other),
        _ => ColorKind::Other,
    }
}

/// Filter 항목에서 단일 필터 이름을 추출한다. 필터가 없거나 2개 이상 체인되면 None.
fn single_filter(dict: &lopdf::Dictionary) -> Option<Vec<u8>> {
    match dict.get(b"Filter").ok()? {
        Object::Name(name) => Some(name.clone()),
        Object::Array(arr) if arr.len() == 1 => arr[0].as_name().ok().map(|n| n.to_vec()),
        _ => None,
    }
}

/// DecodeParms에 PNG 예측자(Predictor > 1)가 있으면 원시 비트맵 해석이 불가하므로 true.
fn has_predictor(doc: &Document, dict: &lopdf::Dictionary) -> bool {
    let parms = match dict.get(b"DecodeParms").or_else(|_| dict.get(b"DP")) {
        Ok(p) => p,
        Err(_) => return false,
    };
    let parms_dict = match parms {
        Object::Dictionary(d) => d.clone(),
        Object::Reference(id) => match doc.get_object(*id).and_then(|o| o.as_dict()) {
            Ok(d) => d.clone(),
            Err(_) => return true, // 해석 불가 → 안전하게 건너뛰기 유도
        },
        // 배열 형태(다중 필터 파라미터)는 처리 대상 아님
        _ => return true,
    };
    parms_dict
        .get(b"Predictor")
        .ok()
        .and_then(|o| o.as_i64().ok())
        .map(|p| p > 1)
        .unwrap_or(false)
}

/// 긴 변이 기준을 넘으면 종횡비를 유지하며 Lanczos3로 축소한다.
fn maybe_downscale(img: DynamicImage, max_long_side: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w.max(h) > max_long_side {
        img.resize(
            max_long_side,
            max_long_side,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img
    }
}

/// DynamicImage를 JPEG(DCTDecode)로 인코딩한다. gray=true면 그레이스케일로 출력한다.
fn encode_jpeg(img: &DynamicImage, gray: bool, quality: u8) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut out, quality);
    if gray {
        let buf = img.to_luma8();
        encoder
            .encode_image(&buf)
            .map_err(|e| AppError::PdfProcessing(e.to_string()))?;
    } else {
        let buf = img.to_rgb8();
        encoder
            .encode_image(&buf)
            .map_err(|e| AppError::PdfProcessing(e.to_string()))?;
    }
    Ok(out)
}

/// 이미지 교체 정보. 항상 DCTDecode(JPEG)로 통일된다.
struct Replacement {
    content: Vec<u8>,
    width: u32,
    height: u32,
    gray: bool,
}

/// 단일 이미지 XObject를 검사해 재인코딩 결과가 더 작을 때만 Replacement를 반환한다.
/// 처리 불가/실패 시 None을 반환하여 원본 스트림을 그대로 둔다.
fn build_replacement(doc: &Document, id: ObjectId) -> Option<Replacement> {
    let stream = doc.get_object(id).ok()?.as_stream().ok()?;
    let dict = &stream.dict;

    // 현재 디스크 상 크기(교체 이득 판단 기준)
    let current_len = stream.content.len();
    let filter = single_filter(dict)?;

    // 색 공간 판정 (SMask 자체는 호출부에서 이미 제외됨)
    let color_kind = match dict.get(b"ColorSpace") {
        Ok(cs) => resolve_colorspace(doc, cs),
        // DCTDecode는 색 공간이 생략돼도 JPEG 자체에 내장되어 있을 수 있으나,
        // 안전을 위해 RGB로 가정하되 CMYK 오판을 피하려 아래 디코딩 결과로 재확인한다.
        Err(_) => ColorKind::Rgb,
    };

    let (dyn_img, gray) = match filter.as_slice() {
        b"DCTDecode" => {
            // CMYK/Indexed/ICC 등은 건너뛴다.
            if color_kind == ColorKind::Other {
                return None;
            }
            let decoded =
                image::load_from_memory_with_format(&stream.content, ImageFormat::Jpeg).ok()?;
            let gray = matches!(
                decoded.color(),
                image::ColorType::L8 | image::ColorType::L16
            ) || color_kind == ColorKind::Gray;
            (decoded, gray)
        }
        b"FlateDecode" => {
            // 8bit DeviceRGB/DeviceGray 원시 비트맵만 대상으로 한다.
            let channels = match color_kind {
                ColorKind::Rgb => 3usize,
                ColorKind::Gray => 1usize,
                ColorKind::Other => return None,
            };
            let bits = dict.get(b"BitsPerComponent").ok()?.as_i64().ok()?;
            if bits != 8 {
                return None;
            }
            if has_predictor(doc, dict) {
                return None;
            }
            let width = dict.get(b"Width").ok()?.as_i64().ok()? as u32;
            let height = dict.get(b"Height").ok()?.as_i64().ok()? as u32;
            let raw = stream.decompressed_content().ok()?;
            let expected = width as usize * height as usize * channels;
            if width == 0 || height == 0 || raw.len() != expected {
                return None;
            }
            let img = if channels == 3 {
                DynamicImage::ImageRgb8(image::RgbImage::from_raw(width, height, raw)?)
            } else {
                DynamicImage::ImageLuma8(image::GrayImage::from_raw(width, height, raw)?)
            };
            (img, channels == 1)
        }
        // CCITTFaxDecode / JBIG2Decode / JPXDecode / 기타는 건너뛴다.
        _ => return None,
    };

    let img = maybe_downscale(dyn_img, MAX_LONG_SIDE);
    let (width, height) = (img.width(), img.height());
    let content = encode_jpeg(&img, gray, JPEG_QUALITY).ok()?;

    // 재인코딩 결과가 더 작아질 때만 교체한다.
    if content.len() >= current_len {
        return None;
    }

    Some(Replacement {
        content,
        width,
        height,
        gray,
    })
}

/// 압축 본체(동기). 테스트에서 직접 호출할 수 있도록 분리했다.
fn compress_pdf_inner(input: &str) -> Result<String> {
    let mut doc =
        Document::load(input).map_err(|e| AppError::PdfProcessing(e.to_string()))?;

    // 이미지 XObject 후보 수집
    let image_ids: Vec<ObjectId> = doc
        .objects
        .iter()
        .filter_map(|(id, obj)| {
            let stream = obj.as_stream().ok()?;
            let subtype = stream.dict.get(b"Subtype").ok()?.as_name().ok()?;
            if subtype == b"Image" {
                Some(*id)
            } else {
                None
            }
        })
        .collect();

    // SMask로 참조되는 스트림 id 수집 → 알파 채널 손상을 막기 위해 처리 대상에서 제외
    let mut smask_ids: HashSet<ObjectId> = HashSet::new();
    for id in &image_ids {
        if let Ok(stream) = doc.get_object(*id).and_then(|o| o.as_stream()) {
            if let Ok(Object::Reference(r)) = stream.dict.get(b"SMask") {
                smask_ids.insert(*r);
            }
        }
    }

    // 이미지 재인코딩 및 교체
    for id in &image_ids {
        if smask_ids.contains(id) {
            continue;
        }
        let replacement = match build_replacement(&doc, *id) {
            Some(r) => r,
            None => continue,
        };
        if let Ok(stream) = doc.get_object_mut(*id).and_then(|o| o.as_stream_mut()) {
            stream.set_content(replacement.content);
            stream.dict.set("Filter", Object::Name(b"DCTDecode".to_vec()));
            stream.dict.set("Width", Object::Integer(replacement.width as i64));
            stream
                .dict
                .set("Height", Object::Integer(replacement.height as i64));
            stream.dict.set("BitsPerComponent", Object::Integer(8));
            stream.dict.set(
                "ColorSpace",
                Object::Name(
                    if replacement.gray {
                        b"DeviceGray".to_vec()
                    } else {
                        b"DeviceRGB".to_vec()
                    },
                ),
            );
            // 원시 비트맵에서 넘어온 예측자/디코딩 파라미터 잔재 제거
            stream.dict.remove(b"DecodeParms");
            stream.dict.remove(b"DP");
            stream.dict.remove(b"Decode");
        }
    }

    // 필터가 없는 나머지 스트림(콘텐츠 스트림 등)을 FlateDecode로 재압축.
    // 이미 Filter가 지정된 이미지 스트림은 lopdf가 건너뛴다.
    let _ = doc.compress();

    // 출력 경로: 기존 GS 구현과 동일한 명명 규칙(_compressed 접미사 + 중복 회피)
    let input_path = std::path::Path::new(input);
    let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("document");
    let output_path = crate::helpers::find_unique_path(parent, stem, "_compressed", ".pdf");
    let output_str = output_path.to_string_lossy().to_string();

    doc.save(&output_path)
        .map_err(|e| AppError::PdfProcessing(e.to_string()))?;

    // 원본보다 작아지지 않았으면 산출물 삭제 후 에러 반환
    let orig_size = std::fs::metadata(input).map(|m| m.len()).unwrap_or(0);
    let comp_size = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
    if comp_size == 0 || comp_size >= orig_size {
        let _ = std::fs::remove_file(&output_path);
        return Err(AppError::Cancelled(format!(
            "이미 최적화된 PDF입니다. 더 줄일 여지가 없어 압축을 취소했습니다. (원본 {})",
            format_file_size(orig_size)
        )));
    }

    Ok(output_str)
}

/// PDF 압축 Tauri 명령. blocking 작업을 별도 스레드로 위임한다.
#[tauri::command]
pub async fn compress_pdf(input: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || compress_pdf_inner(&input))
        .await
        .map_err(|e| AppError::Internal(format!("PDF 압축 실패: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::dictionary;

    /// 매끄러운 저주파 그라디언트 이미지(JPEG 친화적)를 생성한다.
    /// 픽셀마다 값이 조금씩 달라 FlateDecode 압축률은 낮지만, 완만한 변화라
    /// JPEG로는 매우 작게 압축된다 → 재인코딩 이득을 확정적으로 만든다.
    fn gradient_rgb(width: u32, height: u32) -> Vec<u8> {
        let mut data = Vec::with_capacity((width * height * 3) as usize);
        for y in 0..height {
            for x in 0..width {
                data.push((x * 255 / width.max(1)) as u8);
                data.push((y * 255 / height.max(1)) as u8);
                data.push(((x + y) * 255 / (width + height).max(1)) as u8);
            }
        }
        data
    }

    #[test]
    fn encode_jpeg_produces_valid_smaller_output() {
        // 원시 RGB보다 JPEG가 작아야 하고, 다시 디코딩되어야 한다.
        let (w, h) = (256u32, 256u32);
        let raw = gradient_rgb(w, h);
        let img = DynamicImage::ImageRgb8(image::RgbImage::from_raw(w, h, raw.clone()).unwrap());
        let jpeg = encode_jpeg(&img, false, JPEG_QUALITY).unwrap();

        assert!(jpeg.len() < raw.len(), "JPEG는 원시 RGB보다 작아야 함");
        let decoded = image::load_from_memory_with_format(&jpeg, ImageFormat::Jpeg).unwrap();
        assert_eq!(decoded.width(), w);
        assert_eq!(decoded.height(), h);
    }

    #[test]
    fn maybe_downscale_caps_long_side() {
        let img = DynamicImage::ImageRgb8(image::RgbImage::new(3200, 200));
        let scaled = maybe_downscale(img, MAX_LONG_SIDE);
        assert_eq!(scaled.width(), MAX_LONG_SIDE);
        assert!(scaled.height() <= MAX_LONG_SIDE);
    }

    #[test]
    fn compress_pdf_reencodes_flate_bitmap_and_stays_valid() {
        // FlateDecode 원시 RGB 이미지를 담은 최소 PDF를 만들어 압축 후 재로드 검증.
        let (w, h) = (2000u32, 1400u32);
        let raw = gradient_rgb(w, h);

        let mut src = Document::with_version("1.5");
        let mut img_stream = lopdf::Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => w as i64,
                "Height" => h as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8,
            },
            raw,
        );
        // FlateDecode로 압축하여 실제 PDF 이미지 스트림 형태로 만든다.
        img_stream.compress().unwrap();
        let image_id = src.add_object(img_stream);

        let resources_id = src.add_object(dictionary! {
            "XObject" => dictionary! { "Im0" => image_id },
        });
        let pages_id = src.new_object_id();
        let content_id = src.add_object(lopdf::Stream::new(
            dictionary! {},
            b"q 1 0 0 1 0 0 cm /Im0 Do Q".to_vec(),
        ));
        let page_id = src.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        });
        src.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => vec![page_id.into()],
                "Count" => 1,
            }),
        );
        let catalog_id = src.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        src.trailer.set("Root", catalog_id);

        let dir = std::env::temp_dir();
        let input_path = dir.join(format!("qf_pdf_test_{}.pdf", std::process::id()));
        src.save(&input_path).unwrap();
        let input_str = input_path.to_string_lossy().to_string();
        let orig_size = std::fs::metadata(&input_path).unwrap().len();

        let output_str = compress_pdf_inner(&input_str).expect("압축 성공해야 함");

        // 산출물이 유효한 PDF인지 재로드로 확인
        let out_doc = Document::load(&output_str).expect("산출물은 유효한 PDF여야 함");
        let comp_size = std::fs::metadata(&output_str).unwrap().len();
        assert!(comp_size < orig_size, "압축 결과가 원본보다 작아야 함");

        // 이미지가 DCTDecode(JPEG)로 전환되었는지 확인
        let has_dct = out_doc.objects.values().any(|obj| {
            obj.as_stream()
                .ok()
                .and_then(|s| single_filter(&s.dict))
                .map(|f| f == b"DCTDecode")
                .unwrap_or(false)
        });
        assert!(has_dct, "원시 비트맵이 DCTDecode로 전환되어야 함");

        let _ = std::fs::remove_file(&input_path);
        let _ = std::fs::remove_file(&output_str);
    }
}
