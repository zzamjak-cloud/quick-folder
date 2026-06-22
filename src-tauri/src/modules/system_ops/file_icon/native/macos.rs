use super::super::text::{file_extension, should_use_text_document_icon};

pub(crate) fn get_native_icon_bytes(path: &str, size: u32) -> Option<Vec<u8>> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;

    #[repr(C)]
    struct NSSize {
        width: f64,
        height: f64,
    }

    unsafe {
        let ws_class = Class::get("NSWorkspace")?;
        let workspace: *mut Object = msg_send![ws_class, sharedWorkspace];
        if workspace.is_null() {
            return None;
        }

        let str_class = Class::get("NSString")?;
        let is_dir = std::path::Path::new(path).is_dir();
        let ext = file_extension(path);

        let icon: *mut Object = if should_use_text_document_icon(is_dir, &ext) {
            // 텍스트 기반 문서는 실제 앱 연결 대신 macOS의 .txt 파일 타입 아이콘으로 맞춘다.
            let c_type = CString::new("txt").ok()?;
            let ns_type: *mut Object = msg_send![str_class, stringWithUTF8String: c_type.as_ptr()];
            if ns_type.is_null() {
                return None;
            }
            msg_send![workspace, iconForFileType: ns_type]
        } else {
            let c_path = CString::new(path).ok()?;
            let ns_path: *mut Object = msg_send![str_class, stringWithUTF8String: c_path.as_ptr()];
            if ns_path.is_null() {
                return None;
            }
            msg_send![workspace, iconForFile: ns_path]
        };
        if icon.is_null() {
            return None;
        }

        let target_size = NSSize {
            width: size as f64,
            height: size as f64,
        };
        let _: () = msg_send![icon, setSize: target_size];

        // TIFF → NSBitmapImageRep → PNG
        let tiff_data: *mut Object = msg_send![icon, TIFFRepresentation];
        if tiff_data.is_null() {
            return None;
        }

        let rep_class = Class::get("NSBitmapImageRep")?;
        let bitmap_rep: *mut Object = msg_send![rep_class, imageRepWithData: tiff_data];
        if bitmap_rep.is_null() {
            return None;
        }

        let png_type: usize = 4; // NSBitmapImageFileTypePNG
        let null_dict: *const std::ffi::c_void = std::ptr::null();
        let png_data: *mut Object =
            msg_send![bitmap_rep, representationUsingType: png_type properties: null_dict];
        if png_data.is_null() {
            return None;
        }

        let length: usize = msg_send![png_data, length];
        let bytes_ptr: *const u8 = msg_send![png_data, bytes];
        if bytes_ptr.is_null() || length == 0 {
            return None;
        }

        Some(std::slice::from_raw_parts(bytes_ptr, length).to_vec())
    }
}
