import { useState, useEffect, useCallback } from 'react';
import { ThemeVars } from '../types';

// --- 타입 ---
export type Theme = {
  id: string;
  name: string;
  bg: string;
  accent: string;
};

// --- 상수 ---
const SETTINGS_KEY = 'quickfolder_widget_settings';

export const THEME_PRESETS: Theme[] = [
  { id: 'navy', name: '기본(네이비)', bg: '#0f172a', accent: '#3b82f6' },
  { id: 'graphite', name: '그라파이트', bg: '#0b0f19', accent: '#22c55e' },
  { id: 'slate', name: '슬레이트', bg: '#111827', accent: '#a855f7' },
  { id: 'purple', name: '다크 퍼플', bg: '#120a2a', accent: '#ec4899' },
  { id: 'forest', name: '다크 그린', bg: '#081c15', accent: '#10b981' },
  { id: 'brown', name: '다크 브라운', bg: '#1b120a', accent: '#f59e0b' },
  { id: 'macos-light', name: 'macOS 라이트', bg: '#f5f5f5', accent: '#007aff' },
  { id: 'macos-dark', name: 'macOS 다크', bg: '#1e1e1e', accent: '#0a84ff' },
  { id: 'windows-light', name: 'Windows 라이트', bg: '#f3f3f3', accent: '#005fb8' },
  { id: 'windows-dark', name: 'Windows 다크', bg: '#202020', accent: '#60cdff' },
];

type TextColorPreset = { name: string; value: string };

export const TEXT_COLOR_PRESETS: TextColorPreset[] = [
  // === 진한 색상 (라이트모드 최적) ===
  { name: '블랙', value: '#0b0f19' },
  { name: '차콜', value: '#374151' },
  { name: '다크 레드', value: '#b91c1c' },
  { name: '다크 오렌지', value: '#c2410c' },
  { name: '다크 앰버', value: '#b45309' },
  { name: '다크 그린', value: '#15803d' },
  { name: '다크 틸', value: '#0f766e' },
  { name: '다크 블루', value: '#1d4ed8' },
  { name: '다크 인디고', value: '#4338ca' },
  { name: '다크 퍼플', value: '#7e22ce' },
  { name: '다크 핑크', value: '#be185d' },
  { name: '다크 브라운', value: '#92400e' },
  // === 밝은 색상 (다크모드 최적) ===
  { name: '화이트', value: '#ffffff' },
  { name: '라이트 그레이', value: '#e5e7eb' },
  { name: '그레이', value: '#94a3b8' },
  { name: '레드', value: '#f87171' },
  { name: '오렌지', value: '#fb923c' },
  { name: '앰버', value: '#fbbf24' },
  { name: '라임', value: '#a3e635' },
  { name: '그린', value: '#4ade80' },
  { name: '에메랄드', value: '#34d399' },
  { name: '틸', value: '#2dd4bf' },
  { name: '시안', value: '#22d3ee' },
  { name: '스카이', value: '#38bdf8' },
  { name: '블루', value: '#60a5fa' },
  { name: '인디고', value: '#818cf8' },
  { name: '바이올렛', value: '#a78bfa' },
  { name: '퍼플', value: '#c084fc' },
  { name: '핑크', value: '#fb7185' },
  { name: '로즈', value: '#f43f5e' },
  { name: '브라운', value: '#d97706' },
];

export const COLORS = TEXT_COLOR_PRESETS;

export const FOLDER_TEXT_COLORS: { name: string; value: string }[] = [
  { name: '기본(테마)', value: '' },
  ...TEXT_COLOR_PRESETS,
];

// OS 기반 추천 테마 (신규 사용자 기본값)
function getRecommendedThemeId(): string {
  const isMac = navigator.platform.startsWith('Mac');
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (isMac) return isDark ? 'macos-dark' : 'macos-light';
  return isDark ? 'windows-dark' : 'windows-light';
}

