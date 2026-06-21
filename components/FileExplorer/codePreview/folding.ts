export function computeFoldableBlocks(lines: string[]): Map<number, number> {
  const blockMap = new Map<number, number>();
  const stack: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let opens = 0;
    let closes = 0;
    for (const ch of line) {
      if (ch === '{') opens++;
      else if (ch === '}') closes++;
    }

    for (let o = 0; o < opens; o++) {
      stack.push(i);
    }
    for (let c = 0; c < closes; c++) {
      if (stack.length === 0) continue;
      const startLine = stack.pop()!;
      if (i <= startLine + 1) continue;
      if (!blockMap.has(startLine) || blockMap.get(startLine)! < i) {
        blockMap.set(startLine, i);
      }
    }
  }
  return blockMap;
}
