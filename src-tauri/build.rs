fn main() {
  // macOS: QLThumbnailGenerator(QuickLookThumbnailing.framework) 링크 — Finder가 쓰는 최신 썸네일 API
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
    println!("cargo:rustc-link-lib=framework=QuickLookThumbnailing");
  }
  tauri_build::build()
}
