import { ThemeVars } from '../../types';
import { adjustColorForTheme, isDarkHexColor } from '../../hooks/useThemeManagement';

export interface MarkdownSyntaxColors {
  headingColor: string;
  markerColor: string;
  linkColor: string;
  strongColor: string;
  emphasisColor: string;
  quoteColor: string;
  inlineCodeColor: string;
}

function hexToRgb(hexColor: string): { r: number; g: number; b: number } | null {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return null;

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;

  return { r, g, b };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHexColors(baseHex: string, targetHex: string, amount: number): string {
  const baseRgb = hexToRgb(baseHex);
  const targetRgb = hexToRgb(targetHex);
  if (!baseRgb || !targetRgb) return baseHex;

  return rgbToHex({
    r: baseRgb.r + (targetRgb.r - baseRgb.r) * amount,
    g: baseRgb.g + (targetRgb.g - baseRgb.g) * amount,
    b: baseRgb.b + (targetRgb.b - baseRgb.b) * amount,
  });
}

export function getMarkdownSyntaxColors(themeVars: ThemeVars | null | undefined): MarkdownSyntaxColors {
  const accent = themeVars?.accent ?? '#3b82f6';
  const bg = themeVars?.bg ?? '#0f172a';
  const text = themeVars?.text ?? '#e5e7eb';
  const isDarkTheme = isDarkHexColor(bg);

  const headingColor = mixHexColors(
    adjustColorForTheme(accent, isDarkTheme),
    text,
    isDarkTheme ? 0.1 : 0.2,
  );

  return {
    headingColor,
    markerColor: headingColor,
    linkColor: isDarkTheme ? '#9cdcfe' : '#0369a1',
    strongColor: isDarkTheme ? '#569cd6' : '#1d4ed8',
    emphasisColor: isDarkTheme ? '#c586c0' : '#9333ea',
    quoteColor: isDarkTheme ? '#6a9955' : '#166534',
    inlineCodeColor: isDarkTheme ? '#ce9178' : '#c2410c',
  };
}
