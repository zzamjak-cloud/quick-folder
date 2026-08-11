# Third-Party Notices

QuickFolder는 아래 오픈소스 소프트웨어를 포함하거나 사용합니다.
각 구성 요소는 해당 라이선스 조건에 따라 사용되며, 전체 라이선스 전문은 부록에 수록되어 있습니다.

This product includes open source software components listed below.

## 번들 외부 도구

- **FFmpeg** (GPL 빌드) — https://ffmpeg.org
  - 본 제품에는 공식 배포 채널의 FFmpeg 빌드가 포함됩니다.
    - Windows: https://www.gyan.dev/ffmpeg/builds/ (소스 포함)
    - macOS: https://evermeet.cx/ffmpeg/ (소스 포함)
  - FFmpeg는 별도 프로세스로 실행되며, 본 제품과 정적/동적으로 링크되지 않습니다.
  - 원본 소스: https://ffmpeg.org/releases/
  - 번들 빌드를 사용할 수 없는 경우 사용자 동의 후 위 공식 배포 채널
    (Windows 폴백: https://github.com/BtbN/FFmpeg-Builds )에서 런타임에 다시 다운로드할 수 있습니다.

> Ghostscript(AGPL-3.0) 의존은 2026-07 제거되었습니다. PDF 압축은 자체 Rust 구현으로 동작합니다.

## 선택 설치 구성 요소 (폰트 병합 기능)

- **CPython** (PSF License) — python-build-standalone 빌드, https://github.com/indygreg/python-build-standalone
- **fontTools** (MIT License) — https://github.com/fonttools/fonttools

## JavaScript 구성 요소 (100개)

| 패키지 | 버전 | 라이선스 | 저작권/저자 |
|---|---|---|---|
| [@dnd-kit/accessibility](https://github.com/clauderic/dnd-kit) | 3.1.1 | MIT | Copyright (c) 2021, Claudéric Demers |
| [@dnd-kit/core](https://github.com/clauderic/dnd-kit) | 6.3.1 | MIT | Copyright (c) 2021, Claudéric Demers |
| [@dnd-kit/sortable](https://github.com/clauderic/dnd-kit) | 10.0.0 | MIT | Copyright (c) 2021, Claudéric Demers |
| [@dnd-kit/utilities](https://github.com/clauderic/dnd-kit) | 3.2.2 | MIT | Copyright (c) 2021, Claudéric Demers |
| [@floating-ui/core](https://github.com/floating-ui/floating-ui) | 1.7.5 | MIT | Copyright (c) 2021-present Floating UI contributors |
| [@floating-ui/dom](https://github.com/floating-ui/floating-ui) | 1.7.6 | MIT | Copyright (c) 2021-present Floating UI contributors |
| [@floating-ui/utils](https://github.com/floating-ui/floating-ui) | 0.2.11 | MIT | Copyright (c) 2021-present Floating UI contributors |
| [@mixmark-io/domino](https://github.com/mixmark-io/domino) | 2.2.0 | BSD-2-Clause | Copyright (c) 2011 The Mozilla Foundation. |
| [@napi-rs/canvas-darwin-arm64](https://github.com/Brooooooklyn/canvas) | 0.1.97 | MIT |  |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) | 0.1.97 | MIT | Copyright (c) 2020 lynweklm@gmail.com |
| [@remirror/core-constants](https://github.com/remirror/remirror) | 3.0.0 | MIT | Copyright (c) 2019-2022, Remirror Contributors |
| [@tauri-apps/api](https://github.com/tauri-apps/tauri) | 2.10.1 | Apache-2.0 OR MIT |  |
| [@tauri-apps/plugin-clipboard-manager](https://github.com/tauri-apps/plugins-workspace) | 2.3.2 | MIT OR Apache-2.0 |  |
| [@tauri-apps/plugin-dialog](https://github.com/tauri-apps/plugins-workspace) | 2.6.0 | MIT OR Apache-2.0 |  |
| [@tauri-apps/plugin-opener](https://github.com/tauri-apps/plugins-workspace) | 2.5.2 | MIT OR Apache-2.0 |  |
| [@tauri-apps/plugin-process](https://github.com/tauri-apps/plugins-workspace) | 2.3.1 | MIT OR Apache-2.0 |  |
| [@tauri-apps/plugin-updater](https://github.com/tauri-apps/plugins-workspace) | 2.10.0 | MIT OR Apache-2.0 |  |
| [@tiptap/core](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-blockquote](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-bold](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-bubble-menu](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-bullet-list](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-code-block](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-code](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-document](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-dropcursor](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-floating-menu](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-gapcursor](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-hard-break](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-heading](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-horizontal-rule](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-italic](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-link](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-list-item](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-list-keymap](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-list](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-ordered-list](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-paragraph](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-placeholder](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-strike](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-task-item](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-task-list](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-text](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extension-underline](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/extensions](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/pm](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/react](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@tiptap/starter-kit](https://github.com/ueberdosis/tiptap) | 3.20.4 | MIT | Copyright (c) 2025, Tiptap GmbH |
| [@types/linkify-it](https://github.com/DefinitelyTyped/DefinitelyTyped) | 5.0.0 | MIT | Copyright (c) Microsoft Corporation. |
| [@types/markdown-it](https://github.com/DefinitelyTyped/DefinitelyTyped) | 14.1.2 | MIT | Copyright (c) Microsoft Corporation. |
| [@types/mdurl](https://github.com/DefinitelyTyped/DefinitelyTyped) | 2.0.0 | MIT | Copyright (c) Microsoft Corporation. |
| [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.2.3 | MIT | Copyright (c) Microsoft Corporation. |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.2.14 | MIT | Copyright (c) Microsoft Corporation. |
| [@types/use-sync-external-store](https://github.com/DefinitelyTyped/DefinitelyTyped) | 0.0.6 | MIT | Copyright (c) Microsoft Corporation. |
| [argparse](https://github.com/nodeca/argparse) | 2.0.1 | Python-2.0 | Copyright (c) 1991 - 1995, Stichting Mathematisch Centrum Amsterdam, |
| [crelt](https://github.com/marijnh/crelt) | 1.0.6 | MIT | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> |
| [csstype](https://github.com/frenic/csstype) | 3.2.3 | MIT | Copyright (c) 2017-2018 Fredrik Nicol |
| [entities](https://github.com/fb55/entities) | 4.5.0 | BSD-2-Clause | Copyright (c) Felix Böhm |
| [escape-string-regexp](https://github.com/sindresorhus/escape-string-regexp) | 4.0.0 | MIT | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) |
| [fast-equals](https://github.com/planttheidea/fast-equals) | 5.4.0 | MIT | Copyright (c) 2025 Tony Quetano |
| [highlight.js](https://github.com/highlightjs/highlight.js) | 11.11.1 | BSD-3-Clause | Copyright (c) 2006, Ivan Sagalaev. |
| [linkify-it](https://github.com/markdown-it/linkify-it) | 5.0.0 | MIT | Copyright (c) 2015 Vitaly Puzrin. |
| [linkifyjs](https://github.com/nfrasser/linkifyjs) | 4.3.2 | MIT | Copyright (c) 2024 Nick Frasser |
| [lucide-react](https://github.com/lucide-icons/lucide) | 0.561.0 | ISC | Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide  |
| [markdown-it](https://github.com/markdown-it/markdown-it) | 14.1.1 | MIT | Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin. |
| [marked](https://github.com/markedjs/marked) | 17.0.5 | MIT | Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/) |
| [mdurl](https://github.com/markdown-it/mdurl) | 2.0.0 | MIT | Copyright (c) 2015 Vitaly Puzrin, Alex Kocharin. |
| [node-readable-to-web-readable-stream](https://github.com/Borewit/node-readable-to-web-readable-stream) | 0.4.2 | MIT | Copyright (c) 2025 Borewit |
| [orderedmap](https://github.com/marijnh/orderedmap) | 2.1.1 | MIT | Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [pdfjs-dist](https://github.com/mozilla/pdf.js) | 5.6.205 | Apache-2.0 | copyright notice that is included in or attached to the work |
| [prosemirror-changeset](https://github.com/prosemirror/prosemirror-changeset) | 2.4.0 | MIT | Copyright (C) 2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-collab](https://github.com/prosemirror/prosemirror-collab) | 1.3.1 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-commands](https://github.com/prosemirror/prosemirror-commands) | 1.7.1 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-dropcursor](https://github.com/prosemirror/prosemirror-dropcursor) | 1.8.2 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-gapcursor](https://github.com/prosemirror/prosemirror-gapcursor) | 1.4.1 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-history](https://github.com/prosemirror/prosemirror-history) | 1.5.0 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-inputrules](https://github.com/prosemirror/prosemirror-inputrules) | 1.5.1 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-keymap](https://github.com/prosemirror/prosemirror-keymap) | 1.2.3 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-markdown](https://github.com/prosemirror/prosemirror-markdown) | 1.13.4 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-menu](https://github.com/prosemirror/prosemirror-menu) | 1.3.0 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-model](https://github.com/prosemirror/prosemirror-model) | 1.25.4 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-schema-basic](https://github.com/prosemirror/prosemirror-schema-basic) | 1.2.4 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-schema-list](https://github.com/prosemirror/prosemirror-schema-list) | 1.5.1 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-state](https://github.com/prosemirror/prosemirror-state) | 1.4.4 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-tables](https://github.com/ProseMirror/prosemirror-tables) | 1.8.5 | MIT | Copyright (C) 2015-2016 by Marijn Haverbeke <marijnh@gmail.com> and others |
| [prosemirror-trailing-node](https://github.com/remirror/remirror) | 3.0.0 | MIT | Copyright (c) 2019-2022, Remirror Contributors |
| [prosemirror-transform](https://github.com/prosemirror/prosemirror-transform) | 1.11.0 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [prosemirror-view](https://github.com/prosemirror/prosemirror-view) | 1.41.7 | MIT | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| [punycode.js](https://github.com/mathiasbynens/punycode.js) | 2.3.1 | MIT | Copyright Mathias Bynens <https://mathiasbynens.be/> |
| [react-dom](https://github.com/facebook/react) | 19.2.3 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [react](https://github.com/facebook/react) | 19.2.3 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [rope-sequence](https://github.com/marijnh/rope-sequence) | 1.3.4 | MIT | Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> |
| [scheduler](https://github.com/facebook/react) | 0.27.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [three](https://github.com/mrdoob/three.js) | 0.183.2 | MIT | Copyright © 2010-2026 three.js authors |
| [tslib](https://github.com/Microsoft/tslib) | 2.8.1 | 0BSD | Copyright (c) Microsoft Corporation. |
| [turndown](https://github.com/mixmark-io/turndown) | 7.2.2 | MIT | Copyright (c) 2017 Dom Christie |
| [uc.micro](https://github.com/markdown-it/uc.micro) | 2.1.0 | MIT | Copyright Mathias Bynens <https://mathiasbynens.be/> |
| [use-sync-external-store](https://github.com/facebook/react) | 1.6.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [uuid](https://github.com/uuidjs/uuid) | 13.0.0 | MIT | Copyright (c) 2010-2020 Robert Kieffer and other contributors |
| [w3c-keyname](https://github.com/marijnh/w3c-keyname) | 2.2.8 | MIT | Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |

## Rust 구성 요소 (675개)

| 패키지 | 버전 | 라이선스 | 저작권/저자 |
|---|---|---|---|
| [adler2](https://github.com/oyvindln/adler2) | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [adler32](https://github.com/remram44/adler32-rs) | 1.2.0 | Zlib | Copyright notice for the Rust port: |
| [aes](https://github.com/RustCrypto/block-ciphers) | 0.8.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [ahash](https://github.com/tkaitchuck/ahash) | 0.7.8 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [aho-corasick](https://github.com/BurntSushi/aho-corasick) | 1.1.4 | Unlicense OR MIT | Copyright (c) 2015 Andrew Gallant |
| [alloc-no-stdlib](https://github.com/dropbox/rust-alloc-no-stdlib) | 2.0.4 | BSD-3-Clause | Copyright (c) 2016 Dropbox, Inc. |
| [alloc-stdlib](https://github.com/dropbox/rust-alloc-no-stdlib) | 0.2.2 | BSD-3-Clause | Daniel Reiter Horn <danielrh@dropbox.com> |
| [android_log-sys](https://github.com/rust-mobile/android_log-sys-rs) | 0.3.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [android_logger](https://github.com/rust-mobile/android_logger-rs) | 0.15.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [android_system_properties](https://github.com/nical/android_system_properties) | 0.1.5 | MIT/Apache-2.0 | Copyright 2016 Nicolas Silva |
| [anyhow](https://github.com/dtolnay/anyhow) | 1.0.101 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [arbitrary](https://github.com/rust-fuzz/arbitrary/) | 1.4.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [arboard](https://github.com/1Password/arboard) | 3.6.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [arrayvec](https://github.com/bluss/arrayvec) | 0.7.6 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [async-broadcast](https://github.com/smol-rs/async-broadcast) | 0.7.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [async-channel](https://github.com/smol-rs/async-channel) | 2.5.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [async-executor](https://github.com/smol-rs/async-executor) | 1.14.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [async-io](https://github.com/smol-rs/async-io) | 2.6.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [async-lock](https://github.com/smol-rs/async-lock) | 3.4.2 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [async-process](https://github.com/smol-rs/async-process) | 2.5.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [async-recursion](https://github.com/dcchut/async-recursion) | 1.1.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [async-signal](https://github.com/smol-rs/async-signal) | 0.2.13 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [async-task](https://github.com/smol-rs/async-task) | 4.7.1 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [async-trait](https://github.com/dtolnay/async-trait) | 0.1.89 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [atk](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [atk-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [atomic-waker](https://github.com/smol-rs/atomic-waker) | 1.1.2 | Apache-2.0 OR MIT | Copyright (c) 2016 Alex Crichton |
| [autocfg](https://github.com/cuviper/autocfg) | 1.5.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [base64](https://github.com/marshallpierce/rust-base64) | 0.21.7 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [base64](https://github.com/marshallpierce/rust-base64) | 0.22.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [bitflags](https://github.com/bitflags/bitflags) | 1.3.2 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [bitflags](https://github.com/bitflags/bitflags) | 2.11.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [bitvec](https://github.com/bitvecto-rs/bitvec) | 1.0.1 | MIT | Copyright (c) 2018 myrrlyn (Alexander Payne) |
| [block](http://github.com/SSheldon/rust-block) | 0.1.6 | MIT | Steven Sheldon |
| [block-buffer](https://github.com/RustCrypto/utils) | 0.10.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [block-padding](https://github.com/RustCrypto/utils) | 0.3.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [block2](https://github.com/madsmtm/objc2) | 0.6.2 | MIT | Mads Marquart <mads@marquart.dk> |
| [blocking](https://github.com/smol-rs/blocking) | 1.6.2 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [borsh](https://github.com/near/borsh-rs) | 1.6.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [borsh-derive](https://github.com/near/borsh-rs) | 1.6.0 | Apache-2.0 | copyright notice that is included in or attached to the work |
| [brotli](https://github.com/dropbox/rust-brotli) | 8.0.2 | BSD-3-Clause AND MIT | Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors. |
| [brotli-decompressor](https://github.com/dropbox/rust-brotli-decompressor) | 5.0.0 | BSD-3-Clause/MIT | Copyright (c) 2016 Dropbox, Inc. |
| [bumpalo](https://github.com/fitzgen/bumpalo) | 3.19.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [byte-unit](https://github.com/magiclen/byte-unit) | 5.2.0 | MIT | Copyright (c) 2023 magiclen.org (Ron Li) |
| [bytecheck](https://github.com/djkoloski/bytecheck) | 0.6.12 | MIT | Copyright 2020 David Koloski |
| [bytecheck_derive](https://github.com/djkoloski/bytecheck) | 0.6.12 | MIT | Copyright 2020 David Koloski |
| [bytemuck](https://github.com/Lokathor/bytemuck) | 1.25.0 | Zlib OR Apache-2.0 OR MIT | Copyright [yyyy] [name of copyright owner] |
| [byteorder](https://github.com/BurntSushi/byteorder) | 1.5.0 | Unlicense OR MIT | Copyright (c) 2015 Andrew Gallant |
| [byteorder-lite](https://github.com/image-rs/byteorder-lite) | 0.1.0 | Unlicense OR MIT | Copyright (c) 2015 Andrew Gallant |
| [bytes](https://github.com/tokio-rs/bytes) | 1.11.1 | MIT | Copyright (c) 2018 Carl Lerche |
| [bzip2](https://github.com/trifectatechfoundation/bzip2-rs) | 0.5.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [bzip2-sys](https://github.com/alexcrichton/bzip2-rs) | 0.1.13+1.0.8 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [cairo-rs](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | MIT | The gtk-rs Project Developers |
| [cairo-sys-rs](https://github.com/gtk-rs/gtk-rs-core) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [camino](https://github.com/camino-rs/camino) | 1.2.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [cargo-platform](https://github.com/rust-lang/cargo) | 0.1.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [cargo_metadata](https://github.com/oli-obk/cargo_metadata) | 0.19.2 | MIT | Oliver Schneider <git-spam-no-reply9815368754983@oli-obk.de> |
| [cargo_toml](https://gitlab.com/lib.rs/cargo_toml) | 0.22.3 | Apache-2.0 OR MIT | © Kornel Lesiński |
| [cc](https://github.com/rust-lang/cc-rs) | 1.2.56 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [cesu8](https://github.com/emk/cesu8-rs) | 1.1.0 | Apache-2.0/MIT | Eric Kidd <git@randomhacks.net> |
| [cfb](https://github.com/mdsteele/rust-cfb) | 0.7.3 | MIT | Copyright (c) 2017 Matthew D. Steele |
| [cfb](https://github.com/mdsteele/rust-cfb) | 0.14.0 | MIT | Copyright (c) 2017 Matthew D. Steele |
| [cfg-expr](https://github.com/EmbarkStudios/cfg-expr) | 0.15.8 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [cfg-if](https://github.com/rust-lang/cfg-if) | 1.0.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [cfg_aliases](https://github.com/katharostech/cfg_aliases) | 0.2.1 | MIT | Copyright (c) 2020 Katharos Technology |
| [chrono](https://github.com/chronotope/chrono) | 0.4.43 | MIT OR Apache-2.0 | Copyright (c) 2014, Kang Seonghoon. |
| [cipher](https://github.com/RustCrypto/traits) | 0.4.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [clipboard-win](https://github.com/DoumanAsh/clipboard-win) | 5.4.1 | BSL-1.0 | Douman <douman@gmx.se> |
| [cocoa](https://github.com/servo/core-foundation-rs) | 0.26.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [cocoa-foundation](https://github.com/servo/core-foundation-rs) | 0.2.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [color_quant](https://github.com/image-rs/color_quant.git) | 1.1.0 | MIT | Copyright (c) 2016 PistonDevelopers |
| [combine](https://github.com/Marwes/combine) | 4.6.7 | MIT | Copyright (c) 2015 Markus Westerlind |
| [concurrent-queue](https://github.com/smol-rs/concurrent-queue) | 2.5.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [constant_time_eq](https://github.com/cesarb/constant_time_eq) | 0.3.1 | CC0-1.0 OR MIT-0 OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [convert_case](https://github.com/rutrum/convert-case) | 0.4.0 | MIT | David Purdum <purdum41@gmail.com> |
| [cookie](https://github.com/SergioBenitez/cookie-rs) | 0.18.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [core-foundation](https://github.com/servo/core-foundation-rs) | 0.10.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [core-foundation-sys](https://github.com/servo/core-foundation-rs) | 0.8.7 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [core-graphics](https://github.com/servo/core-foundation-rs) | 0.24.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [core-graphics-types](https://github.com/servo/core-foundation-rs) | 0.2.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [cpufeatures](https://github.com/RustCrypto/utils) | 0.2.17 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [crc](https://github.com/mrhooray/crc-rs.git) | 3.4.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [crc-catalog](https://github.com/akhilles/crc-catalog.git) | 2.5.0 | MIT OR Apache-2.0 | Akhil Velagapudi <akhilvelagapudi@gmail.com> |
| [crc32fast](https://github.com/srijs/rust-crc32fast) | 1.5.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [crossbeam-channel](https://github.com/crossbeam-rs/crossbeam) | 0.5.15 | MIT OR Apache-2.0 | COPYRIGHT AND/OR OTHER APPLICABLE LAW. ANY USE OF THE WORK OTHER THAN AS |
| [crossbeam-deque](https://github.com/crossbeam-rs/crossbeam) | 0.8.6 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [crossbeam-epoch](https://github.com/crossbeam-rs/crossbeam) | 0.9.18 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [crossbeam-utils](https://github.com/crossbeam-rs/crossbeam) | 0.8.21 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [crunchy](https://github.com/eira-fransham/crunchy) | 0.2.4 | MIT | Copyright 2017-2023 Eira Fransham. |
| [crypto-common](https://github.com/RustCrypto/traits) | 0.1.7 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [cssparser](https://github.com/servo/rust-cssparser) | 0.29.6 | MPL-2.0 | (c) under Patent Claims infringed by Covered Software in the absence of |
| [cssparser-macros](https://github.com/servo/rust-cssparser) | 0.6.1 | MPL-2.0 | (c) under Patent Claims infringed by Covered Software in the absence of |
| [ctor](https://github.com/mmastrac/rust-ctor) | 0.2.9 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [darling](https://github.com/TedDriggs/darling) | 0.21.3 | MIT | Copyright (c) 2017 Ted Driggs |
| [darling_core](https://github.com/TedDriggs/darling) | 0.21.3 | MIT | Copyright (c) 2017 Ted Driggs |
| [darling_macro](https://github.com/TedDriggs/darling) | 0.21.3 | MIT | Copyright (c) 2017 Ted Driggs |
| [deflate](https://github.com/image-rs/deflate-rs) | 0.8.6 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [deflate64](https://github.com/anatawa12/deflate64-rs) | 0.1.12 | MIT | Copyright (c) .NET Foundation and Contributors |
| [deranged](https://github.com/jhpratt/deranged) | 0.5.6 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [derive_arbitrary](https://github.com/rust-fuzz/arbitrary) | 1.4.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [derive_more](https://github.com/JelteF/derive_more) | 0.99.20 | MIT | Copyright (c) 2016 Jelte Fennema |
| [digest](https://github.com/RustCrypto/traits) | 0.10.7 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [dirs](https://github.com/soc/dirs-rs) | 6.0.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [dirs-sys](https://github.com/dirs-dev/dirs-sys-rs) | 0.5.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [dispatch](http://github.com/SSheldon/rust-dispatch) | 0.2.0 | MIT | Steven Sheldon |
| [dispatch2](https://github.com/madsmtm/objc2) | 0.3.0 | Zlib OR Apache-2.0 OR MIT | Mads Marquart <mads@marquart.dk>, Mary <mary@mary.zone> |
| [displaydoc](https://github.com/yaahc/displaydoc) | 0.2.5 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [dlopen2](https://github.com/OpenByteDev/dlopen2) | 0.8.2 | MIT | Szymon Wieloch <szymon.wieloch@gmail.com>, Ahmed Masud <ahmed.masud@saf.ai>, OpenByte <development.openbyte@gmail.com> |
| [dlopen2_derive](https://github.com/OpenByteDev/dlopen2) | 0.4.3 | MIT | Szymon Wieloch <szymon.wieloch@gmail.com>, OpenByte <development.openbyte@gmail.com> |
| [downcast-rs](https://github.com/marcianx/downcast-rs) | 1.2.1 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [dpi](https://github.com/rust-windowing/winit) | 0.1.2 | Apache-2.0 AND MIT | copyright notice that is included in or attached to the work |
| drag | 2.1.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [dtoa](https://github.com/dtolnay/dtoa) | 1.0.11 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [dtoa-short](https://github.com/upsuper/dtoa-short) | 0.3.5 | MPL-2.0 | (c) under Patent Claims infringed by Covered Software in the absence of |
| [dunce](https://gitlab.com/kornelski/dunce) | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | Kornel <kornel@geekhood.net> |
| [dyn-clone](https://github.com/dtolnay/dyn-clone) | 1.0.20 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [ecb](https://github.com/magic-akari/ecb) | 0.1.2 | MIT | Copyright (c) magic-akari |
| [either](https://github.com/rayon-rs/either) | 1.15.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [embed-resource](https://github.com/nabijaczleweli/rust-embed-resource) | 3.0.6 | MIT | Copyright (c) 2017 nabijaczleweli |
| [embed_plist](https://github.com/nvzqz/embed-plist-rs) | 1.2.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [encoding_rs](https://github.com/hsivonen/encoding_rs) | 0.8.35 | (Apache-2.0 OR MIT) AND BSD-3-Clause | copyright notice that is included in or attached to the work |
| [endi](https://github.com/zeenix/endi) | 1.1.1 | MIT | Zeeshan Ali Khan <zeenix@gmail.com> |
| [enumflags2](https://github.com/meithecatte/enumflags2) | 0.7.12 | MIT OR Apache-2.0 | Copyright 2017-2023 Maik Klein, Maja Kądziołka |
| [enumflags2_derive](https://github.com/meithecatte/enumflags2) | 0.7.12 | MIT OR Apache-2.0 | Copyright [2017] [Maik Klein] |
| [env_filter](https://github.com/rust-cli/env_logger) | 0.1.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [equivalent](https://github.com/indexmap-rs/equivalent) | 1.0.2 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [erased-serde](https://github.com/dtolnay/erased-serde) | 0.4.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [errno](https://github.com/lambda-fairy/rust-errno) | 0.3.14 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [error-code](https://github.com/DoumanAsh/error-code) | 3.3.2 | BSL-1.0 | Douman <douman@gmx.se> |
| [event-listener](https://github.com/smol-rs/event-listener) | 5.4.1 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [event-listener-strategy](https://github.com/smol-rs/event-listener-strategy) | 0.5.4 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [fastrand](https://github.com/smol-rs/fastrand) | 2.3.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [fax](https://github.com/pdf-rs/fax) | 0.2.6 | MIT | Sebastian K <s3bk@protonmail.com> |
| [fax_derive](https://github.com/pdf-rs/fax) | 0.2.0 | MIT | Sebastian K <s3bk@protonmail.com> |
| [fdeflate](https://github.com/image-rs/fdeflate) | 0.3.7 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [fern](https://github.com/daboross/fern) | 0.7.1 | MIT | Copyright (c) 2014-2017 David Ross |
| [ffmpeg-sidecar](https://github.com/nathanbabcock/ffmpeg-sidecar) | 2.4.0 | MIT | Copyright (c) 2023 Nathan Babcock |
| [field-offset](https://github.com/Diggsey/rust-field-offset) | 0.3.6 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [filetime](https://github.com/alexcrichton/filetime) | 0.2.27 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [find-msvc-tools](https://github.com/rust-lang/cc-rs) | 0.1.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [fixedbitset](https://github.com/petgraph/fixedbitset) | 0.5.7 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [flate2](https://github.com/rust-lang/flate2-rs) | 1.1.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [fnv](https://github.com/servo/rust-fnv) | 1.0.7 | Apache-2.0 / MIT | copyright notice that is included in or attached to the work |
| [foldhash](https://github.com/orlp/foldhash) | 0.1.5 | Zlib | Copyright (c) 2024 Orson Peters |
| [foreign-types](https://github.com/sfackler/foreign-types) | 0.5.0 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [foreign-types-macros](https://github.com/sfackler/foreign-types) | 0.2.3 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [foreign-types-shared](https://github.com/sfackler/foreign-types) | 0.3.1 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [form_urlencoded](https://github.com/servo/rust-url) | 1.2.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [funty](https://github.com/myrrlyn/funty) | 2.0.0 | MIT | Copyright (c) 2020 myrrlyn (Alexander Payne) |
| [futf](https://github.com/servo/futf) | 0.1.5 | MIT / Apache-2.0 | copyright notice that is included in or attached to the work |
| [futures-channel](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [futures-core](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [futures-executor](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [futures-io](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [futures-lite](https://github.com/smol-rs/futures-lite) | 2.6.1 | Apache-2.0 OR MIT | Copyright (c) 2016 Alex Crichton |
| [futures-macro](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [futures-sink](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [futures-task](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [futures-util](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [fxhash](https://github.com/cbreeden/fxhash) | 0.2.1 | Apache-2.0/MIT | cbreeden <github@u.breeden.cc> |
| [gdk](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [gdk-pixbuf](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | MIT | The gtk-rs Project Developers |
| [gdk-pixbuf-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.0 | MIT | The gtk-rs Project Developers |
| [gdk-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [gdkwayland-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [gdkx11](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [gdkx11-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [generic-array](https://github.com/fizyk20/generic-array.git) | 0.14.7 | MIT | Copyright (c) 2015 Bartłomiej Kamiński |
| [gethostname](https://codeberg.org/swsnr/gethostname.rs.git) | 1.1.0 | Apache-2.0 | copyright notice that is included in or attached to the work |
| [getrandom](https://github.com/rust-random/getrandom) | 0.1.16 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [getrandom](https://github.com/rust-random/getrandom) | 0.2.17 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [getrandom](https://github.com/rust-random/getrandom) | 0.3.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [getrandom](https://github.com/rust-random/getrandom) | 0.4.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [gif](https://github.com/image-rs/image-gif) | 0.14.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [gio](https://github.com/gtk-rs/gtk-rs-core) | 0.18.4 | MIT | The gtk-rs Project Developers |
| [gio-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.1 | MIT | The gtk-rs Project Developers |
| [glib](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | MIT | The gtk-rs Project Developers |
| [glib-macros](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | MIT | The gtk-rs Project Developers |
| [glib-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.1 | MIT | The gtk-rs Project Developers |
| [glob](https://github.com/rust-lang/glob) | 0.3.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [gobject-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.0 | MIT | The gtk-rs Project Developers |
| [gtk](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [gtk-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [gtk3-macros](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | The gtk-rs Project Developers |
| [half](https://github.com/VoidStarKat/half-rs) | 2.7.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [hashbrown](https://github.com/rust-lang/hashbrown) | 0.12.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [hashbrown](https://github.com/rust-lang/hashbrown) | 0.15.5 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [hashbrown](https://github.com/rust-lang/hashbrown) | 0.16.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [heck](https://github.com/withoutboats/heck) | 0.4.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [heck](https://github.com/withoutboats/heck) | 0.5.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [hermit-abi](https://github.com/hermit-os/hermit-rs) | 0.5.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [hex](https://github.com/KokaKiwi/rust-hex) | 0.4.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [hmac](https://github.com/RustCrypto/MACs) | 0.12.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [html5ever](https://github.com/servo/html5ever) | 0.29.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [http](https://github.com/hyperium/http) | 1.4.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [http-body](https://github.com/hyperium/http-body) | 1.0.1 | MIT | Copyright (c) 2019-2024 Sean McArthur & Hyper Contributors |
| [http-body-util](https://github.com/hyperium/http-body) | 0.1.3 | MIT | Copyright (c) 2019-2025 Sean McArthur & Hyper Contributors |
| [http-range](https://github.com/bancek/rust-http-range.git) | 0.1.5 | MIT | Copyright (c) 2016 Luka Zakrajšek |
| [httparse](https://github.com/seanmonstar/httparse) | 1.10.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [hwarang](https://github.com/teammilestone/hwarang) | 0.2.0 | MIT | Copyright (c) 2025 Lee Wonsup (이원섭) <onesup.lee@gmail.com> |
| [hyper](https://github.com/hyperium/hyper) | 1.8.1 | MIT | Copyright (c) 2014-2025 Sean McArthur |
| [hyper-rustls](https://github.com/rustls/hyper-rustls) | 0.27.7 | Apache-2.0 OR ISC OR MIT | copyright notice that is included in or attached to the work |
| [hyper-util](https://github.com/hyperium/hyper-util) | 0.1.20 | MIT | Copyright (c) 2023-2025 Sean McArthur |
| [iana-time-zone](https://github.com/strawlab/iana-time-zone) | 0.1.65 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [iana-time-zone-haiku](https://github.com/strawlab/iana-time-zone) | 0.1.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [icns](https://github.com/mdsteele/rust-icns) | 0.3.1 | MIT | Copyright (c) 2016 Matthew D. Steele |
| [ico](https://github.com/mdsteele/rust-ico) | 0.3.0 | MIT | Copyright (c) 2018 Matthew D. Steele |
| [ico](https://github.com/mdsteele/rust-ico) | 0.5.0 | MIT | Copyright (c) 2018 Matthew D. Steele |
| [icu_collections](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [icu_locale_core](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [icu_normalizer](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [icu_normalizer_data](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [icu_properties](https://github.com/unicode-org/icu4x) | 2.1.2 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [icu_properties_data](https://github.com/unicode-org/icu4x) | 2.1.2 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [icu_provider](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [id-arena](https://github.com/fitzgen/id-arena) | 2.3.0 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [ident_case](https://github.com/TedDriggs/ident_case) | 1.0.1 | MIT/Apache-2.0 | Ted Driggs <ted.driggs@outlook.com> |
| [idna](https://github.com/servo/rust-url/) | 1.1.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [idna_adapter](https://github.com/hsivonen/idna_adapter) | 1.2.1 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [image](https://github.com/image-rs/image) | 0.25.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [image-webp](https://github.com/image-rs/image-webp) | 0.2.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [indexmap](https://github.com/bluss/indexmap) | 1.9.3 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [indexmap](https://github.com/indexmap-rs/indexmap) | 2.13.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [infer](https://github.com/bojand/infer) | 0.19.0 | MIT | Copyright (c) 2019 Bojan |
| [inout](https://github.com/RustCrypto/utils) | 0.1.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [ipnet](https://github.com/krisprice/ipnet) | 2.11.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [iri-string](https://github.com/lo48576/iri-string) | 0.7.10 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [is-docker](https://github.com/TheLarkInn/is-docker) | 0.2.0 | MIT | Copyright (c) 2023 Sean Larkin |
| [is-wsl](https://github.com/TheLarkInn/is-wsl) | 0.4.0 | MIT | Copyright (c) 2023 Sean Larkin |
| [itoa](https://github.com/dtolnay/itoa) | 1.0.17 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [javascriptcore-rs](https://github.com/tauri-apps/javascriptcore-rs) | 1.1.2 | MIT | Copyright (c) 2013-2021, The Gtk-rs Project Developers. |
| [javascriptcore-rs-sys](https://github.com/tauri-apps/javascriptcore-rs) | 1.1.1 | MIT | Copyright (c) 2013-2017, The Gtk-rs Project Developers. |
| [jni](https://github.com/jni-rs/jni-rs) | 0.21.1 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [jni-sys](https://github.com/sfackler/rust-jni-sys) | 0.3.0 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [jobserver](https://github.com/rust-lang/jobserver-rs) | 0.1.34 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [js-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys) | 0.3.85 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [json-patch](https://github.com/idubrov/json-patch) | 3.0.1 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [jsonptr](https://github.com/chanced/jsonptr) | 0.6.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [keyboard-types](https://github.com/pyfisch/keyboard-types) | 0.7.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [kuchikiki](https://github.com/brave/kuchikiki) | 0.8.8-speedreader | MIT | Brave Authors, Ralph Giles <rgiles@brave.com>, Simon Sapin <simon.sapin@exyr.org> |
| [lazy_static](https://github.com/rust-lang-nursery/lazy-static.rs) | 1.5.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [leb128fmt](https://github.com/bluk/leb128fmt) | 0.1.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| libappindicator | 0.9.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| libappindicator-sys | 0.9.0 | Apache-2.0 OR MIT |  |
| [libc](https://github.com/rust-lang/libc) | 0.2.182 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [libloading](https://github.com/nagisa/rust_libloading/) | 0.7.4 | ISC | Copyright © 2015, Simonas Kazlauskas |
| [libredox](https://gitlab.redox-os.org/redox-os/libredox.git) | 0.1.12 | MIT | Copyright (c) 2023 4lDO2 |
| [linux-raw-sys](https://github.com/sunfishcode/linux-raw-sys) | 0.11.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [litemap](https://github.com/unicode-org/icu4x) | 0.8.1 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [lock_api](https://github.com/Amanieu/parking_lot) | 0.4.14 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [log](https://github.com/rust-lang/log) | 0.4.29 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [lzma-rs](https://github.com/gendx/lzma-rs) | 0.3.0 | MIT | Copyright (c) 2017 - 2018  Guillaume Endignoux |
| [lzma-sys](https://github.com/alexcrichton/xz2-rs) | 0.1.20 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [mac](https://github.com/reem/rust-mac.git) | 0.1.1 | MIT/Apache-2.0 | Jonathan Reem <jonathan.reem@gmail.com> |
| [malloc_buf](https://github.com/SSheldon/malloc_buf) | 0.0.6 | MIT | Steven Sheldon |
| [markup5ever](https://github.com/servo/html5ever) | 0.14.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [match_token](https://github.com/servo/html5ever) | 0.1.0 | MIT OR Apache-2.0 |  |
| [matches](https://github.com/SimonSapin/rust-std-candidates) | 0.1.10 | MIT | Copyright (c) 2014-2016 Simon Sapin |
| [memchr](https://github.com/BurntSushi/memchr) | 2.8.0 | Unlicense OR MIT | Copyright (c) 2015 Andrew Gallant |
| [memoffset](https://github.com/Gilnaa/memoffset) | 0.9.1 | MIT | Copyright (c) 2017 Gilad Naaman |
| [mime](https://github.com/hyperium/mime) | 0.3.17 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [minisign-verify](https://github.com/jedisct1/rust-minisign-verify) | 0.2.4 | MIT | Copyright (c) 2019-2025 Frank Denis |
| [miniz_oxide](https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide) | 0.3.7 | MIT | Copyright (c) 2017 Frommi |
| [miniz_oxide](https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide) | 0.8.9 | MIT OR Zlib OR Apache-2.0 | Copyright 2013-2014 RAD Game Tools and Valve Software |
| [mio](https://github.com/tokio-rs/mio) | 1.1.1 | MIT | Copyright (c) 2014 Carl Lerche and other MIO contributors |
| [moxcms](https://github.com/awxkee/moxcms.git) | 0.7.11 | BSD-3-Clause OR Apache-2.0 | Copyright (c) Radzivon Bartoshyk. All rights reserved. |
| [muda](https://github.com/amrbashir/muda) | 0.17.1 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [ndk](https://github.com/rust-mobile/ndk) | 0.9.0 | MIT OR Apache-2.0 | The Rust Mobile contributors |
| [ndk-context](https://github.com/rust-windowing/android-ndk-rs) | 0.1.1 | MIT OR Apache-2.0 | The Rust Windowing contributors |
| [ndk-sys](https://github.com/rust-mobile/ndk) | 0.6.0+11769913 | MIT OR Apache-2.0 | The Rust Windowing contributors |
| [new_debug_unreachable](https://github.com/mbrubeck/rust-debug-unreachable) | 1.0.6 | MIT | Copyright (c) 2015 Jonathan Reem |
| [nodrop](https://github.com/bluss/arrayvec) | 0.1.14 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [nom](https://github.com/rust-bakery/nom) | 8.0.0 | MIT | Copyright (c) 2014-2019 Geoffroy Couprie |
| [num-conv](https://github.com/jhpratt/num-conv) | 0.2.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [num-traits](https://github.com/rust-num/num-traits) | 0.2.19 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [num_enum](https://github.com/illicitonion/num_enum) | 0.7.5 | BSD-3-Clause OR MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [num_enum_derive](https://github.com/illicitonion/num_enum) | 0.7.5 | BSD-3-Clause OR MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [num_threads](https://github.com/jhpratt/num_threads) | 0.1.7 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [objc](http://github.com/SSheldon/rust-objc) | 0.2.7 | MIT | Copyright (c) Steven Sheldon |
| [objc2](https://github.com/madsmtm/objc2) | 0.6.3 | MIT | Mads Marquart <mads@marquart.dk> |
| [objc2-app-kit](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-cloud-kit](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-core-data](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-core-foundation](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-core-graphics](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-core-image](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-core-text](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-core-video](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-encode](https://github.com/madsmtm/objc2) | 4.1.0 | MIT | Mads Marquart <mads@marquart.dk> |
| [objc2-exception-helper](https://github.com/madsmtm/objc2) | 0.1.1 | Zlib OR Apache-2.0 OR MIT | Mads Marquart <mads@marquart.dk> |
| [objc2-foundation](https://github.com/madsmtm/objc2) | 0.3.2 | MIT |  |
| [objc2-io-surface](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-javascript-core](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-osa-kit](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-quartz-core](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-security](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-ui-kit](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [objc2-web-kit](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| [once_cell](https://github.com/matklad/once_cell) | 1.21.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [open](https://github.com/Byron/open-rs) | 5.3.3 | MIT | Copyright © `2015` `Sebastian Thiel` |
| [openssl-probe](https://github.com/rustls/openssl-probe) | 0.2.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [option-ext](https://github.com/soc/option-ext.git) | 0.2.0 | MPL-2.0 | (c) under Patent Claims infringed by Covered Software in the absence of |
| [ordered-stream](https://github.com/danieldg/ordered-stream) | 0.2.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [os_pipe](https://github.com/oconnor663/os_pipe.rs) | 1.2.3 | MIT | Jack O'Connor |
| [osakit](https://github.com/mdevils/rust-osakit) | 0.3.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [pango](https://github.com/gtk-rs/gtk-rs-core) | 0.18.3 | MIT | The gtk-rs Project Developers |
| [pango-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.0 | MIT | The gtk-rs Project Developers |
| [parking](https://github.com/smol-rs/parking) | 2.2.1 | Apache-2.0 OR MIT | Copyright 2014-2020 The Rust Project Developers |
| [parking_lot](https://github.com/Amanieu/parking_lot) | 0.12.5 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [parking_lot_core](https://github.com/Amanieu/parking_lot) | 0.9.12 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [pathdiff](https://github.com/Manishearth/pathdiff) | 0.2.3 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [pbkdf2](https://github.com/RustCrypto/password-hashes/tree/master/pbkdf2) | 0.12.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [percent-encoding](https://github.com/servo/rust-url/) | 2.3.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [petgraph](https://github.com/petgraph/petgraph) | 0.8.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [phf](https://github.com/sfackler/rust-phf) | 0.8.0 | MIT | Steven Fackler <sfackler@gmail.com> |
| [phf](https://github.com/sfackler/rust-phf) | 0.10.1 | MIT | Steven Fackler <sfackler@gmail.com> |
| [phf](https://github.com/rust-phf/rust-phf) | 0.11.3 | MIT | Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi |
| [phf_codegen](https://github.com/sfackler/rust-phf) | 0.8.0 | MIT | Steven Fackler <sfackler@gmail.com> |
| [phf_codegen](https://github.com/rust-phf/rust-phf) | 0.11.3 | MIT | Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi |
| [phf_generator](https://github.com/sfackler/rust-phf) | 0.8.0 | MIT | Steven Fackler <sfackler@gmail.com> |
| [phf_generator](https://github.com/sfackler/rust-phf) | 0.10.0 | MIT | Steven Fackler <sfackler@gmail.com> |
| [phf_generator](https://github.com/rust-phf/rust-phf) | 0.11.3 | MIT | Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi |
| [phf_macros](https://github.com/sfackler/rust-phf) | 0.10.0 | MIT | Steven Fackler <sfackler@gmail.com> |
| [phf_macros](https://github.com/rust-phf/rust-phf) | 0.11.3 | MIT | Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi |
| [phf_shared](https://github.com/sfackler/rust-phf) | 0.8.0 | MIT | Steven Fackler <sfackler@gmail.com> |
| [phf_shared](https://github.com/sfackler/rust-phf) | 0.10.0 | MIT | Steven Fackler <sfackler@gmail.com> |
| [phf_shared](https://github.com/rust-phf/rust-phf) | 0.11.3 | MIT | Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi |
| [pin-project-lite](https://github.com/taiki-e/pin-project-lite) | 0.2.16 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [pin-utils](https://github.com/rust-lang-nursery/pin-utils) | 0.1.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [piper](https://github.com/smol-rs/piper) | 0.2.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [pkg-config](https://github.com/rust-lang/pkg-config-rs) | 0.3.32 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [plist](https://github.com/ebarnard/rust-plist/) | 1.8.0 | MIT | Ed Barnard <eabarnard@gmail.com> |
| [png](https://github.com/image-rs/image-png.git) | 0.16.8 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [png](https://github.com/image-rs/image-png) | 0.17.16 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [png](https://github.com/image-rs/image-png) | 0.18.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [polling](https://github.com/smol-rs/polling) | 3.11.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [potential_utf](https://github.com/unicode-org/icu4x) | 0.1.4 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [powerfmt](https://github.com/jhpratt/powerfmt) | 0.2.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [ppv-lite86](https://github.com/cryptocorrosion/cryptocorrosion) | 0.2.21 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [precomputed-hash](https://github.com/emilio/precomputed-hash) | 0.1.1 | MIT | Copyright (c) 2017 Emilio Cobos Álvarez |
| [prettyplease](https://github.com/dtolnay/prettyplease) | 0.2.37 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [proc-macro-crate](https://github.com/bkchr/proc-macro-crate) | 1.3.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [proc-macro-crate](https://github.com/bkchr/proc-macro-crate) | 2.0.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [proc-macro-crate](https://github.com/bkchr/proc-macro-crate) | 3.4.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [proc-macro-error](https://gitlab.com/CreepySkeleton/proc-macro-error) | 1.0.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [proc-macro-error-attr](https://gitlab.com/CreepySkeleton/proc-macro-error) | 1.0.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [proc-macro-hack](https://github.com/dtolnay/proc-macro-hack) | 0.5.20+deprecated | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [proc-macro2](https://github.com/dtolnay/proc-macro2) | 1.0.106 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [psd](https://github.com/chinedufn/psd) | 0.3.5 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [ptr_meta](https://github.com/djkoloski/ptr_meta) | 0.1.4 | MIT | Copyright 2021 David Koloski |
| [ptr_meta_derive](https://github.com/djkoloski/ptr_meta) | 0.1.4 | MIT | Copyright 2021 David Koloski |
| [pxfm](https://github.com/awxkee/pxfm) | 0.1.27 | BSD-3-Clause OR Apache-2.0 | Copyright (c) Radzivon Bartoshyk. All rights reserved. |
| [quick-error](http://github.com/tailhook/quick-error) | 2.0.1 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [quick-xml](https://github.com/tafia/quick-xml) | 0.37.5 | MIT | Copyright (c) 2016 Johann Tuffe |
| [quick-xml](https://github.com/tafia/quick-xml) | 0.38.4 | MIT | Copyright (c) 2016 Johann Tuffe |
| [quote](https://github.com/dtolnay/quote) | 1.0.44 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [r-efi](https://github.com/r-efi/r-efi) | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |  |
| [radium](https://github.com/bitvecto-rs/radium) | 0.7.0 | MIT | Copyright (c) 2019 kneecaw (Nika Layzell) |
| [rand](https://github.com/rust-random/rand) | 0.7.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rand](https://github.com/rust-random/rand) | 0.8.5 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rand_chacha](https://github.com/rust-random/rand) | 0.2.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rand_chacha](https://github.com/rust-random/rand) | 0.3.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rand_core](https://github.com/rust-random/rand) | 0.5.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rand_core](https://github.com/rust-random/rand) | 0.6.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rand_hc](https://github.com/rust-random/rand) | 0.2.0 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [rand_pcg](https://github.com/rust-random/rand) | 0.2.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [raw-window-handle](https://github.com/rust-windowing/raw-window-handle) | 0.6.2 | MIT OR Apache-2.0 OR Zlib | Copyright (c) 2019 Osspial |
| [rayon](https://github.com/rayon-rs/rayon) | 1.12.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rayon-core](https://github.com/rayon-rs/rayon) | 1.13.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [redox_syscall](https://gitlab.redox-os.org/redox-os/syscall) | 0.5.18 | MIT | Copyright (c) 2017 Redox OS Developers |
| [redox_syscall](https://gitlab.redox-os.org/redox-os/syscall) | 0.7.1 | MIT | Copyright (c) 2017 Redox OS Developers |
| [redox_users](https://gitlab.redox-os.org/redox-os/users) | 0.5.2 | MIT | Copyright (c) 2017 Jose Narvaez |
| [ref-cast](https://github.com/dtolnay/ref-cast) | 1.0.25 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [ref-cast-impl](https://github.com/dtolnay/ref-cast) | 1.0.25 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [regex](https://github.com/rust-lang/regex) | 1.12.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [regex-automata](https://github.com/rust-lang/regex) | 0.4.14 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [regex-syntax](https://github.com/rust-lang/regex) | 0.8.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rend](https://github.com/djkoloski/rend) | 0.4.2 | MIT | Copyright 2021 David Koloski |
| [reqwest](https://github.com/seanmonstar/reqwest) | 0.13.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rfd](https://github.com/PolyMeilex/rfd) | 0.16.0 | MIT | Copyright (c) 2022 Bartłomiej Maryńczak |
| [ring](https://github.com/briansmith/ring) | 0.17.14 | Apache-2.0 AND ISC | Copyright 2015-2025 Brian Smith. |
| [rkyv](https://github.com/rkyv/rkyv) | 0.7.46 | MIT | Copyright 2021 David Koloski |
| [rkyv_derive](https://github.com/rkyv/rkyv) | 0.7.46 | MIT | Copyright 2021 David Koloski |
| [rust_decimal](https://github.com/paupino/rust-decimal) | 1.40.0 | MIT | Copyright (c) 2016 Paul Mason |
| [rustc_version](https://github.com/djc/rustc-version-rs) | 0.4.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rustix](https://github.com/bytecodealliance/rustix) | 1.1.3 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [rustls](https://github.com/rustls/rustls) | 0.23.36 | Apache-2.0 OR ISC OR MIT | copyright notice that is included in or attached to the work |
| [rustls-native-certs](https://github.com/rustls/rustls-native-certs) | 0.8.3 | Apache-2.0 OR ISC OR MIT | copyright notice that is included in or attached to the work |
| [rustls-pki-types](https://github.com/rustls/pki-types) | 1.14.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rustls-platform-verifier](https://github.com/rustls/rustls-platform-verifier) | 0.6.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [rustls-platform-verifier-android](https://github.com/rustls/rustls-platform-verifier) | 0.1.1 | MIT OR Apache-2.0 |  |
| [rustls-webpki](https://github.com/rustls/webpki) | 0.103.9 | ISC | Copyright 2015 Brian Smith. |
| [rustversion](https://github.com/dtolnay/rustversion) | 1.0.22 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [same-file](https://github.com/BurntSushi/same-file) | 1.0.6 | Unlicense/MIT | Copyright (c) 2017 Andrew Gallant |
| [schannel](https://github.com/steffengy/schannel-rs) | 0.1.28 | MIT | Copyright (c) 2015 steffengy |
| [schemars](https://github.com/GREsau/schemars) | 0.8.22 | MIT | Copyright (c) 2019 Graham Esau |
| [schemars](https://github.com/GREsau/schemars) | 0.9.0 | MIT | Copyright (c) 2019 Graham Esau |
| [schemars](https://github.com/GREsau/schemars) | 1.2.1 | MIT | Copyright (c) 2019 Graham Esau |
| [schemars_derive](https://github.com/GREsau/schemars) | 0.8.22 | MIT | Copyright (c) 2019 Graham Esau |
| [scopeguard](https://github.com/bluss/scopeguard) | 1.2.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [seahash](https://gitlab.redox-os.org/redox-os/seahash) | 4.1.0 | MIT | ticki <ticki@users.noreply.github.com>, Tom Almeida <tom@tommoa.me> |
| [security-framework](https://github.com/kornelski/rust-security-framework) | 3.6.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [security-framework-sys](https://github.com/kornelski/rust-security-framework) | 2.16.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [selectors](https://github.com/servo/servo) | 0.24.0 | MPL-2.0 | The Servo Project Developers |
| [semver](https://github.com/dtolnay/semver) | 1.0.27 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde](https://github.com/serde-rs/serde) | 1.0.228 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde-untagged](https://github.com/dtolnay/serde-untagged) | 0.1.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde_core](https://github.com/serde-rs/serde) | 1.0.228 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde_derive](https://github.com/serde-rs/serde) | 1.0.228 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde_derive_internals](https://github.com/serde-rs/serde) | 0.29.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde_json](https://github.com/serde-rs/json) | 1.0.149 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde_repr](https://github.com/dtolnay/serde-repr) | 0.1.20 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde_spanned](https://github.com/toml-rs/toml) | 0.6.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde_spanned](https://github.com/toml-rs/toml) | 1.0.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde_with](https://github.com/jonasbb/serde_with/) | 3.16.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serde_with_macros](https://github.com/jonasbb/serde_with/) | 3.16.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serialize-to-javascript](https://github.com/chippers/serialize-to-javascript) | 0.1.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [serialize-to-javascript-impl](https://github.com/chippers/serialize-to-javascript) | 0.1.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [servo_arc](https://github.com/servo/servo) | 0.2.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [sha1](https://github.com/RustCrypto/hashes) | 0.10.6 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [sha2](https://github.com/RustCrypto/hashes) | 0.10.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [shlex](https://github.com/comex/rust-shlex) | 1.3.0 | MIT OR Apache-2.0 | Copyright 2015 Nicholas Allegra (comex). |
| [signal-hook-registry](https://github.com/vorner/signal-hook) | 1.4.8 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [simd-adler32](https://github.com/mcountryman/simd-adler32) | 0.3.8 | MIT | Copyright (c) [2021] [Marvin Countryman] |
| [simdutf8](https://github.com/rusticstuff/simdutf8) | 0.1.5 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [siphasher](https://github.com/jedisct1/rust-siphash) | 0.3.11 | MIT/Apache-2.0 | Copyright 2012-2016 The Rust Project Developers. |
| [siphasher](https://github.com/jedisct1/rust-siphash) | 1.0.2 | MIT/Apache-2.0 | Copyright 2012-2016 The Rust Project Developers. |
| [slab](https://github.com/tokio-rs/slab) | 0.4.12 | MIT | Copyright (c) 2019 Carl Lerche |
| [smallvec](https://github.com/servo/rust-smallvec) | 1.15.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [socket2](https://github.com/rust-lang/socket2) | 0.6.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [softbuffer](https://github.com/rust-windowing/softbuffer) | 0.4.8 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [soup3](https://gitlab.gnome.org/World/Rust/soup3-rs) | 0.5.0 | MIT | Copyright (c) 2013-2017, The Gtk-rs Project Developers. |
| [soup3-sys](https://gitlab.gnome.org/World/Rust/soup3-rs) | 0.5.0 | MIT | Copyright (c) 2013-2017, The Gtk-rs Project Developers. |
| [stable_deref_trait](https://github.com/storyyeller/stable_deref_trait) | 1.2.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [string_cache](https://github.com/servo/string-cache) | 0.8.9 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [string_cache_codegen](https://github.com/servo/string-cache) | 0.5.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [strsim](https://github.com/rapidfuzz/strsim-rs) | 0.11.1 | MIT | Copyright (c) 2015 Danny Guo |
| [subtle](https://github.com/dalek-cryptography/subtle) | 2.6.1 | BSD-3-Clause | Copyright (c) 2016-2017 Isis Agora Lovecruft, Henry de Valence. All rights reserved. |
| [swift-rs](https://github.com/Brendonovich/swift-rs) | 1.0.7 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [syn](https://github.com/dtolnay/syn) | 1.0.109 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [syn](https://github.com/dtolnay/syn) | 2.0.116 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [sync_wrapper](https://github.com/Actyx/sync_wrapper) | 1.0.2 | Apache-2.0 | copyright notice that is included in or attached to the work |
| [synstructure](https://github.com/mystor/synstructure) | 0.13.2 | MIT | Copyright 2016 Nika Layzell |
| [system-deps](https://github.com/gdesmott/system-deps) | 6.2.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [tao](https://github.com/tauri-apps/tao) | 0.34.5 | Apache-2.0 | copyright notice that is included in or attached to the work |
| [tao-macros](https://github.com/tauri-apps/tao) | 0.1.3 | MIT OR Apache-2.0 | Tauri Programme within The Commons Conservancy |
| [tap](https://github.com/myrrlyn/tap) | 1.0.1 | MIT | Copyright (c) 2017 Elliot Linder <darfink@gmail.com> |
| [tar](https://github.com/alexcrichton/tar-rs) | 0.4.44 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [target-lexicon](https://github.com/bytecodealliance/target-lexicon) | 0.12.16 | Apache-2.0 WITH LLVM-exception | copyright notice that is included in or attached to the work |
| [tauri](https://github.com/tauri-apps/tauri) | 2.10.2 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-build](https://github.com/tauri-apps/tauri) | 2.5.5 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-codegen](https://github.com/tauri-apps/tauri) | 2.5.4 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-macros](https://github.com/tauri-apps/tauri) | 2.5.4 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-plugin](https://github.com/tauri-apps/tauri) | 2.5.3 | Apache-2.0 OR MIT | Tauri Programme within The Commons Conservancy |
| [tauri-plugin-clipboard-manager](https://github.com/tauri-apps/plugins-workspace) | 2.3.2 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-plugin-dialog](https://github.com/tauri-apps/plugins-workspace) | 2.6.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| tauri-plugin-drag | 2.1.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-plugin-fs](https://github.com/tauri-apps/plugins-workspace) | 2.4.5 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-plugin-log](https://github.com/tauri-apps/plugins-workspace) | 2.8.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-plugin-opener](https://github.com/tauri-apps/plugins-workspace) | 2.5.3 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-plugin-process](https://github.com/tauri-apps/plugins-workspace) | 2.3.1 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-plugin-updater](https://github.com/tauri-apps/plugins-workspace) | 2.10.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-runtime](https://github.com/tauri-apps/tauri) | 2.10.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-runtime-wry](https://github.com/tauri-apps/tauri) | 2.10.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-utils](https://github.com/tauri-apps/tauri) | 2.8.2 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [tauri-winres](https://github.com/tauri-apps/winres) | 0.3.5 | MIT | Copyright (c) 2023 - Present Tauri Apps Contributors |
| [tempfile](https://github.com/Stebalien/tempfile) | 3.25.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [tendril](https://github.com/servo/tendril) | 0.4.3 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [thiserror](https://github.com/dtolnay/thiserror) | 1.0.69 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [thiserror](https://github.com/dtolnay/thiserror) | 2.0.18 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [thiserror-impl](https://github.com/dtolnay/thiserror) | 1.0.69 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [thiserror-impl](https://github.com/dtolnay/thiserror) | 2.0.18 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [tiff](https://github.com/image-rs/image-tiff) | 0.10.3 | MIT | Copyright (c) 2018 PistonDevelopers |
| [time](https://github.com/time-rs/time) | 0.3.47 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [time-core](https://github.com/time-rs/time) | 0.1.8 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [time-macros](https://github.com/time-rs/time) | 0.2.27 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [tinystr](https://github.com/unicode-org/icu4x) | 0.8.2 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [tinyvec](https://github.com/Lokathor/tinyvec) | 1.10.0 | Zlib OR Apache-2.0 OR MIT | Copyright (c) 2019 Daniel "Lokathor" Gee. |
| [tinyvec_macros](https://github.com/Soveu/tinyvec_macros) | 0.1.1 | MIT OR Apache-2.0 OR Zlib | Copyright (c) 2020 Soveu |
| [tokio](https://github.com/tokio-rs/tokio) | 1.49.0 | MIT | Copyright (c) Tokio Contributors |
| [tokio-rustls](https://github.com/rustls/tokio-rustls) | 0.26.4 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [tokio-util](https://github.com/tokio-rs/tokio) | 0.7.18 | MIT | Copyright (c) Tokio Contributors |
| [toml](https://github.com/toml-rs/toml) | 0.8.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [toml](https://github.com/toml-rs/toml) | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [toml_datetime](https://github.com/toml-rs/toml) | 0.6.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [toml_datetime](https://github.com/toml-rs/toml) | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [toml_edit](https://github.com/toml-rs/toml) | 0.19.15 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [toml_edit](https://github.com/toml-rs/toml) | 0.20.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [toml_edit](https://github.com/toml-rs/toml) | 0.23.10+spec-1.0.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [toml_parser](https://github.com/toml-rs/toml) | 1.0.9+spec-1.1.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [toml_writer](https://github.com/toml-rs/toml) | 1.0.6+spec-1.1.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [tower](https://github.com/tower-rs/tower) | 0.5.3 | MIT | Copyright (c) 2019 Tower Contributors |
| [tower-http](https://github.com/tower-rs/tower-http) | 0.6.8 | MIT | Copyright (c) 2019-2021 Tower Contributors |
| [tower-layer](https://github.com/tower-rs/tower) | 0.3.3 | MIT | Copyright (c) 2019 Tower Contributors |
| [tower-service](https://github.com/tower-rs/tower) | 0.3.3 | MIT | Copyright (c) 2019 Tower Contributors |
| [tracing](https://github.com/tokio-rs/tracing) | 0.1.44 | MIT | Copyright (c) 2019 Tokio Contributors |
| [tracing-attributes](https://github.com/tokio-rs/tracing) | 0.1.31 | MIT | Copyright (c) 2019 Tokio Contributors |
| [tracing-core](https://github.com/tokio-rs/tracing) | 0.1.36 | MIT | Copyright (c) 2019 Tokio Contributors |
| [trash](https://github.com/ArturKovacs/trash) | 5.2.5 | MIT | Copyright 2019 Artúr Barnabás Kovács |
| [tray-icon](https://github.com/tauri-apps/tray-icon) | 0.21.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [tree_magic_mini](https://github.com/mbrubeck/tree_magic/) | 3.2.2 | MIT | Copyright (c) 2017 Aaron Hancock |
| [try-lock](https://github.com/seanmonstar/try-lock) | 0.2.5 | MIT | Copyright (c) 2018-2023 Sean McArthur |
| [ttf-parser](https://github.com/RazrFalcon/ttf-parser) | 0.24.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [typeid](https://github.com/dtolnay/typeid) | 1.0.3 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [typenum](https://github.com/paholg/typenum) | 1.19.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [uds_windows](https://github.com/haraldh/rust_uds_windows) | 1.1.0 | MIT | Copyright (c) Microsoft Corporation. All rights reserved. |
| [unic-char-property](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | The UNIC Project Developers |
| [unic-char-range](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | The UNIC Project Developers |
| [unic-common](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | The UNIC Project Developers |
| [unic-ucd-ident](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | The UNIC Project Developers |
| [unic-ucd-version](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | The UNIC Project Developers |
| [unicode-ident](https://github.com/dtolnay/unicode-ident) | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [unicode-segmentation](https://github.com/unicode-rs/unicode-segmentation) | 1.12.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [unicode-xid](https://github.com/unicode-rs/unicode-xid) | 0.2.6 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [untrusted](https://github.com/briansmith/untrusted) | 0.9.0 | ISC | Brian Smith <brian@briansmith.org> |
| [ureq](https://github.com/algesten/ureq) | 3.2.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [ureq-proto](https://github.com/algesten/ureq-proto) | 0.5.3 | MIT OR Apache-2.0 | Copyright 2022 Martin Algesten |
| [url](https://github.com/servo/rust-url) | 2.5.8 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [urlencoding](https://github.com/kornelski/rust_urlencoding) | 2.1.3 | MIT | © 2016 Bertram Truong |
| [urlpattern](https://github.com/denoland/rust-urlpattern) | 0.3.0 | MIT | Copyright (c) 2021 the Deno authors |
| [utf-8](https://github.com/SimonSapin/rust-utf8) | 0.7.6 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [utf8-width](https://github.com/magiclen/utf8-width) | 0.1.8 | MIT | Copyright (c) 2020 magiclen.org (Ron Li) |
| [utf8_iter](https://github.com/hsivonen/utf8_iter) | 1.0.4 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [uuid](https://github.com/uuid-rs/uuid) | 1.21.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [value-bag](https://github.com/sval-rs/value-bag) | 1.12.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [version-compare](https://gitlab.com/timvisee/version-compare) | 0.2.1 | MIT | Copyright (c) 2017 Tim Visée |
| [version_check](https://github.com/SergioBenitez/version_check) | 0.9.5 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [vswhom](https://github.com/nabijaczleweli/vswhom.rs) | 0.1.0 | MIT | Copyright (c) 2019 nabijaczleweli |
| [vswhom-sys](https://github.com/nabijaczleweli/vswhom-sys.rs) | 0.1.3 | MIT | Copyright (c) 2019 nabijaczleweli |
| [walkdir](https://github.com/BurntSushi/walkdir) | 2.5.0 | Unlicense/MIT | Copyright (c) 2015 Andrew Gallant |
| [want](https://github.com/seanmonstar/want) | 0.3.1 | MIT | Copyright (c) 2018-2019 Sean McArthur |
| [wasi](https://github.com/bytecodealliance/wasi) | 0.9.0+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [wasi](https://github.com/bytecodealliance/wasi) | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [wasip2](https://github.com/bytecodealliance/wasi-rs) | 1.0.2+wasi-0.2.9 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  |
| [wasip3](https://github.com/bytecodealliance/wasi-rs) | 0.4.0+wasi-0.3.0-rc-2026-01-06 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  |
| [wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen) | 0.2.108 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [wasm-bindgen-futures](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/futures) | 0.4.58 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [wasm-bindgen-macro](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/macro) | 0.2.108 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [wasm-bindgen-macro-support](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/macro-support) | 0.2.108 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [wasm-bindgen-shared](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/shared) | 0.2.108 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [wasm-encoder](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wasm-encoder) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | Nick Fitzgerald <fitzgen@gmail.com> |
| [wasm-metadata](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wasm-metadata) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  |
| [wasm-streams](https://github.com/MattiasBuelens/wasm-streams/) | 0.5.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [wasmparser](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wasmparser) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | Yury Delendik <ydelendik@mozilla.com> |
| [wayland-backend](https://github.com/smithay/wayland-rs) | 0.3.12 | MIT | Copyright (c) 2015 Elinor Berger |
| [wayland-client](https://github.com/smithay/wayland-rs) | 0.31.12 | MIT | Copyright (c) 2015 Elinor Berger |
| [wayland-protocols](https://github.com/smithay/wayland-rs) | 0.32.10 | MIT | Copyright (c) 2015 Elinor Berger |
| [wayland-protocols-wlr](https://github.com/smithay/wayland-rs) | 0.3.10 | MIT | Copyright (c) 2015 Elinor Berger |
| [wayland-scanner](https://github.com/smithay/wayland-rs) | 0.31.8 | MIT | Copyright (c) 2015 Elinor Berger |
| [wayland-sys](https://github.com/smithay/wayland-rs) | 0.31.8 | MIT | Copyright (c) 2015 Elinor Berger |
| [web-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/web-sys) | 0.3.85 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [web-time](https://github.com/daxpedda/web-time) | 1.1.0 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [webkit2gtk](https://github.com/tauri-apps/webkit2gtk-rs) | 2.0.2 | MIT | Copyright (c) 2016 Boucher, Antoni <bouanto@zoho.com> |
| [webkit2gtk-sys](https://github.com/tauri-apps/webkit2gtk-rs) | 2.0.2 | MIT | Copyright (c) 2016 Boucher, Antoni <bouanto@zoho.com> |
| [webpki-root-certs](https://github.com/rustls/webpki-roots) | 1.0.6 | CDLA-Permissive-2.0 |  |
| [webpki-roots](https://github.com/rustls/webpki-roots) | 1.0.6 | CDLA-Permissive-2.0 |  |
| [webview2-com](https://github.com/wravery/webview2-rs) | 0.38.2 | MIT |  |
| [webview2-com-macros](https://github.com/wravery/webview2-rs) | 0.8.1 | MIT |  |
| [webview2-com-sys](https://github.com/wravery/webview2-rs) | 0.38.2 | MIT |  |
| [weezl](https://github.com/image-rs/weezl) | 0.1.12 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [winapi](https://github.com/retep998/winapi-rs) | 0.3.9 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [winapi-i686-pc-windows-gnu](https://github.com/retep998/winapi-rs) | 0.4.0 | MIT/Apache-2.0 | Peter Atashian <retep998@gmail.com> |
| [winapi-util](https://github.com/BurntSushi/winapi-util) | 0.1.11 | Unlicense OR MIT | Copyright (c) 2017 Andrew Gallant |
| [winapi-x86_64-pc-windows-gnu](https://github.com/retep998/winapi-rs) | 0.4.0 | MIT/Apache-2.0 | Peter Atashian <retep998@gmail.com> |
| [window-vibrancy](https://github.com/tauri-apps/tauri-plugin-vibrancy) | 0.6.0 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [windows](https://github.com/microsoft/windows-rs) | 0.52.0 | MIT OR Apache-2.0 | Microsoft |
| [windows](https://github.com/microsoft/windows-rs) | 0.56.0 | MIT OR Apache-2.0 | Microsoft |
| [windows](https://github.com/microsoft/windows-rs) | 0.61.3 | MIT OR Apache-2.0 | Microsoft |
| [windows-collections](https://github.com/microsoft/windows-rs) | 0.2.0 | MIT OR Apache-2.0 |  |
| [windows-core](https://github.com/microsoft/windows-rs) | 0.52.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-core](https://github.com/microsoft/windows-rs) | 0.56.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-core](https://github.com/microsoft/windows-rs) | 0.58.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-core](https://github.com/microsoft/windows-rs) | 0.61.2 | MIT OR Apache-2.0 | Microsoft |
| [windows-core](https://github.com/microsoft/windows-rs) | 0.62.2 | MIT OR Apache-2.0 |  |
| [windows-future](https://github.com/microsoft/windows-rs) | 0.2.1 | MIT OR Apache-2.0 |  |
| [windows-implement](https://github.com/microsoft/windows-rs) | 0.52.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-implement](https://github.com/microsoft/windows-rs) | 0.56.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-implement](https://github.com/microsoft/windows-rs) | 0.58.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-implement](https://github.com/microsoft/windows-rs) | 0.60.2 | MIT OR Apache-2.0 |  |
| [windows-interface](https://github.com/microsoft/windows-rs) | 0.52.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-interface](https://github.com/microsoft/windows-rs) | 0.56.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-interface](https://github.com/microsoft/windows-rs) | 0.58.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-interface](https://github.com/microsoft/windows-rs) | 0.59.3 | MIT OR Apache-2.0 |  |
| [windows-link](https://github.com/microsoft/windows-rs) | 0.1.3 | MIT OR Apache-2.0 | Microsoft |
| [windows-link](https://github.com/microsoft/windows-rs) | 0.2.1 | MIT OR Apache-2.0 |  |
| [windows-numerics](https://github.com/microsoft/windows-rs) | 0.2.0 | MIT OR Apache-2.0 |  |
| [windows-result](https://github.com/microsoft/windows-rs) | 0.1.2 | MIT OR Apache-2.0 | Microsoft |
| [windows-result](https://github.com/microsoft/windows-rs) | 0.2.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-result](https://github.com/microsoft/windows-rs) | 0.3.4 | MIT OR Apache-2.0 | Microsoft |
| [windows-result](https://github.com/microsoft/windows-rs) | 0.4.1 | MIT OR Apache-2.0 |  |
| [windows-strings](https://github.com/microsoft/windows-rs) | 0.1.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-strings](https://github.com/microsoft/windows-rs) | 0.4.2 | MIT OR Apache-2.0 | Microsoft |
| [windows-strings](https://github.com/microsoft/windows-rs) | 0.5.1 | MIT OR Apache-2.0 |  |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.45.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.52.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.59.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.60.2 | MIT OR Apache-2.0 | Microsoft |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.61.2 | MIT OR Apache-2.0 |  |
| [windows-targets](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | Microsoft |
| [windows-targets](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | Microsoft |
| [windows-targets](https://github.com/microsoft/windows-rs) | 0.53.5 | MIT OR Apache-2.0 |  |
| [windows-threading](https://github.com/microsoft/windows-rs) | 0.1.0 | MIT OR Apache-2.0 | Microsoft |
| [windows-version](https://github.com/microsoft/windows-rs) | 0.1.7 | MIT OR Apache-2.0 |  |
| [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | Microsoft |
| [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | Microsoft |
| [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 |  |
| [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | Microsoft |
| [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | Microsoft |
| [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 |  |
| [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | Microsoft |
| [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | Microsoft |
| [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 |  |
| [windows_i686_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | Microsoft |
| [windows_i686_gnullvm](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 |  |
| [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | Microsoft |
| [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | Microsoft |
| [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 |  |
| [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | Microsoft |
| [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | Microsoft |
| [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 |  |
| [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | Microsoft |
| [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | Microsoft |
| [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 |  |
| [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | Microsoft |
| [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | Microsoft |
| [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 |  |
| [winnow](https://github.com/winnow-rs/winnow) | 0.5.40 | MIT |  |
| [winnow](https://github.com/winnow-rs/winnow) | 0.7.14 | MIT |  |
| [winreg](https://github.com/gentoo90/winreg-rs) | 0.55.0 | MIT | Copyright (c) 2015 Igor Shaula |
| [wit-bindgen](https://github.com/bytecodealliance/wit-bindgen) | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [wit-bindgen-core](https://github.com/bytecodealliance/wit-bindgen) | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [wit-bindgen-rust](https://github.com/bytecodealliance/wit-bindgen) | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [wit-bindgen-rust-macro](https://github.com/bytecodealliance/wit-bindgen) | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [wit-component](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wit-component) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | Peter Huene <peter@huene.dev> |
| [wit-parser](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wit-parser) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | Alex Crichton <alex@alexcrichton.com> |
| [wl-clipboard-rs](https://github.com/YaLTeR/wl-clipboard-rs) | 0.9.3 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [writeable](https://github.com/unicode-org/icu4x) | 0.6.2 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [wry](https://github.com/tauri-apps/wry) | 0.54.2 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [wyz](https://github.com/myrrlyn/wyz) | 0.5.1 | MIT | Copyright (c) 2018 myrrlyn (Alexander Payne) |
| [x11](https://github.com/AltF02/x11-rs.git) | 2.21.0 | MIT | daggerbot <daggerbot@gmail.com>, Erle Pereira <erle@erlepereira.com>, AltF02 <contact@altf2.dev> |
| [x11-dl](https://github.com/AltF02/x11-rs.git) | 2.21.0 | MIT | daggerbot <daggerbot@gmail.com>, Erle Pereira <erle@erlepereira.com>, AltF02 <contact@altf2.dev> |
| [x11rb](https://github.com/psychon/x11rb) | 0.13.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [x11rb-protocol](https://github.com/psychon/x11rb) | 0.13.2 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [xattr](https://github.com/Stebalien/xattr) | 1.6.1 | MIT OR Apache-2.0 | copyright notice that is included in or attached to the work |
| [xxhash-rust](https://github.com/DoumanAsh/xxhash-rust) | 0.8.15 | BSL-1.0 | Douman <douman@gmx.se> |
| [xz2](https://github.com/alexcrichton/xz2-rs) | 0.1.7 | MIT/Apache-2.0 | copyright notice that is included in or attached to the work |
| [yoke](https://github.com/unicode-org/icu4x) | 0.8.1 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [yoke-derive](https://github.com/unicode-org/icu4x) | 0.8.1 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [zbus](https://github.com/z-galaxy/zbus/) | 5.13.2 | MIT | Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors |
| [zbus_macros](https://github.com/z-galaxy/zbus/) | 5.13.2 | MIT | Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors |
| [zbus_names](https://github.com/z-galaxy/zbus/) | 4.3.1 | MIT | Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors |
| [zerocopy](https://github.com/google/zerocopy) | 0.8.39 | BSD-2-Clause OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [zerocopy-derive](https://github.com/google/zerocopy) | 0.8.39 | BSD-2-Clause OR Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [zerofrom](https://github.com/unicode-org/icu4x) | 0.1.6 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [zerofrom-derive](https://github.com/unicode-org/icu4x) | 0.1.6 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [zeroize](https://github.com/RustCrypto/utils) | 1.8.2 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [zeroize_derive](https://github.com/RustCrypto/utils/tree/master/zeroize/derive) | 1.4.3 | Apache-2.0 OR MIT | copyright notice that is included in or attached to the work |
| [zerotrie](https://github.com/unicode-org/icu4x) | 0.2.3 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [zerovec](https://github.com/unicode-org/icu4x) | 0.11.5 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [zerovec-derive](https://github.com/unicode-org/icu4x) | 0.11.2 | Unicode-3.0 | COPYRIGHT AND PERMISSION NOTICE |
| [zip](https://github.com/zip-rs/zip2.git) | 2.4.2 | MIT | Copyright (c) 2014 Mathijs van de Nes |
| [zip](https://github.com/zip-rs/zip2.git) | 4.6.1 | MIT | Copyright (c) 2014 Mathijs van de Nes |
| [zlib-rs](https://github.com/trifectatechfoundation/zlib-rs) | 0.6.3 | Zlib | (C) 2024 Trifecta Tech Foundation |
| [zmij](https://github.com/dtolnay/zmij) | 1.0.21 | MIT | David Tolnay <dtolnay@gmail.com> |
| [zopfli](https://github.com/zopfli-rs/zopfli) | 0.8.3 | Apache-2.0 | copyright notice that is included in or attached to the work |
| [zstd](https://github.com/gyscos/zstd-rs) | 0.13.3 | MIT | Copyright (c) 2016 Alexandre Bury |
| [zstd-safe](https://github.com/gyscos/zstd-rs) | 7.2.4 | MIT OR Apache-2.0 | Copyright (c) 2016 Alexandre Bury |
| [zstd-sys](https://github.com/gyscos/zstd-rs) | 2.0.16+zstd.1.5.7 | MIT/Apache-2.0 | Copyright (c) 2016 Alexandre Bury |
| zune-core | 0.4.12 | MIT OR Apache-2.0 OR Zlib |  |
| [zune-core](https://github.com/etemesi254/zune-image) | 0.5.1 | MIT OR Apache-2.0 OR Zlib | copyright notice that is included in or attached to the work |
| [zune-jpeg](https://github.com/etemesi254/zune-image/tree/dev/crates/zune-jpeg) | 0.4.21 | MIT OR Apache-2.0 OR Zlib | caleb <etemesicaleb@gmail.com> |
| [zune-jpeg](https://github.com/etemesi254/zune-image/tree/dev/crates/zune-jpeg) | 0.5.12 | MIT OR Apache-2.0 OR Zlib | copyright notice that is included in or attached to the work |
| [zvariant](https://github.com/z-galaxy/zbus/) | 5.9.2 | MIT | Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors |
| [zvariant_derive](https://github.com/z-galaxy/zbus/) | 5.9.2 | MIT | Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors |
| [zvariant_utils](https://github.com/z-galaxy/zbus/) | 3.3.0 | MIT | Zeeshan Ali Khan <zeeshanak@gnome.org>, turbocooler <turbocooler@cocaine.ninja> |

---

# 부록: 라이선스 전문 (License Texts)


복수 라이선스(OR)로 제공되는 구성 요소는 MIT를 우선 선택하고, MIT가 없으면
Apache-2.0을 선택하여 사용합니다 (예: `MIT OR Apache-2.0 OR LGPL-2.1-or-later` → MIT 선택).

MPL-2.0 구성 요소(cssparser, selectors 등)는 수정 없이 사용되며,
해당 소스 코드는 https://crates.io 에서 패키지명·버전으로 입수할 수 있습니다.


## MIT

```
MIT License

Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
```


## Apache-2.0

```
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the copyright owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other entities that control, are controlled by, or are under common control with that entity. For the purposes of this definition, "control" means (i) the power, direct or indirect, to cause the direction or management of such entity, whether by contract or otherwise, or (ii) ownership of fifty percent (50%) or more of the outstanding shares, or (iii) beneficial ownership of such entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising permissions granted by this License.

"Source" form shall mean the preferred form for making modifications, including but not limited to software source code, documentation source, and configuration files.

"Object" form shall mean any form resulting from mechanical transformation or translation of a Source form, including but not limited to compiled object code, generated documentation, and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or Object form, made available under the License, as indicated by a copyright notice that is included in or attached to the work (an example is provided in the Appendix below).

"Derivative Works" shall mean any work, whether in Source or Object form, that is based on (or derived from) the Work and for which the editorial revisions, annotations, elaborations, or other modifications represent, as a whole, an original work of authorship. For the purposes of this License, Derivative Works shall not include works that remain separable from, or merely link (or bind by name) to the interfaces of, the Work and Derivative Works thereof.

"Contribution" shall mean any work of authorship, including the original version of the Work and any modifications or additions to that Work or Derivative Works thereof, that is intentionally submitted to Licensor for inclusion in the Work by the copyright owner or by an individual or Legal Entity authorized to submit on behalf of the copyright owner. For the purposes of this definition, "submitted" means any form of electronic, verbal, or written communication sent to the Licensor or its representatives, including but not limited to communication on electronic mailing lists, source code control systems, and issue tracking systems that are managed by, or on behalf of, the Licensor for the purpose of discussing and improving the Work, but excluding communication that is conspicuously marked or otherwise designated in writing by the copyright owner as "Not a Contribution."

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf of whom a Contribution has been received by Licensor and subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable (except as stated in this section) patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work, where such license applies only to those patent claims licensable by such Contributor that are necessarily infringed by their Contribution(s) alone or by combination of their Contribution(s) with the Work to which such Contribution(s) was submitted. If You institute patent litigation against any entity (including a cross-claim or counterclaim in a lawsuit) alleging that the Work or a Contribution incorporated within the Work constitutes direct or contributory patent infringement, then any patent licenses granted to You under this License for that Work shall terminate as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the Work or Derivative Works thereof in any medium, with or without modifications, and in Source or Object form, provided that You meet the following conditions:

     (a) You must give any other recipients of the Work or Derivative Works a copy of this License; and

     (b) You must cause any modified files to carry prominent notices stating that You changed the files; and

     (c) You must retain, in the Source form of any Derivative Works that You distribute, all copyright, patent, trademark, and attribution notices from the Source form of the Work, excluding those notices that do not pertain to any part of the Derivative Works; and

     (d) If the Work includes a "NOTICE" text file as part of its distribution, then any Derivative Works that You distribute must include a readable copy of the attribution notices contained within such NOTICE file, excluding those notices that do not pertain to any part of the Derivative Works, in at least one of the following places: within a NOTICE text file distributed as part of the Derivative Works; within the Source form or documentation, if provided along with the Derivative Works; or, within a display generated by the Derivative Works, if and wherever such third-party notices normally appear. The contents of the NOTICE file are for informational purposes only and do not modify the License. You may add Your own attribution notices within Derivative Works that You distribute, alongside or as an addendum to the NOTICE text from the Work, provided that such additional attribution notices cannot be construed as modifying the License.

     You may add Your own copyright statement to Your modifications and may provide additional or different license terms and conditions for use, reproduction, or distribution of Your modifications, or for any such Derivative Works as a whole, provided Your use, reproduction, and distribution of the Work otherwise complies with the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise, any Contribution intentionally submitted for inclusion in the Work by You to the Licensor shall be under the terms and conditions of this License, without any additional terms or conditions. Notwithstanding the above, nothing herein shall supersede or modify the terms of any separate license agreement you may have executed with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor, except as required for reasonable and customary use in describing the origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or agreed to in writing, Licensor provides the Work (and each Contributor provides its Contributions) on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE. You are solely responsible for determining the appropriateness of using or redistributing the Work and assume any risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory, whether in tort (including negligence), contract, or otherwise, unless required by applicable law (such as deliberate and grossly negligent acts) or agreed to in writing, shall any Contributor be liable to You for damages, including any direct, indirect, special, incidental, or consequential damages of any character arising as a result of this License or out of the use or inability to use the Work (including but not limited to damages for loss of goodwill, work stoppage, computer failure or malfunction, or any and all other commercial damages or losses), even if such Contributor has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing the Work or Derivative Works thereof, You may choose to offer, and charge a fee for, acceptance of support, warranty, indemnity, or other liability obligations and/or rights consistent with this License. However, in accepting such obligations, You may act only on Your own behalf and on Your sole responsibility, not on behalf of any other Contributor, and only if You agree to indemnify, defend, and hold each Contributor harmless for any liability incurred by, or claims asserted against, such Contributor by reason of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

To apply the Apache License to your work, attach the following boilerplate notice, with the fields enclosed by brackets "[]" replaced with your own identifying information. (Don't include the brackets!)  The text should be enclosed in the appropriate comment syntax for the file format. We also recommend that a file or class name and description of purpose be included on the same "printed page" as the copyright notice for easier identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```


## BSD-2-Clause

```
Copyright (c) <year> <owner> 

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```


## BSD-3-Clause

```
Copyright (c) <year> <owner>. 

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```


## ISC

```
ISC License:

Copyright (c) 2004-2010 by Internet Systems Consortium, Inc. ("ISC")
Copyright (c) 1995-2003 by Internet Software Consortium

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND ISC DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL ISC BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```


## 0BSD

```
Copyright (C) YEAR by AUTHOR EMAIL

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```


## BSL-1.0

```
Boost Software License - Version 1.0 - August 17th, 2003

Permission is hereby granted, free of charge, to any person or organization obtaining a copy of the software and accompanying documentation covered by this license (the "Software") to use, reproduce, display, distribute, execute, and transmit the Software, and to prepare derivative works of the Software, and to permit third-parties to whom the Software is furnished to do so, all subject to the following:

The copyright notices in the Software and this entire statement, including the above license grant, this restriction and the following disclaimer, must be included in all copies of the Software, in whole or in part, and all derivative works of the Software, unless such copies or derivative works are solely in the form of machine-executable object code generated by a source language processor.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```


## Zlib

```
zlib License

This software is provided 'as-is', without any express or implied warranty.  In no event will the authors be held liable for any damages arising from the use of this software.

Permission is granted to anyone to use this software for any purpose, including commercial applications, and to alter it and redistribute it freely, subject to the following restrictions:

     1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this software in a product, an acknowledgment in the product documentation would be appreciated but is not required.

     2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original software.

     3. This notice may not be removed or altered from any source distribution.
```


## Unicode-3.0

```
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2023 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.
```


## MPL-2.0

```
Mozilla Public License Version 2.0
==================================

1. Definitions
--------------

1.1. "Contributor"
    means each individual or legal entity that creates, contributes to
    the creation of, or owns Covered Software.

1.2. "Contributor Version"
    means the combination of the Contributions of others (if any) used
    by a Contributor and that particular Contributor's Contribution.

1.3. "Contribution"
    means Covered Software of a particular Contributor.

1.4. "Covered Software"
    means Source Code Form to which the initial Contributor has attached
    the notice in Exhibit A, the Executable Form of such Source Code
    Form, and Modifications of such Source Code Form, in each case
    including portions thereof.

1.5. "Incompatible With Secondary Licenses"
    means

    (a) that the initial Contributor has attached the notice described
        in Exhibit B to the Covered Software; or

    (b) that the Covered Software was made available under the terms of
        version 1.1 or earlier of the License, but not also under the
        terms of a Secondary License.

1.6. "Executable Form"
    means any form of the work other than Source Code Form.

1.7. "Larger Work"
    means a work that combines Covered Software with other material, in 
    a separate file or files, that is not Covered Software.

1.8. "License"
    means this document.

1.9. "Licensable"
    means having the right to grant, to the maximum extent possible,
    whether at the time of the initial grant or subsequently, any and
    all of the rights conveyed by this License.

1.10. "Modifications"
    means any of the following:

    (a) any file in Source Code Form that results from an addition to,
        deletion from, or modification of the contents of Covered
        Software; or

    (b) any new file in Source Code Form that contains any Covered
        Software.

1.11. "Patent Claims" of a Contributor
    means any patent claim(s), including without limitation, method,
    process, and apparatus claims, in any patent Licensable by such
    Contributor that would be infringed, but for the grant of the
    License, by the making, using, selling, offering for sale, having
    made, import, or transfer of either its Contributions or its
    Contributor Version.

1.12. "Secondary License"
    means either the GNU General Public License, Version 2.0, the GNU
    Lesser General Public License, Version 2.1, the GNU Affero General
    Public License, Version 3.0, or any later versions of those
    licenses.

1.13. "Source Code Form"
    means the form of the work preferred for making modifications.

1.14. "You" (or "Your")
    means an individual or a legal entity exercising rights under this
    License. For legal entities, "You" includes any entity that
    controls, is controlled by, or is under common control with You. For
    purposes of this definition, "control" means (a) the power, direct
    or indirect, to cause the direction or management of such entity,
    whether by contract or otherwise, or (b) ownership of more than
    fifty percent (50%) of the outstanding shares or beneficial
    ownership of such entity.

2. License Grants and Conditions
--------------------------------

2.1. Grants

Each Contributor hereby grants You a world-wide, royalty-free,
non-exclusive license:

(a) under intellectual property rights (other than patent or trademark)
    Licensable by such Contributor to use, reproduce, make available,
    modify, display, perform, distribute, and otherwise exploit its
    Contributions, either on an unmodified basis, with Modifications, or
    as part of a Larger Work; and

(b) under Patent Claims of such Contributor to make, use, sell, offer
    for sale, have made, import, and otherwise transfer either its
    Contributions or its Contributor Version.

2.2. Effective Date

The licenses granted in Section 2.1 with respect to any Contribution
become effective for each Contribution on the date the Contributor first
distributes such Contribution.

2.3. Limitations on Grant Scope

The licenses granted in this Section 2 are the only rights granted under
this License. No additional rights or licenses will be implied from the
distribution or licensing of Covered Software under this License.
Notwithstanding Section 2.1(b) above, no patent license is granted by a
Contributor:

(a) for any code that a Contributor has removed from Covered Software;
    or

(b) for infringements caused by: (i) Your and any other third party's
    modifications of Covered Software, or (ii) the combination of its
    Contributions with other software (except as part of its Contributor
    Version); or

(c) under Patent Claims infringed by Covered Software in the absence of
    its Contributions.

This License does not grant any rights in the trademarks, service marks,
or logos of any Contributor (except as may be necessary to comply with
the notice requirements in Section 3.4).

2.4. Subsequent Licenses

No Contributor makes additional grants as a result of Your choice to
distribute the Covered Software under a subsequent version of this
License (see Section 10.2) or under the terms of a Secondary License (if
permitted under the terms of Section 3.3).

2.5. Representation

Each Contributor represents that the Contributor believes its
Contributions are its original creation(s) or it has sufficient rights
to grant the rights to its Contributions conveyed by this License.

2.6. Fair Use

This License is not intended to limit any rights You have under
applicable copyright doctrines of fair use, fair dealing, or other
equivalents.

2.7. Conditions

Sections 3.1, 3.2, 3.3, and 3.4 are conditions of the licenses granted
in Section 2.1.

3. Responsibilities
-------------------

3.1. Distribution of Source Form

All distribution of Covered Software in Source Code Form, including any
Modifications that You create or to which You contribute, must be under
the terms of this License. You must inform recipients that the Source
Code Form of the Covered Software is governed by the terms of this
License, and how they can obtain a copy of this License. You may not
attempt to alter or restrict the recipients' rights in the Source Code
Form.

3.2. Distribution of Executable Form

If You distribute Covered Software in Executable Form then:

(a) such Covered Software must also be made available in Source Code
    Form, as described in Section 3.1, and You must inform recipients of
    the Executable Form how they can obtain a copy of such Source Code
    Form by reasonable means in a timely manner, at a charge no more
    than the cost of distribution to the recipient; and

(b) You may distribute such Executable Form under the terms of this
    License, or sublicense it under different terms, provided that the
    license for the Executable Form does not attempt to limit or alter
    the recipients' rights in the Source Code Form under this License.

3.3. Distribution of a Larger Work

You may create and distribute a Larger Work under terms of Your choice,
provided that You also comply with the requirements of this License for
the Covered Software. If the Larger Work is a combination of Covered
Software with a work governed by one or more Secondary Licenses, and the
Covered Software is not Incompatible With Secondary Licenses, this
License permits You to additionally distribute such Covered Software
under the terms of such Secondary License(s), so that the recipient of
the Larger Work may, at their option, further distribute the Covered
Software under the terms of either this License or such Secondary
License(s).

3.4. Notices

You may not remove or alter the substance of any license notices
(including copyright notices, patent notices, disclaimers of warranty,
or limitations of liability) contained within the Source Code Form of
the Covered Software, except that You may alter any license notices to
the extent required to remedy known factual inaccuracies.

3.5. Application of Additional Terms

You may choose to offer, and to charge a fee for, warranty, support,
indemnity or liability obligations to one or more recipients of Covered
Software. However, You may do so only on Your own behalf, and not on
behalf of any Contributor. You must make it absolutely clear that any
such warranty, support, indemnity, or liability obligation is offered by
You alone, and You hereby agree to indemnify every Contributor for any
liability incurred by such Contributor as a result of warranty, support,
indemnity or liability terms You offer. You may include additional
disclaimers of warranty and limitations of liability specific to any
jurisdiction.

4. Inability to Comply Due to Statute or Regulation
---------------------------------------------------

If it is impossible for You to comply with any of the terms of this
License with respect to some or all of the Covered Software due to
statute, judicial order, or regulation then You must: (a) comply with
the terms of this License to the maximum extent possible; and (b)
describe the limitations and the code they affect. Such description must
be placed in a text file included with all distributions of the Covered
Software under this License. Except to the extent prohibited by statute
or regulation, such description must be sufficiently detailed for a
recipient of ordinary skill to be able to understand it.

5. Termination
--------------

5.1. The rights granted under this License will terminate automatically
if You fail to comply with any of its terms. However, if You become
compliant, then the rights granted under this License from a particular
Contributor are reinstated (a) provisionally, unless and until such
Contributor explicitly and finally terminates Your grants, and (b) on an
ongoing basis, if such Contributor fails to notify You of the
non-compliance by some reasonable means prior to 60 days after You have
come back into compliance. Moreover, Your grants from a particular
Contributor are reinstated on an ongoing basis if such Contributor
notifies You of the non-compliance by some reasonable means, this is the
first time You have received notice of non-compliance with this License
from such Contributor, and You become compliant prior to 30 days after
Your receipt of the notice.

5.2. If You initiate litigation against any entity by asserting a patent
infringement claim (excluding declaratory judgment actions,
counter-claims, and cross-claims) alleging that a Contributor Version
directly or indirectly infringes any patent, then the rights granted to
You by any and all Contributors for the Covered Software under Section
2.1 of this License shall terminate.

5.3. In the event of termination under Sections 5.1 or 5.2 above, all
end user license agreements (excluding distributors and resellers) which
have been validly granted by You or Your distributors under this License
prior to termination shall survive termination.

************************************************************************
*                                                                      *
*  6. Disclaimer of Warranty                                           *
*  -------------------------                                           *
*                                                                      *
*  Covered Software is provided under this License on an "as is"       *
*  basis, without warranty of any kind, either expressed, implied, or  *
*  statutory, including, without limitation, warranties that the       *
*  Covered Software is free of defects, merchantable, fit for a        *
*  particular purpose or non-infringing. The entire risk as to the     *
*  quality and performance of the Covered Software is with You.        *
*  Should any Covered Software prove defective in any respect, You     *
*  (not any Contributor) assume the cost of any necessary servicing,   *
*  repair, or correction. This disclaimer of warranty constitutes an   *
*  essential part of this License. No use of any Covered Software is   *
*  authorized under this License except under this disclaimer.         *
*                                                                      *
************************************************************************

************************************************************************
*                                                                      *
*  7. Limitation of Liability                                          *
*  --------------------------                                          *
*                                                                      *
*  Under no circumstances and under no legal theory, whether tort      *
*  (including negligence), contract, or otherwise, shall any           *
*  Contributor, or anyone who distributes Covered Software as          *
*  permitted above, be liable to You for any direct, indirect,         *
*  special, incidental, or consequential damages of any character      *
*  including, without limitation, damages for lost profits, loss of    *
*  goodwill, work stoppage, computer failure or malfunction, or any    *
*  and all other commercial damages or losses, even if such party      *
*  shall have been informed of the possibility of such damages. This   *
*  limitation of liability shall not apply to liability for death or   *
*  personal injury resulting from such party's negligence to the       *
*  extent applicable law prohibits such limitation. Some               *
*  jurisdictions do not allow the exclusion or limitation of           *
*  incidental or consequential damages, so this exclusion and          *
*  limitation may not apply to You.                                    *
*                                                                      *
************************************************************************

8. Litigation
-------------

Any litigation relating to this License may be brought only in the
courts of a jurisdiction where the defendant maintains its principal
place of business and such litigation shall be governed by laws of that
jurisdiction, without reference to its conflict-of-law provisions.
Nothing in this Section shall prevent a party's ability to bring
cross-claims or counter-claims.

9. Miscellaneous
----------------

This License represents the complete agreement concerning the subject
matter hereof. If any provision of this License is held to be
unenforceable, such provision shall be reformed only to the extent
necessary to make it enforceable. Any law or regulation which provides
that the language of a contract shall be construed against the drafter
shall not be used to construe this License against a Contributor.

10. Versions of the License
---------------------------

10.1. New Versions

Mozilla Foundation is the license steward. Except as provided in Section
10.3, no one other than the license steward has the right to modify or
publish new versions of this License. Each version will be given a
distinguishing version number.

10.2. Effect of New Versions

You may distribute the Covered Software under the terms of the version
of the License under which You originally received the Covered Software,
or under the terms of any subsequent version published by the license
steward.

10.3. Modified Versions

If you create software not governed by this License, and you want to
create a new license for such software, you may create and use a
modified version of this License if you rename the license and remove
any references to the name of the license steward (except to note that
such modified license differs from this License).

10.4. Distributing Source Code Form that is Incompatible With Secondary
Licenses

If You choose to distribute Source Code Form that is Incompatible With
Secondary Licenses under the terms of this version of the License, the
notice described in Exhibit B of this License must be attached.

Exhibit A - Source Code Form License Notice
-------------------------------------------

  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.

If it is not possible or desirable to put the notice in a particular
file, then You may include the notice in a location (such as a LICENSE
file in a relevant directory) where a recipient would be likely to look
for such a notice.

You may add additional accurate notices of copyright ownership.

Exhibit B - "Incompatible With Secondary Licenses" Notice
---------------------------------------------------------

  This Source Code Form is "Incompatible With Secondary Licenses", as
  defined by the Mozilla Public License, v. 2.0.
```


## Python-2.0

```
PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2

     1. This LICENSE AGREEMENT is between the Python Software Foundation ("PSF"), and the Individual or Organization ("Licensee") accessing and otherwise using this software ("Python") in source or binary form and its associated documentation.

     2. Subject to the terms and conditions of this License Agreement, PSF hereby grants Licensee a nonexclusive, royalty-free, world-wide license to reproduce, analyze, test, perform and/or display publicly, prepare derivative works, distribute, and otherwise use Python alone or in any derivative version, provided, however, that PSF's License Agreement and PSF's notice of copyright, i.e., "Copyright (c) 2001, 2002, 2003, 2004, 2005, 2006 Python Software Foundation; All Rights Reserved" are retained in Python alone or in any derivative version prepared by Licensee.

     3. In the event Licensee prepares a derivative work that is based on or incorporates Python or any part thereof, and wants to make the derivative work available to others as provided herein, then Licensee hereby agrees to include in any such work a brief summary of the changes made to Python.

     4. PSF is making Python available to Licensee on an "AS IS" basis. PSF MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT LIMITATION, PSF MAKES NO AND DISCLAIMS ANY REPRESENTATION OR WARRANTY OF MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF PYTHON WILL NOT INFRINGE ANY THIRD PARTY RIGHTS.

     5. PSF SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF PYTHON FOR ANY INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS A RESULT OF MODIFYING, DISTRIBUTING, OR OTHERWISE USING PYTHON, OR ANY DERIVATIVE THEREOF, EVEN IF ADVISED OF THE POSSIBILITY THEREOF.

     6. This License Agreement will automatically terminate upon a material breach of its terms and conditions.

     7. Nothing in this License Agreement shall be deemed to create any relationship of agency, partnership, or joint venture between PSF and Licensee. This License Agreement does not grant permission to use PSF trademarks or trade name in a trademark sense to endorse or promote products or services of Licensee, or any third party.

     8. By copying, installing or otherwise using Python, Licensee agrees to be bound by the terms and conditions of this License Agreement.


BEOPEN.COM LICENSE AGREEMENT FOR PYTHON 2.0

BEOPEN PYTHON OPEN SOURCE LICENSE AGREEMENT VERSION 1

     1. This LICENSE AGREEMENT is between BeOpen.com ("BeOpen"), having an office at 160 Saratoga Avenue, Santa Clara, CA 95051, and the Individual or Organization ("Licensee") accessing and otherwise using this software in source or binary form and its associated documentation ("the Software").

     2. Subject to the terms and conditions of this BeOpen Python License Agreement, BeOpen hereby grants Licensee a non-exclusive, royalty-free, world-wide license to reproduce, analyze, test, perform and/or display publicly, prepare derivative works, distribute, and otherwise use the Software alone or in any derivative version, provided, however, that the BeOpen Python License is retained in the Software, alone or in any derivative version prepared by Licensee.

     3. BeOpen is making the Software available to Licensee on an "AS IS" basis. BEOPEN MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT LIMITATION, BEOPEN MAKES NO AND DISCLAIMS ANY REPRESENTATION OR WARRANTY OF MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE SOFTWARE WILL NOT INFRINGE ANY THIRD PARTY RIGHTS.

     4. BEOPEN SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF THE SOFTWARE FOR ANY INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS A RESULT OF USING, MODIFYING OR DISTRIBUTING THE SOFTWARE, OR ANY DERIVATIVE THEREOF, EVEN IF ADVISED OF THE POSSIBILITY THEREOF.

     5. This License Agreement will automatically terminate upon a material breach of its terms and conditions.

     6. This License Agreement shall be governed by and interpreted in all respects by the law of the State of California, excluding conflict of law provisions. Nothing in this License Agreement shall be deemed to create any relationship of agency, partnership, or joint venture between BeOpen and Licensee. This License Agreement does not grant permission to use BeOpen trademarks or trade names in a trademark sense to endorse or promote products or services of Licensee, or any third party. As an exception, the "BeOpen Python" logos available at http://www.pythonlabs.com/logos.html may be used according to the permissions granted on that web page.

     7. By copying, installing or otherwise using the software, Licensee agrees to be bound by the terms and conditions of this License Agreement.


CNRI OPEN SOURCE LICENSE AGREEMENT (for Python 1.6b1)

IMPORTANT: PLEASE READ THE FOLLOWING AGREEMENT CAREFULLY.

BY CLICKING ON "ACCEPT" WHERE INDICATED BELOW, OR BY COPYING, INSTALLING OR OTHERWISE USING PYTHON 1.6, beta 1 SOFTWARE, YOU ARE DEEMED TO HAVE AGREED TO THE TERMS AND CONDITIONS OF THIS LICENSE AGREEMENT.

     1. This LICENSE AGREEMENT is between the Corporation for National Research Initiatives, having an office at 1895 Preston White Drive, Reston, VA 20191 ("CNRI"), and the Individual or Organization ("Licensee") accessing and otherwise using Python 1.6, beta 1 software in source or binary form and its associated documentation, as released at the www.python.org Internet site on August 4, 2000 ("Python 1.6b1").

     2. Subject to the terms and conditions of this License Agreement, CNRI hereby grants Licensee a non-exclusive, royalty-free, world-wide license to reproduce, analyze, test, perform and/or display publicly, prepare derivative works, distribute, and otherwise use Python 1.6b1 alone or in any derivative version, provided, however, that CNRIs License Agreement is retained in Python 1.6b1, alone or in any derivative version prepared by Licensee.

     Alternately, in lieu of CNRIs License Agreement, Licensee may substitute the following text (omitting the quotes): "Python 1.6, beta 1, is made available subject to the terms and conditions in CNRIs License Agreement. This Agreement may be located on the Internet using the following unique, persistent identifier (known as a handle): 1895.22/1011. This Agreement may also be obtained from a proxy server on the Internet using the URL:http://hdl.handle.net/1895.22/1011".

     3. In the event Licensee prepares a derivative work that is based on or incorporates Python 1.6b1 or any part thereof, and wants to make the derivative work available to the public as provided herein, then Licensee hereby agrees to indicate in any such work the nature of the modifications made to Python 1.6b1.

     4. CNRI is making Python 1.6b1 available to Licensee on an "AS IS" basis. CNRI MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT LIMITATION, CNRI MAKES NO AND DISCLAIMS ANY REPRESENTATION OR WARRANTY OF MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF PYTHON 1.6b1 WILL NOT INFRINGE ANY THIRD PARTY RIGHTS.

     5. CNRI SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF THE SOFTWARE FOR ANY INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS A RESULT OF USING, MODIFYING OR DISTRIBUTING PYTHON 1.6b1, OR ANY DERIVATIVE THEREOF, EVEN IF ADVISED OF THE POSSIBILITY THEREOF.

     6. This License Agreement will automatically terminate upon a material breach of its terms and conditions.

     7. This License Agreement shall be governed by and interpreted in all respects by the law of the State of Virginia, excluding conflict of law provisions. Nothing in this License Agreement shall be deemed to create any relationship of agency, partnership, or joint venture between CNRI and Licensee. This License Agreement does not grant permission to use CNRI trademarks or trade name in a trademark sense to endorse or promote products or services of Licensee, or any third party.

     8. By clicking on the "ACCEPT" button where indicated, or by copying, installing or otherwise using Python 1.6b1, Licensee agrees to be bound by the terms and conditions of this License Agreement.

ACCEPT


CWI LICENSE AGREEMENT FOR PYTHON 0.9.0 THROUGH 1.2

Copyright (c) 1991 - 1995, Stichting Mathematisch Centrum Amsterdam, The Netherlands. All rights reserved.

     Permission to use, copy, modify, and distribute this software and its documentation for any purpose and without fee is hereby granted, provided that the above copyright notice appear in all copies and that both that copyright notice and this permission notice appear in supporting documentation, and that the name of Stichting Mathematisch Centrum or CWI not be used in advertising or publicity pertaining to distribution of the software without specific, written prior permission.

     STICHTING MATHEMATISCH CENTRUM DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE, INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS, IN NO EVENT SHALL STICHTING MATHEMATISCH CENTRUM BE LIABLE FOR ANY SPECIAL, INDIRECT OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```


## CDLA-Permissive-2.0

```
Community Data License Agreement - Permissive - Version 2.0

This is the Community Data License Agreement - Permissive, Version 2.0 (the "agreement"). Data Provider(s) and Data Recipient(s) agree as follows:

1. Provision of the Data

1.1. A Data Recipient may use, modify, and share the Data made available by Data Provider(s) under this agreement if that Data Recipient follows the terms of this agreement.

1.2. This agreement does not impose any restriction on a Data Recipient's use, modification, or sharing of any portions of the Data that are in the public domain or that may be used, modified, or shared under any other legal exception or limitation.

2. Conditions for Sharing Data

2.1. A Data Recipient may share Data, with or without modifications, so long as the Data Recipient makes available the text of this agreement with the shared Data.

3. No Restrictions on Results

3.1. This agreement does not impose any restriction or obligations with respect to the use, modification, or sharing of Results.

4. No Warranty; Limitation of Liability

4.1. All Data Recipients receive the Data subject to the following terms:

THE DATA IS PROVIDED ON AN "AS IS" BASIS, WITHOUT REPRESENTATIONS, WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED INCLUDING, WITHOUT LIMITATION, ANY WARRANTIES OR CONDITIONS OF TITLE, NON-INFRINGEMENT, MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

NO DATA PROVIDER SHALL HAVE ANY LIABILITY FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING WITHOUT LIMITATION LOST PROFITS), HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE DATA OR RESULTS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

5. Definitions

5.1. "Data" means the material received by a Data Recipient under this agreement.

5.2. "Data Provider" means any person who is the source of Data provided under this agreement and in reliance on a Data Recipient's agreement to its terms.

5.3. "Data Recipient" means any person who receives Data directly or indirectly from a Data Provider and agrees to the terms of this agreement.

5.4. "Results" means any outcome obtained by computational analysis of Data, including for example machine learning models and models' insights.
```


## Unlicense

```
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means.

In jurisdictions that recognize copyright laws, the author or authors of this software dedicate any and all copyright interest in the software to the public domain. We make this dedication for the benefit of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of relinquishment in perpetuity of all present and future rights to this software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org/>
```

## LGPL-2.1 (GNU Lesser General Public License v2.1)

```
                  GNU LESSER GENERAL PUBLIC LICENSE
                       Version 2.1, February 1999

 Copyright (C) 1991, 1999 Free Software Foundation, Inc.
 <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

[This is the first released version of the Lesser GPL.  It also counts
 as the successor of the GNU Library Public License, version 2, hence
 the version number 2.1.]

                            Preamble

  The licenses for most software are designed to take away your
freedom to share and change it.  By contrast, the GNU General Public
Licenses are intended to guarantee your freedom to share and change
free software--to make sure the software is free for all its users.

  This license, the Lesser General Public License, applies to some
specially designated software packages--typically libraries--of the
Free Software Foundation and other authors who decide to use it.  You
can use it too, but we suggest you first think carefully about whether
this license or the ordinary General Public License is the better
strategy to use in any particular case, based on the explanations below.

  When we speak of free software, we are referring to freedom of use,
not price.  Our General Public Licenses are designed to make sure that
you have the freedom to distribute copies of free software (and charge
for this service if you wish); that you receive source code or can get
it if you want it; that you can change the software and use pieces of
it in new free programs; and that you are informed that you can do
these things.

  To protect your rights, we need to make restrictions that forbid
distributors to deny you these rights or to ask you to surrender these
rights.  These restrictions translate to certain responsibilities for
you if you distribute copies of the library or if you modify it.

  For example, if you distribute copies of the library, whether gratis
or for a fee, you must give the recipients all the rights that we gave
you.  You must make sure that they, too, receive or can get the source
code.  If you link other code with the library, you must provide
complete object files to the recipients, so that they can relink them
with the library after making changes to the library and recompiling
it.  And you must show them these terms so they know their rights.

  We protect your rights with a two-step method: (1) we copyright the
library, and (2) we offer you this license, which gives you legal
permission to copy, distribute and/or modify the library.

  To protect each distributor, we want to make it very clear that
there is no warranty for the free library.  Also, if the library is
modified by someone else and passed on, the recipients should know
that what they have is not the original version, so that the original
author's reputation will not be affected by problems that might be
introduced by others.

  Finally, software patents pose a constant threat to the existence of
any free program.  We wish to make sure that a company cannot
effectively restrict the users of a free program by obtaining a
restrictive license from a patent holder.  Therefore, we insist that
any patent license obtained for a version of the library must be
consistent with the full freedom of use specified in this license.

  Most GNU software, including some libraries, is covered by the
ordinary GNU General Public License.  This license, the GNU Lesser
General Public License, applies to certain designated libraries, and
is quite different from the ordinary General Public License.  We use
this license for certain libraries in order to permit linking those
libraries into non-free programs.

  When a program is linked with a library, whether statically or using
a shared library, the combination of the two is legally speaking a
combined work, a derivative of the original library.  The ordinary
General Public License therefore permits such linking only if the
entire combination fits its criteria of freedom.  The Lesser General
Public License permits more lax criteria for linking other code with
the library.

  We call this license the "Lesser" General Public License because it
does Less to protect the user's freedom than the ordinary General
Public License.  It also provides other free software developers Less
of an advantage over competing non-free programs.  These disadvantages
are the reason we use the ordinary General Public License for many
libraries.  However, the Lesser license provides advantages in certain
special circumstances.

  For example, on rare occasions, there may be a special need to
encourage the widest possible use of a certain library, so that it becomes
a de-facto standard.  To achieve this, non-free programs must be
allowed to use the library.  A more frequent case is that a free
library does the same job as widely used non-free libraries.  In this
case, there is little to gain by limiting the free library to free
software only, so we use the Lesser General Public License.

  In other cases, permission to use a particular library in non-free
programs enables a greater number of people to use a large body of
free software.  For example, permission to use the GNU C Library in
non-free programs enables many more people to use the whole GNU
operating system, as well as its variant, the GNU/Linux operating
system.

  Although the Lesser General Public License is Less protective of the
users' freedom, it does ensure that the user of a program that is
linked with the Library has the freedom and the wherewithal to run
that program using a modified version of the Library.

  The precise terms and conditions for copying, distribution and
modification follow.  Pay close attention to the difference between a
"work based on the library" and a "work that uses the library".  The
former contains code derived from the library, whereas the latter must
be combined with the library in order to run.

                  GNU LESSER GENERAL PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. This License Agreement applies to any software library or other
program which contains a notice placed by the copyright holder or
other authorized party saying it may be distributed under the terms of
this Lesser General Public License (also called "this License").
Each licensee is addressed as "you".

  A "library" means a collection of software functions and/or data
prepared so as to be conveniently linked with application programs
(which use some of those functions and data) to form executables.

  The "Library", below, refers to any such software library or work
which has been distributed under these terms.  A "work based on the
Library" means either the Library or any derivative work under
copyright law: that is to say, a work containing the Library or a
portion of it, either verbatim or with modifications and/or translated
straightforwardly into another language.  (Hereinafter, translation is
included without limitation in the term "modification".)

  "Source code" for a work means the preferred form of the work for
making modifications to it.  For a library, complete source code means
all the source code for all modules it contains, plus any associated
interface definition files, plus the scripts used to control compilation
and installation of the library.

  Activities other than copying, distribution and modification are not
covered by this License; they are outside its scope.  The act of
running a program using the Library is not restricted, and output from
such a program is covered only if its contents constitute a work based
on the Library (independent of the use of the Library in a tool for
writing it).  Whether that is true depends on what the Library does
and what the program that uses the Library does.

  1. You may copy and distribute verbatim copies of the Library's
complete source code as you receive it, in any medium, provided that
you conspicuously and appropriately publish on each copy an
appropriate copyright notice and disclaimer of warranty; keep intact
all the notices that refer to this License and to the absence of any
warranty; and distribute a copy of this License along with the
Library.

  You may charge a fee for the physical act of transferring a copy,
and you may at your option offer warranty protection in exchange for a
fee.

  2. You may modify your copy or copies of the Library or any portion
of it, thus forming a work based on the Library, and copy and
distribute such modifications or work under the terms of Section 1
above, provided that you also meet all of these conditions:

    a) The modified work must itself be a software library.

    b) You must cause the files modified to carry prominent notices
    stating that you changed the files and the date of any change.

    c) You must cause the whole of the work to be licensed at no
    charge to all third parties under the terms of this License.

    d) If a facility in the modified Library refers to a function or a
    table of data to be supplied by an application program that uses
    the facility, other than as an argument passed when the facility
    is invoked, then you must make a good faith effort to ensure that,
    in the event an application does not supply such function or
    table, the facility still operates, and performs whatever part of
    its purpose remains meaningful.

    (For example, a function in a library to compute square roots has
    a purpose that is entirely well-defined independent of the
    application.  Therefore, Subsection 2d requires that any
    application-supplied function or table used by this function must
    be optional: if the application does not supply it, the square
    root function must still compute square roots.)

These requirements apply to the modified work as a whole.  If
identifiable sections of that work are not derived from the Library,
and can be reasonably considered independent and separate works in
themselves, then this License, and its terms, do not apply to those
sections when you distribute them as separate works.  But when you
distribute the same sections as part of a whole which is a work based
on the Library, the distribution of the whole must be on the terms of
this License, whose permissions for other licensees extend to the
entire whole, and thus to each and every part regardless of who wrote
it.

Thus, it is not the intent of this section to claim rights or contest
your rights to work written entirely by you; rather, the intent is to
exercise the right to control the distribution of derivative or
collective works based on the Library.

In addition, mere aggregation of another work not based on the Library
with the Library (or with a work based on the Library) on a volume of
a storage or distribution medium does not bring the other work under
the scope of this License.

  3. You may opt to apply the terms of the ordinary GNU General Public
License instead of this License to a given copy of the Library.  To do
this, you must alter all the notices that refer to this License, so
that they refer to the ordinary GNU General Public License, version 2,
instead of to this License.  (If a newer version than version 2 of the
ordinary GNU General Public License has appeared, then you can specify
that version instead if you wish.)  Do not make any other change in
these notices.

  Once this change is made in a given copy, it is irreversible for
that copy, so the ordinary GNU General Public License applies to all
subsequent copies and derivative works made from that copy.

  This option is useful when you wish to copy part of the code of
the Library into a program that is not a library.

  4. You may copy and distribute the Library (or a portion or
derivative of it, under Section 2) in object code or executable form
under the terms of Sections 1 and 2 above provided that you accompany
it with the complete corresponding machine-readable source code, which
must be distributed under the terms of Sections 1 and 2 above on a
medium customarily used for software interchange.

  If distribution of object code is made by offering access to copy
from a designated place, then offering equivalent access to copy the
source code from the same place satisfies the requirement to
distribute the source code, even though third parties are not
compelled to copy the source along with the object code.

  5. A program that contains no derivative of any portion of the
Library, but is designed to work with the Library by being compiled or
linked with it, is called a "work that uses the Library".  Such a
work, in isolation, is not a derivative work of the Library, and
therefore falls outside the scope of this License.

  However, linking a "work that uses the Library" with the Library
creates an executable that is a derivative of the Library (because it
contains portions of the Library), rather than a "work that uses the
library".  The executable is therefore covered by this License.
Section 6 states terms for distribution of such executables.

  When a "work that uses the Library" uses material from a header file
that is part of the Library, the object code for the work may be a
derivative work of the Library even though the source code is not.
Whether this is true is especially significant if the work can be
linked without the Library, or if the work is itself a library.  The
threshold for this to be true is not precisely defined by law.

  If such an object file uses only numerical parameters, data
structure layouts and accessors, and small macros and small inline
functions (ten lines or less in length), then the use of the object
file is unrestricted, regardless of whether it is legally a derivative
work.  (Executables containing this object code plus portions of the
Library will still fall under Section 6.)

  Otherwise, if the work is a derivative of the Library, you may
distribute the object code for the work under the terms of Section 6.
Any executables containing that work also fall under Section 6,
whether or not they are linked directly with the Library itself.

  6. As an exception to the Sections above, you may also combine or
link a "work that uses the Library" with the Library to produce a
work containing portions of the Library, and distribute that work
under terms of your choice, provided that the terms permit
modification of the work for the customer's own use and reverse
engineering for debugging such modifications.

  You must give prominent notice with each copy of the work that the
Library is used in it and that the Library and its use are covered by
this License.  You must supply a copy of this License.  If the work
during execution displays copyright notices, you must include the
copyright notice for the Library among them, as well as a reference
directing the user to the copy of this License.  Also, you must do one
of these things:

    a) Accompany the work with the complete corresponding
    machine-readable source code for the Library including whatever
    changes were used in the work (which must be distributed under
    Sections 1 and 2 above); and, if the work is an executable linked
    with the Library, with the complete machine-readable "work that
    uses the Library", as object code and/or source code, so that the
    user can modify the Library and then relink to produce a modified
    executable containing the modified Library.  (It is understood
    that the user who changes the contents of definitions files in the
    Library will not necessarily be able to recompile the application
    to use the modified definitions.)

    b) Use a suitable shared library mechanism for linking with the
    Library.  A suitable mechanism is one that (1) uses at run time a
    copy of the library already present on the user's computer system,
    rather than copying library functions into the executable, and (2)
    will operate properly with a modified version of the library, if
    the user installs one, as long as the modified version is
    interface-compatible with the version that the work was made with.

    c) Accompany the work with a written offer, valid for at
    least three years, to give the same user the materials
    specified in Subsection 6a, above, for a charge no more
    than the cost of performing this distribution.

    d) If distribution of the work is made by offering access to copy
    from a designated place, offer equivalent access to copy the above
    specified materials from the same place.

    e) Verify that the user has already received a copy of these
    materials or that you have already sent this user a copy.

  For an executable, the required form of the "work that uses the
Library" must include any data and utility programs needed for
reproducing the executable from it.  However, as a special exception,
the materials to be distributed need not include anything that is
normally distributed (in either source or binary form) with the major
components (compiler, kernel, and so on) of the operating system on
which the executable runs, unless that component itself accompanies
the executable.

  It may happen that this requirement contradicts the license
restrictions of other proprietary libraries that do not normally
accompany the operating system.  Such a contradiction means you cannot
use both them and the Library together in an executable that you
distribute.

  7. You may place library facilities that are a work based on the
Library side-by-side in a single library together with other library
facilities not covered by this License, and distribute such a combined
library, provided that the separate distribution of the work based on
the Library and of the other library facilities is otherwise
permitted, and provided that you do these two things:

    a) Accompany the combined library with a copy of the same work
    based on the Library, uncombined with any other library
    facilities.  This must be distributed under the terms of the
    Sections above.

    b) Give prominent notice with the combined library of the fact
    that part of it is a work based on the Library, and explaining
    where to find the accompanying uncombined form of the same work.

  8. You may not copy, modify, sublicense, link with, or distribute
the Library except as expressly provided under this License.  Any
attempt otherwise to copy, modify, sublicense, link with, or
distribute the Library is void, and will automatically terminate your
rights under this License.  However, parties who have received copies,
or rights, from you under this License will not have their licenses
terminated so long as such parties remain in full compliance.

  9. You are not required to accept this License, since you have not
signed it.  However, nothing else grants you permission to modify or
distribute the Library or its derivative works.  These actions are
prohibited by law if you do not accept this License.  Therefore, by
modifying or distributing the Library (or any work based on the
Library), you indicate your acceptance of this License to do so, and
all its terms and conditions for copying, distributing or modifying
the Library or works based on it.

  10. Each time you redistribute the Library (or any work based on the
Library), the recipient automatically receives a license from the
original licensor to copy, distribute, link with or modify the Library
subject to these terms and conditions.  You may not impose any further
restrictions on the recipients' exercise of the rights granted herein.
You are not responsible for enforcing compliance by third parties with
this License.

  11. If, as a consequence of a court judgment or allegation of patent
infringement or for any other reason (not limited to patent issues),
conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot
distribute so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you
may not distribute the Library at all.  For example, if a patent
license would not permit royalty-free redistribution of the Library by
all those who receive copies directly or indirectly through you, then
the only way you could satisfy both it and this License would be to
refrain entirely from distribution of the Library.

If any portion of this section is held invalid or unenforceable under any
particular circumstance, the balance of the section is intended to apply,
and the section as a whole is intended to apply in other circumstances.

It is not the purpose of this section to induce you to infringe any
patents or other property right claims or to contest validity of any
such claims; this section has the sole purpose of protecting the
integrity of the free software distribution system which is
implemented by public license practices.  Many people have made
generous contributions to the wide range of software distributed
through that system in reliance on consistent application of that
system; it is up to the author/donor to decide if he or she is willing
to distribute software through any other system and a licensee cannot
impose that choice.

This section is intended to make thoroughly clear what is believed to
be a consequence of the rest of this License.

  12. If the distribution and/or use of the Library is restricted in
certain countries either by patents or by copyrighted interfaces, the
original copyright holder who places the Library under this License may add
an explicit geographical distribution limitation excluding those countries,
so that distribution is permitted only in or among countries not thus
excluded.  In such case, this License incorporates the limitation as if
written in the body of this License.

  13. The Free Software Foundation may publish revised and/or new
versions of the Lesser General Public License from time to time.
Such new versions will be similar in spirit to the present version,
but may differ in detail to address new problems or concerns.

Each version is given a distinguishing version number.  If the Library
specifies a version number of this License which applies to it and
"any later version", you have the option of following the terms and
conditions either of that version or of any later version published by
the Free Software Foundation.  If the Library does not specify a
license version number, you may choose any version ever published by
the Free Software Foundation.

  14. If you wish to incorporate parts of the Library into other free
programs whose distribution conditions are incompatible with these,
write to the author to ask for permission.  For software which is
copyrighted by the Free Software Foundation, write to the Free
Software Foundation; we sometimes make exceptions for this.  Our
decision will be guided by the two goals of preserving the free status
of all derivatives of our free software and of promoting the sharing
and reuse of software generally.

                            NO WARRANTY

  15. BECAUSE THE LIBRARY IS LICENSED FREE OF CHARGE, THERE IS NO
WARRANTY FOR THE LIBRARY, TO THE EXTENT PERMITTED BY APPLICABLE LAW.
EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR
OTHER PARTIES PROVIDE THE LIBRARY "AS IS" WITHOUT WARRANTY OF ANY
KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE
LIBRARY IS WITH YOU.  SHOULD THE LIBRARY PROVE DEFECTIVE, YOU ASSUME
THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  16. IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN
WRITING WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MAY MODIFY
AND/OR REDISTRIBUTE THE LIBRARY AS PERMITTED ABOVE, BE LIABLE TO YOU
FOR DAMAGES, INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR
CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE
LIBRARY (INCLUDING BUT NOT LIMITED TO LOSS OF DATA OR DATA BEING
RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD PARTIES OR A
FAILURE OF THE LIBRARY TO OPERATE WITH ANY OTHER SOFTWARE), EVEN IF
SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH
DAMAGES.

                     END OF TERMS AND CONDITIONS

           How to Apply These Terms to Your New Libraries

  If you develop a new library, and you want it to be of the greatest
possible use to the public, we recommend making it free software that
everyone can redistribute and change.  You can do so by permitting
redistribution under these terms (or, alternatively, under the terms of the
ordinary General Public License).

  To apply these terms, attach the following notices to the library.  It is
safest to attach them to the start of each source file to most effectively
convey the exclusion of warranty; and each file should have at least the
"copyright" line and a pointer to where the full notice is found.

    <one line to give the library's name and a brief idea of what it does.>
    Copyright (C) <year>  <name of author>

    This library is free software; you can redistribute it and/or
    modify it under the terms of the GNU Lesser General Public
    License as published by the Free Software Foundation; either
    version 2.1 of the License, or (at your option) any later version.

    This library is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
    Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public
    License along with this library; if not, see <https://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

You should also get your employer (if you work as a programmer) or your
school, if any, to sign a "copyright disclaimer" for the library, if
necessary.  Here is a sample; alter the names:

  Yoyodyne, Inc., hereby disclaims all copyright interest in the
  library `Frob' (a library for tweaking knobs) written by James Random Hacker.

  <signature of Moe Ghoul>, 1 April 1990
  Moe Ghoul, President of Vice

That's all there is to it!
```
