import hljs from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';
import { getExtension } from '../../../utils/pathUtils';

const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'cpp',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  html: 'xml',
  xml: 'xml',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  md: 'markdown',
  sh: 'bash',
  bat: 'bash',
  ps1: 'powershell',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  r: 'r',
  sql: 'sql',
  scala: 'scala',
  dart: 'dart',
  lua: 'lua',
  shader: 'glsl',
  glsl: 'glsl',
  hlsl: 'glsl',
};

const LANG_IMPORTERS: Record<string, () => Promise<{ default: LanguageFn }>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  rust: () => import('highlight.js/lib/languages/rust'),
  go: () => import('highlight.js/lib/languages/go'),
  java: () => import('highlight.js/lib/languages/java'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  xml: () => import('highlight.js/lib/languages/xml'),
  json: () => import('highlight.js/lib/languages/json'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  ini: () => import('highlight.js/lib/languages/ini'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  bash: () => import('highlight.js/lib/languages/bash'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  php: () => import('highlight.js/lib/languages/php'),
  swift: () => import('highlight.js/lib/languages/swift'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  r: () => import('highlight.js/lib/languages/r'),
  sql: () => import('highlight.js/lib/languages/sql'),
  scala: () => import('highlight.js/lib/languages/scala'),
  dart: () => import('highlight.js/lib/languages/dart'),
  lua: () => import('highlight.js/lib/languages/lua'),
  glsl: () => import('highlight.js/lib/languages/glsl'),
};

const registeredLangs = new Set<string>();

export async function ensureLangRegistered(langName: string): Promise<boolean> {
  if (registeredLangs.has(langName)) return true;
  const importer = LANG_IMPORTERS[langName];
  if (!importer) return false;
  try {
    const mod = await importer();
    hljs.registerLanguage(langName, mod.default);
    registeredLangs.add(langName);
    return true;
  } catch {
    return false;
  }
}

export function getLangFromPath(filePath: string): string | null {
  const ext = getExtension(filePath).replace(/^\./, '').toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

export function highlightCodeContent(content: string, langName: string | null): string {
  if (langName && registeredLangs.has(langName)) {
    return hljs.highlight(content, { language: langName, ignoreIllegals: true }).value;
  }

  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
