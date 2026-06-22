// ffmpeg 시간 문자열 "HH:MM:SS.xx" → 초(f32) 파싱
#[allow(dead_code)]
pub(super) fn parse_ffmpeg_time(time: &str) -> f32 {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() == 3 {
        let h: f32 = parts[0].parse().unwrap_or(0.0);
        let m: f32 = parts[1].parse().unwrap_or(0.0);
        let s: f32 = parts[2].parse().unwrap_or(0.0);
        h * 3600.0 + m * 60.0 + s
    } else {
        0.0
    }
}
