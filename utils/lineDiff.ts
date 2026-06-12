/** 정렬된 Diff 행 종류 */
export type LineDiffKind = 'equal' | 'remove' | 'add' | 'change';

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

type EditOp =
  | { t: 'eq'; a: number; b: number }
  | { t: 'del'; a: number }
  | { t: 'ins'; b: number };

/** 두 텍스트를 줄 단위로 비교해 양쪽 패널 정렬 행 생성 */
export function computeSideBySideDiff(leftText: string, rightText: string): AlignedDiffRow[] {
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  const script = buildEditScript(leftLines, rightLines);
  return scriptToAlignedRows(script, leftLines, rightLines);
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

function scriptToAlignedRows(script: EditOp[], leftLines: string[], rightLines: string[]): AlignedDiffRow[] {
  const rows: AlignedDiffRow[] = [];
  let idx = 0;

  while (idx < script.length) {
    const op = script[idx];
    if (op.t === 'eq') {
      rows.push({
        kind: 'equal',
        left: { lineNum: op.a + 1, text: leftLines[op.a] },
        right: { lineNum: op.b + 1, text: rightLines[op.b] },
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
        left: hasLeft ? { lineNum: dels[k] + 1, text: leftLines[dels[k]] } : null,
        right: hasRight ? { lineNum: ins[k] + 1, text: rightLines[ins[k]] } : null,
      });
    }
  }

  return rows;
}
