/** 정렬된 Diff 행 종류 */
export type LineDiffKind = 'equal' | 'remove' | 'add' | 'change';
export type DiffComparisonMode = 'text' | 'markdown';

export interface DiffLineSide {
  lineNum: number;
  text: string;
}

/** 양쪽 패널에 맞춰 정렬된 한 줄 */
export interface AlignedDiffRow {
  kind: LineDiffKind;
  left: DiffLineSide | null;
  right: DiffLineSide | null;
}

export interface DiffComparisonOptions {
  mode?: DiffComparisonMode;
}

type EditOp =
  | { t: 'eq'; a: number; b: number }
  | { t: 'del'; a: number }
  | { t: 'ins'; b: number };

interface MarkdownFence {
  char: '`' | '~';
  length: number;
}

interface DiffUnit {
  lineNum: number;
  text: string;
  key: string;
}

/** 두 텍스트를 줄 단위로 비교해 양쪽 패널 정렬 행 생성 */
export function computeSideBySideDiff(
  leftText: string,
  rightText: string,
  options: DiffComparisonOptions = {},
): AlignedDiffRow[] {
  const leftUnits = buildDiffUnits(leftText, options.mode ?? 'text');
  const rightUnits = buildDiffUnits(rightText, options.mode ?? 'text');
  const script = buildEditScript(
    leftUnits.map(unit => unit.key),
    rightUnits.map(unit => unit.key),
  );
  return scriptToAlignedRows(script, leftUnits, rightUnits);
}

/** Diff 요약 통계 */
export function summarizeDiff(rows: AlignedDiffRow[]): {
  changed: number;
  added: number;
  removed: number;
} {
  let changed = 0;
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.kind === 'change') changed += 1;
    else if (row.kind === 'add') added += 1;
    else if (row.kind === 'remove') removed += 1;
  }
  return { changed, added, removed };
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function buildDiffUnits(text: string, mode: DiffComparisonMode): DiffUnit[] {
  const lines = splitLines(text);
  if (mode !== 'markdown') {
    return lines.map((line, index) => ({
      lineNum: index + 1,
      text: line,
      key: line,
    }));
  }

  const units: DiffUnit[] = [];
  let activeFence: MarkdownFence | null = null;
  lines.forEach((line, index) => {
    const trimmed = line.trimStart();
    const fence = getMarkdownFence(trimmed);
    if (activeFence) {
      units.push({ lineNum: index + 1, text: line, key: line });
      if (fence && fence.char === activeFence.char && fence.length >= activeFence.length) {
        activeFence = null;
      }
      return;
    }

    const normalized = normalizeMarkdownLine(line);
    if (normalized) {
      units.push({ lineNum: index + 1, text: normalized, key: normalized });
    }
    if (fence) activeFence = fence;
  });

  return units;
}

function getMarkdownFence(trimmedLine: string): MarkdownFence | null {
  const match = /^(`{3,}|~{3,})/.exec(trimmedLine);
  if (!match) return null;
  const fence = match[1];
  return {
    char: fence[0] as MarkdownFence['char'],
    length: fence.length,
  };
}

function normalizeMarkdownLine(line: string): string {
  const unescaped = line
    .trim()
    .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, '$1');
  if (!unescaped) return '';

  const heading = /^(#{1,6})\s+(.+)$/.exec(unescaped);
  if (heading) return `${heading[1]} ${heading[2].trim()}`;

  const ordered = /^(\d+)[.)]\s+(.+)$/.exec(unescaped);
  if (ordered) return `${ordered[1]}. ${ordered[2].trim()}`;

  const unordered = /^[*+-]\s+(.+)$/.exec(unescaped);
  if (unordered) return `- ${unordered[1].trim()}`;

  return unescaped.replace(/[ \t]+/g, ' ');
}

function buildEditScript(a: string[], b: string[]): EditOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const script: EditOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      script.unshift({ t: 'eq', a: i - 1, b: j - 1 });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      script.unshift({ t: 'ins', b: j - 1 });
      j -= 1;
    } else {
      script.unshift({ t: 'del', a: i - 1 });
      i -= 1;
    }
  }

  return script;
}

function scriptToAlignedRows(script: EditOp[], leftUnits: DiffUnit[], rightUnits: DiffUnit[]): AlignedDiffRow[] {
  const rows: AlignedDiffRow[] = [];
  let idx = 0;

  while (idx < script.length) {
    const op = script[idx];
    if (op.t === 'eq') {
      rows.push({
        kind: 'equal',
        left: { lineNum: leftUnits[op.a].lineNum, text: leftUnits[op.a].text },
        right: { lineNum: rightUnits[op.b].lineNum, text: rightUnits[op.b].text },
      });
      idx += 1;
      continue;
    }

    const dels: number[] = [];
    const ins: number[] = [];
    while (idx < script.length && script[idx].t !== 'eq') {
      const cur = script[idx];
      if (cur.t === 'del') dels.push(cur.a);
      else if (cur.t === 'ins') ins.push(cur.b);
      idx += 1;
    }

    const pairCount = Math.max(dels.length, ins.length);
    for (let k = 0; k < pairCount; k++) {
      const hasLeft = k < dels.length;
      const hasRight = k < ins.length;
      const kind: LineDiffKind = hasLeft && hasRight ? 'change' : hasLeft ? 'remove' : 'add';
      rows.push({
        kind,
        left: hasLeft ? { lineNum: leftUnits[dels[k]].lineNum, text: leftUnits[dels[k]].text } : null,
        right: hasRight ? { lineNum: rightUnits[ins[k]].lineNum, text: rightUnits[ins[k]].text } : null,
      });
    }
  }

  return rows;
}
