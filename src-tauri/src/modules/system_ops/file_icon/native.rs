#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod fallback;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub(super) use fallback::get_native_icon_bytes;
#[cfg(target_os = "macos")]
pub(super) use macos::get_native_icon_bytes;
#[cfg(target_os = "windows")]
pub(super) use windows::get_native_icon_bytes;
