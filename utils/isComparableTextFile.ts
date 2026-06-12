/** 텍스트/코드 Diff 비교 대상 확장자 */
const COMPARABLE_TEXT_EXTS = new Set([
  'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rs', 'go',
  'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log',
  'cs', 'shader', 'glsl', 'hlsl', 'lua', 'rb', 'php', 'swift', 'kt', 'sh', 'bat',
  'ps1', 'r', 'sql', 'scala', 'dart', 'zig', 'ini', 'cfg', 'conf', 'env',
]);

/** 확장자 없이 비교 가능한 알려진 텍스트 파일명 */
const KNOWN_TEXT_FILES = new Set([
  'license', 'licence', 'readme', 'makefile', 'dockerfile',
  'gemfile', 'rakefile', 'procfile', 'vagrantfile',
  '.gitignore', '.gitattributes', '.editorconfig', '.env',
  '.npmrc', '.prettierrc', '.eslintrc', '.dockerignore',
]);

/** Diff Viewer에서 비교 가능한 텍스트/코드 파일인지 판별 */
export function isComparableTextFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot > 0 ? lower.slice(dot + 1) : '';
  if (COMPARABLE_TEXT_EXTS.has(ext)) return true;

  const hasNoExt = dot <= 0 || lower.startsWith('.');
  return hasNoExt && KNOWN_TEXT_FILES.has(lower);
}
