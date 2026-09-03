import React from 'react';

// 확장자 전용 SVG 아이콘 모음 (128x128 뷰박스 고정)
// OS 셸 아이콘 대신 항상 동일하게 표시되며, useNativeIcon의 SKIP_NATIVE_EXTS에 함께 등록해야 한다.
export type ExtIconProps = { size: number; className?: string };

// 종이 + 라벨 밴드 공통 아이콘 (외곽선·밴드는 currentColor → EXT_COLOR로 색 지정)
// textLength로 라벨 폭을 고정해 글자 수와 무관하게 밴드 안에 맞춘다.
const PaperLabelIcon: React.FC<ExtIconProps & { label: string; textLength: number }> = ({
  size,
  className,
  label,
  textLength,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 128 128"
    className={className}
    preserveAspectRatio="xMidYMid meet"
  >
    {/* 종이 본체: 내부 흰색, 외곽선 currentColor */}
    <path
      fill="#ffffff"
      stroke="currentColor"
      strokeWidth={6}
      strokeLinejoin="round"
      d="M22 7h61l23 23v91H22z"
    />
    {/* 접힌 모서리 */}
    <path fill="currentColor" d="M83 7l23 23H83z" />
    {/* 라벨 밴드 */}
    <rect x="8" y="46" width="112" height="50" rx="9" fill="currentColor" />
    <text
      x="64"
      y="87"
      textLength={textLength}
      lengthAdjust="spacingAndGlyphs"
      textAnchor="middle"
      fill="#ffffff"
      fontFamily="Arial Black, Arial, Helvetica, sans-serif"
      fontWeight={900}
      fontSize={43}
    >
      {label}
    </text>
  </svg>
);

export const BatIcon: React.FC<ExtIconProps> = (p) => (
  <PaperLabelIcon {...p} label="BAT" textLength={96} />
);

export const BinIcon: React.FC<ExtIconProps> = (p) => (
  <PaperLabelIcon {...p} label="BIN" textLength={96} />
);

export const DbIcon: React.FC<ExtIconProps> = (p) => (
  <PaperLabelIcon {...p} label="DB" textLength={70} />
);

export const TxtIcon: React.FC<ExtIconProps> = (p) => (
  <PaperLabelIcon {...p} label="TXT" textLength={96} />
);

export const FbxIcon: React.FC<ExtIconProps> = (p) => (
  <PaperLabelIcon {...p} label="FBX" textLength={96} />
);

export const ObjIcon: React.FC<ExtIconProps> = (p) => (
  <PaperLabelIcon {...p} label="OBJ" textLength={96} />
);

// C# — 육각형 바탕 + C# 심볼 (브랜드 컬러 고정)
export const CSharpIcon: React.FC<ExtIconProps> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} preserveAspectRatio="xMidYMid meet">
    <path
      fill="#68217A"
      stroke="#68217A"
      strokeWidth={6}
      strokeLinejoin="round"
      d="M63.5 4l52 30v59.5l-52 30-52-30V34z"
    />
    <path fill="none" stroke="#ffffff" strokeWidth={15} d="M87.16 47.16A30 30 0 1 0 87.16 79.84" />
    <g fill="#ffffff">
      <rect x="94" y="56.5" width="21" height="5.25" />
      <rect x="94" y="65.5" width="21" height="5.25" />
      <path d="M100.5 50.5h5l-5 26h-5z" />
      <path d="M109 50.5h5l-5 26h-5z" />
    </g>
  </svg>
);

// HTML5 실드 로고
export const HtmlIcon: React.FC<ExtIconProps> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} preserveAspectRatio="xMidYMid meet">
    <g transform="scale(4)">
      <path
        fill="#e65100"
        d="m4 4l2 22l10 2l10-2l2-22Zm19.72 7H11.28l.29 3h11.86l-.802 9.335L15.99 25l-6.635-1.646L8.93 19h3.02l.19 2l3.86.77l3.84-.77l.29-4H8.84L8 8h16Z"
      />
    </g>
  </svg>
);

// JavaScript 공식 로고 (노란 배경 + JS)
export const JavaScriptIcon: React.FC<ExtIconProps> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} preserveAspectRatio="xMidYMid meet">
    <path fill="#f0db4f" d="M1.408 1.408h125.184v125.185H1.408z" />
    <path
      fill="#323330"
      d="M116.347 96.736c-.917-5.711-4.641-10.508-15.672-14.981c-3.832-1.761-8.104-3.022-9.377-5.926c-.452-1.69-.512-2.642-.226-3.665c.821-3.32 4.784-4.355 7.925-3.403c2.023.678 3.938 2.237 5.093 4.724c5.402-3.498 5.391-3.475 9.163-5.879c-1.381-2.141-2.118-3.129-3.022-4.045c-3.249-3.629-7.676-5.498-14.756-5.355l-3.688.477c-3.534.893-6.902 2.748-8.877 5.235c-5.926 6.724-4.236 18.492 2.975 23.335c7.104 5.332 17.54 6.545 18.873 11.531c1.297 6.104-4.486 8.08-10.234 7.378c-4.236-.881-6.592-3.034-9.139-6.949c-4.688 2.713-4.688 2.713-9.508 5.485c1.143 2.499 2.344 3.63 4.26 5.795c9.068 9.198 31.76 8.746 35.83-5.176c.165-.478 1.261-3.666.38-8.581M69.462 58.943H57.753l-.048 30.272c0 6.438.333 12.34-.714 14.149c-1.713 3.558-6.152 3.117-8.175 2.427c-2.059-1.012-3.106-2.451-4.319-4.485c-.333-.584-.583-1.036-.667-1.071l-9.52 5.83c1.583 3.249 3.915 6.069 6.902 7.901c4.462 2.678 10.459 3.499 16.731 2.059c4.082-1.189 7.604-3.652 9.448-7.401c2.666-4.915 2.094-10.864 2.07-17.444c.06-10.735.001-21.468.001-32.237"
    />
  </svg>
);

