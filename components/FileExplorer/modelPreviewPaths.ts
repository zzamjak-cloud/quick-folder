const TEXTURE_DIR_RE = /[/\\](textures?)[/\\]/i;
const TEXTURE_EXT_RE = /\.(png|jpe?g|webp|bmp|gif|tga|tiff?|avif)$/i;

function getSeparator(path: string): '/' | '\\' {
  return path.includes('\\') && !path.includes('/') ? '\\' : '/';
}

export function getDirName(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index >= 0 ? path.slice(0, index) : '';
}

function getBaseName(path: string): string {
  const clean = path.split(/[?#]/, 1)[0] ?? path;
  const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  return index >= 0 ? clean.slice(index + 1) : clean;
}

function joinPath(base: string, ...parts: string[]): string {
  const sep = getSeparator(base);
  const tokens = [base.replace(/[/\\]+$/, ''), ...parts.map(part => part.replace(/^[/\\]+|[/\\]+$/g, ''))]
    .filter(Boolean);
  return tokens.join(sep);
}

function getTextureTail(url: string): string | null {
  const match = url.match(TEXTURE_DIR_RE);
  if (!match || match.index === undefined) return null;

  return url.slice(match.index + match[0].length).split(/[?#]/, 1)[0] || null;
}

export function getModelTextureFallbackPath(modelPath: string, resourceUrl: string): string | null {
  if (!TEXTURE_EXT_RE.test(resourceUrl)) return null;

  const modelDir = getDirName(modelPath);
  const modelParentDir = getDirName(modelDir);
  if (!modelParentDir) return null;

  const tail = getTextureTail(resourceUrl);
  if (tail) {
    return joinPath(modelParentDir, 'Texture', tail);
  }

  const fileName = getBaseName(resourceUrl);
  if (!fileName || !TEXTURE_EXT_RE.test(fileName)) return null;

  return joinPath(modelDir, fileName);
}

export function createModelUrlModifier(
  modelPath: string,
  toAssetUrl: (path: string) => string,
): (url: string) => string {
  return (url: string) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;

    const fallbackPath = getModelTextureFallbackPath(modelPath, url);
    return fallbackPath ? toAssetUrl(fallbackPath) : url;
  };
}