// --- 헬퍼 함수 ---
export function normalizeHexColor(value: string): string | null {
  const v = value.trim();
  if (/^#([0-9a-fA-F]{6})$/.test(v)) return v.toLowerCase();
  return null;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const h = normalized.slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mix(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return { r: lerp(a.r, b.r), g: lerp(a.g, b.g), b: lerp(a.b, b.b) };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }) {
  const srgb = [rgb.r, rgb.g, rgb.b].map(v => v / 255);
  const lin = srgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function computeThemeVars(bgHex: string, accentHex: string): ThemeVars | null {
  const bgRgb = hexToRgb(bgHex);
  const accentRgb = hexToRgb(accentHex);
  if (!bgRgb || !accentRgb) return null;

  const isDark = relativeLuminance(bgRgb) < 0.35;
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const toward = isDark ? white : black;

  const mSurface = mix(bgRgb, toward, isDark ? 0.06 : 0.10);
  const mSurface2 = mix(bgRgb, toward, isDark ? 0.10 : 0.16);
  const mSurfaceHover = mix(bgRgb, toward, isDark ? 0.14 : 0.20);
  const mBorder = mix(bgRgb, toward, isDark ? 0.18 : 0.25);

  const surface = rgbToHex(mSurface.r, mSurface.g, mSurface.b);
  const surface2 = rgbToHex(mSurface2.r, mSurface2.g, mSurface2.b);
  const surfaceHover = rgbToHex(mSurfaceHover.r, mSurfaceHover.g, mSurfaceHover.b);
  const border = rgbToHex(mBorder.r, mBorder.g, mBorder.b);

  const text = isDark ? '#e5e7eb' : '#0f172a';
  const muted = isDark ? '#94a3b8' : '#475569';

  const accent20 = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.20)`;
  const accent50 = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.50)`;
  const accentHoverRgb = mix(accentRgb, isDark ? white : black, isDark ? 0.10 : 0.12);
  const accentHover = rgbToHex(accentHoverRgb.r, accentHoverRgb.g, accentHoverRgb.b);

  return { bg: bgHex, surface, surface2, surfaceHover, border, text, muted, accent: accentHex, accentHover, accent20, accent50 };
}

// --- 훅 ---
export function useThemeManagement(addToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
  const [themeId, setThemeId] = useState<string>(getRecommendedThemeId());
  const [customBg, setCustomBg] = useState('#0f172a');
  const [customAccent, setCustomAccent] = useState('#3b82f6');
  const [bgInputValue, setBgInputValue] = useState('#0f172a');
  const [accentInputValue, setAccentInputValue] = useState('#3b82f6');
  const [themeVars, setThemeVars] = useState<ThemeVars | null>(null);
  const [zoomPercent, setZoomPercent] = useState(80);

  // 저장된 설정 복원
  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        const savedThemeId = typeof parsed?.themeId === 'string' ? parsed.themeId : THEME_PRESETS[0].id;
        const bg = typeof parsed?.customBg === 'string' ? parsed.customBg : '#0f172a';
        const accent = typeof parsed?.customAccent === 'string' ? parsed.customAccent : '#3b82f6';
        const z = typeof parsed?.zoomPercent === 'number' ? parsed.zoomPercent : 100;
        setThemeId(savedThemeId);
        setCustomBg(bg);
        setCustomAccent(accent);
        setBgInputValue(bg);
        setAccentInputValue(accent);
        setZoomPercent(Math.min(150, Math.max(50, Math.round(z / 10) * 10)));
      } catch (e) {
        console.error("Failed to parse saved settings", e);
      }
    }
  }, []);

  // 설정 저장
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ themeId, customBg, customAccent, zoomPercent }));
  }, [themeId, customBg, customAccent, zoomPercent]);

  // 테마 변수 계산
  useEffect(() => {
    const preset = THEME_PRESETS.find(t => t.id === themeId) ?? THEME_PRESETS[0];
    const bg = themeId === 'custom' ? customBg : preset.bg;
    const accent = themeId === 'custom' ? customAccent : preset.accent;
    const vars = computeThemeVars(bg, accent);
    setThemeVars(vars);
  }, [themeId, customBg, customAccent]);

  const applyCustomTheme = useCallback((bgValue: string, accentValue: string) => {
    const bg = normalizeHexColor(bgValue);
    const accent = normalizeHexColor(accentValue);
    if (!bg || !accent) {
      addToast("색상 값은 #RRGGBB 형식이어야 합니다.", "error");
      return;
    }
    setThemeId('custom');
    setCustomBg(bg);
    setCustomAccent(accent);
    setBgInputValue(bg);
    setAccentInputValue(accent);
    addToast("테마가 적용되었습니다.", "success");
  }, [addToast]);

  const zoomScale = zoomPercent / 100;

  return {
    themeId, setThemeId,
    customBg, customAccent,
    bgInputValue, setBgInputValue,
    accentInputValue, setAccentInputValue,
    themeVars,
    zoomPercent, setZoomPercent, zoomScale,
    applyCustomTheme,
  };
}
