export function visemeTable(text: string): Map<string, string> {
  const table = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const sp = line.indexOf(" ");
    if (sp > 0) table.set(line.slice(0, sp), line.slice(sp + 1));
  }
  return table;
}

// Mouth shapes that are easy to confuse cost less to substitute.
const NEAR: Record<string, string> = {
  d: "lst",
  l: "d",
  s: "dc",
  t: "d",
  c: "s",
  k: "a",
  a: "ke",
  e: "ia",
  i: "e",
  o: "w",
  w: "or",
  r: "w",
};

function subCost(a: string, b: string): number {
  if (a === b) return 0;
  return NEAR[a]?.includes(b) || NEAR[b]?.includes(a) ? 0.5 : 1;
}

export function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let cur = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    for (let j = 1; j < cols; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + subCost(a[i - 1]!, b[j - 1]!),
      );
    }
    [prev, cur] = [cur, prev];
  }
  const distance = prev[cols - 1] ?? 0;
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}
