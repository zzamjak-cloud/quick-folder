//! 공용 H.264(mp4) 인코더 후보 체인.
//! 번들 FFmpeg는 LGPL 빌드(libx264/libx265 미포함)이므로 OS 인코더를 1순위로 사용하고,
//! libx264는 시스템/다운로드 ffmpeg(GPL 빌드)가 잡힌 경우를 위한 폴백으로 둔다.

/// 인코더 후보 (라벨은 에러 메시지용)
pub(crate) struct EncoderAttempt {
    pub(crate) label: &'static str,
    pub(crate) video_args: Vec<String>,
}

/// libx264 crf 기준 품질을 각 인코더 파라미터로 매핑해 후보 체인을 만든다.
pub(crate) fn h264_encoder_candidates(crf: u32) -> Vec<EncoderAttempt> {
    let mut list: Vec<EncoderAttempt> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // VideoToolbox: Apple Silicon은 상수 품질(-q:v, 1~100 높을수록 좋음),
        // Intel HW는 -q:v 미지원이라 비트레이트로 지정
        let (qv, bv) = if crf <= 18 {
            ("65", "8M")
        } else if crf <= 23 {
            ("55", "4M")
        } else {
            ("40", "2M")
        };
        let mut args: Vec<String> = vec!["-c:v".into(), "h264_videotoolbox".into()];
        if cfg!(target_arch = "aarch64") {
            args.extend(["-q:v".into(), qv.into()]);
        } else {
            args.extend(["-b:v".into(), bv.into()]);
        }
        args.extend(["-pix_fmt".into(), "yuv420p".into()]);
        list.push(EncoderAttempt {
            label: "h264_videotoolbox",
            video_args: args,
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Media Foundation HW/OS 인코더 (LGPL 빌드 포함).
        // 내부적으로 nv12 입력을 쓰므로 -pix_fmt를 강제하지 않는다.
        let bv = if crf <= 18 {
            "8M"
        } else if crf <= 23 {
            "4M"
        } else {
            "2M"
        };
        list.push(EncoderAttempt {
            label: "h264_mf",
            video_args: vec!["-c:v".into(), "h264_mf".into(), "-b:v".into(), bv.into()],
        });
    }

    // GPL 빌드 ffmpeg가 잡힌 경우만 동작
    list.push(EncoderAttempt {
        label: "libx264",
        video_args: vec![
            "-c:v".into(),
            "libx264".into(),
            "-crf".into(),
            crf.to_string(),
            "-preset".into(),
            "medium".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ],
    });

    // 모든 빌드에 존재하는 최후 폴백
    let qv = if crf <= 18 {
        "3"
    } else if crf <= 23 {
        "5"
    } else {
        "8"
    };
    list.push(EncoderAttempt {
        label: "mpeg4",
        video_args: vec![
            "-c:v".into(),
            "mpeg4".into(),
            "-q:v".into(),
            qv.into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ],
    });

    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_start_with_os_encoder_and_end_with_mpeg4() {
        let list = h264_encoder_candidates(18);
        assert!(list.len() >= 3);
        // 1순위는 libx264가 아니어야 함 (LGPL 번들 대응)
        assert_ne!(list[0].label, "libx264");
        assert!(list.iter().any(|a| a.label == "libx264"));
        assert_eq!(list.last().unwrap().label, "mpeg4");
    }
}