// JSON — 초록 라운드 사각형 + 중괄호
export const JsonIcon: React.FC<ExtIconProps> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} preserveAspectRatio="xMidYMid meet">
    <g transform="scale(0.25)">
      <rect width="499.4" height="499.4" x="6.3" y="8.49" fill="#28ae60" rx="93.64" />
      <path
        fill="#fff"
        d="M95.89 239.11c31.53 0 36-11.88 36-33.64v-38.26c0-42.48 27.49-61.38 62.07-61.38h10.94v33.8h-4.58c-19.88 0-24.89 12.11-24.89 31.09v34.67c0 27.62-10.41 47.43-37.4 51.85c27.92 4.54 37.4 24.28 37.4 52.78v34.59c0 19.26 7.09 32.14 25.82 32.14h3.65v33.81H194c-31.26 0-62.07-15.54-62.07-60.83v-39.79c0-20.41-4.25-33.05-36-33.34Zm320.22 38.16c-31.53 0-36 11.88-36 33.64v38.27c0 42.47-27.49 61.38-62.07 61.38h-10.93v-33.81h4.58c19.88 0 24.89-12.11 24.89-31.09V311c0-27.62 10.41-47.43 37.4-51.85c-27.92-4.54-37.4-24.28-37.4-52.78v-34.59c0-19.27-7.09-32.15-25.82-32.15h-3.65v-33.8h10.94c31.26 0 62.07 15.53 62.07 60.82v39.79c0 20.41 4.25 33.05 36 33.35Z"
      />
    </g>
  </svg>
);

// Markdown — 흰 바탕 + currentColor 외곽선/글리프
export const MarkdownIcon: React.FC<ExtIconProps> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} preserveAspectRatio="xMidYMid meet">
    <g transform="scale(5.333333)" fill="none">
      <path fill="#ffffff" d="M1 5h22v14H1z" />
      <path stroke="currentColor" strokeLinecap="square" strokeWidth={2} d="M1 5h22v14H1z" />
      <path
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth={2}
        d="M14 12.498L16.503 15l2.5-2.5m-2.5-3.5v5.252M11 15v-5a1 1 0 0 0-1-1H8m0 0v6m0-6H5v6"
      />
    </g>
  </svg>
);

// PowerShell 로고
export const PowerShellIcon: React.FC<ExtIconProps> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} preserveAspectRatio="xMidYMid meet">
    <g transform="scale(4)">
      <path
        fill="#03a9f4"
        d="M29.07 6H7.677A1.535 1.535 0 0 0 6.24 7.113l-4.2 17.774A.852.852 0 0 0 2.93 26h21.393a1.535 1.535 0 0 0 1.436-1.113L29.96 7.112A.852.852 0 0 0 29.07 6M8.626 23.797a1.4 1.4 0 0 1-1.814-.31l-.007-.009a1.075 1.075 0 0 1 .315-1.599l9.6-6.061l-6.102-5.852l-.01-.01a1.068 1.068 0 0 1 .084-1.625l.037-.03a1.38 1.38 0 0 1 1.8.07l7.233 6.957a1.1 1.1 0 0 1 .236.739a1.08 1.08 0 0 1-.412.79c-.074.04-.146.119-10.951 6.935ZM24 22.94A1.135 1.135 0 0 1 22.803 24h-5.634a1.061 1.061 0 1 1 .001-2.112h5.633A1.134 1.134 0 0 1 24 22.938Z"
      />
    </g>
  </svg>
);

// Python 공식 로고 (그라디언트 id는 인스턴스 간 동일 정의라 중복돼도 렌더 결과 동일)
export const PythonIcon: React.FC<ExtIconProps> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} preserveAspectRatio="xMidYMid meet">
    <linearGradient
      id="qfPythonBlue"
      x1="70.252"
      x2="170.659"
      y1="1237.476"
      y2="1151.089"
      gradientTransform="matrix(.563 0 0 -.568 -29.215 707.817)"
      gradientUnits="userSpaceOnUse"
    >
      <stop offset="0" stopColor="#5a9fd4" />
      <stop offset="1" stopColor="#306998" />
    </linearGradient>
    <linearGradient
      id="qfPythonYellow"
      x1="209.474"
      x2="173.62"
      y1="1098.811"
      y2="1149.537"
      gradientTransform="matrix(.563 0 0 -.568 -29.215 707.817)"
      gradientUnits="userSpaceOnUse"
    >
      <stop offset="0" stopColor="#ffd43b" />
      <stop offset="1" stopColor="#ffe873" />
    </linearGradient>
    <path
      fill="url(#qfPythonBlue)"
      d="M63.391 1.988c-4.222.02-8.252.379-11.8 1.007c-10.45 1.846-12.346 5.71-12.346 12.837v9.411h24.693v3.137H29.977c-7.176 0-13.46 4.313-15.426 12.521c-2.268 9.405-2.368 15.275 0 25.096c1.755 7.311 5.947 12.519 13.124 12.519h8.491V67.234c0-8.151 7.051-15.34 15.426-15.34h24.665c6.866 0 12.346-5.654 12.346-12.548V15.833c0-6.693-5.646-11.72-12.346-12.837c-4.244-.706-8.645-1.027-12.866-1.008M50.037 9.557c2.55 0 4.634 2.117 4.634 4.721c0 2.593-2.083 4.69-4.634 4.69c-2.56 0-4.633-2.097-4.633-4.69c-.001-2.604 2.073-4.721 4.633-4.721"
      transform="translate(0 10.26)"
    />
    <path
      fill="url(#qfPythonYellow)"
      d="M91.682 28.38v10.966c0 8.5-7.208 15.655-15.426 15.655H51.591c-6.756 0-12.346 5.783-12.346 12.549v23.515c0 6.691 5.818 10.628 12.346 12.547c7.816 2.297 15.312 2.713 24.665 0c6.216-1.801 12.346-5.423 12.346-12.547v-9.412H63.938v-3.138h37.012c7.176 0 9.852-5.005 12.348-12.519c2.578-7.735 2.467-15.174 0-25.096c-1.774-7.145-5.161-12.521-12.348-12.521h-9.268zM77.809 87.927c2.561 0 4.634 2.097 4.634 4.692c0 2.602-2.074 4.719-4.634 4.719c-2.55 0-4.633-2.117-4.633-4.719c0-2.595 2.083-4.692 4.633-4.692"
      transform="translate(0 10.26)"
    />
  </svg>
);

// TOML 로고
export const TomlIcon: React.FC<ExtIconProps> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} preserveAspectRatio="xMidYMid meet">
    <g transform="scale(8)">
      <path fill="#455a64" d="M4 6V4h8v2H9v7H7V6z" />
      <path fill="#ef5350" d="M4 1v1H2v12h2v1H1V1zm8 0v1h2v12h-2v1h3V1z" />
    </g>
  </svg>
);

// Unity 로고 (다크 라운드 사각형 배경 + 큐브)
export const UnityIcon: React.FC<ExtIconProps> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} preserveAspectRatio="xMidYMid meet">
    <g transform="scale(0.5)" fill="none">
      <rect width="256" height="256" fill="#242938" rx="60" />
      <path
        fill="#ccc"
        d="M216.042 167.814V74.743L135.38 28.207v35.78l31.645 18.201c1.241.62 1.241 2.482 0 3.102l-37.643 21.717c-1.034.621-2.481.621-3.516 0L88.224 85.084c-1.24-.62-1.24-2.482 0-3.103l31.645-18.2V28L39.207 74.536v93.278v-.414v.414l31.024-17.787v-36.608c0-1.241 1.447-2.275 2.688-1.448l37.642 21.717c1.035.62 1.862 1.861 1.862 3.102v43.433c0 1.241-1.448 2.275-2.689 1.448L78.09 163.47l-31.024 17.787l80.662 46.536l80.662-46.536l-31.024-17.787l-31.644 18.201c-1.034.62-2.689-.207-2.689-1.448V136.79c0-1.241.62-2.482 1.861-3.102l37.643-21.717c1.034-.621 2.688.207 2.688 1.448v36.608z"
      />
      <path
        fill="#a6a6a6"
        d="m127.521 228l80.662-46.536l-31.024-17.787l-31.644 18.201c-1.034.621-2.689-.207-2.689-1.448v-43.433c0-1.241.621-2.482 1.862-3.102l37.642-21.717c1.034-.62 2.689.207 2.689 1.448v36.608l31.023 17.787V74.743l-88.521 51.085z"
      />
      <path
        fill="#fff"
        d="M135.174 28v35.78l31.644 18.201c1.241.62 1.241 2.482 0 3.103L129.176 106.8c-1.034.621-2.482.621-3.516 0L88.224 85.084c-1.24-.62-1.24-2.482 0-3.103l31.645-18.2V28L39.207 74.536l88.521 51.085l88.521-51.085z"
      />
      <path
        fill="#ccc"
        d="m109.32 181.671l-31.644-18.2l-31.023 17.787l80.661 46.535V125.622L39 74.742v93.279v-.414v.414l31.024-17.787v-36.608c0-1.241 1.448-2.275 2.689-1.448l37.642 21.717c1.034.62 1.861 1.861 1.861 3.102v43.433c-.207 1.034-1.655 1.862-2.896 1.241"
      />
    </g>
  </svg>
);
