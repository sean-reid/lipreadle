export interface Bin {
  label: string;
  count: number;
  mine: boolean;
}

const MIN_BINS = 8;
const MAX_BINS = 15;

export function bins(counts: number[], mine: number): Bin[] {
  let last = MIN_BINS;
  for (let i = counts.length - 1; i >= 1; i--) {
    if ((counts[i] ?? 0) > 0) {
      last = Math.max(last, i);
      break;
    }
  }
  last = Math.max(last, Math.min(mine, MAX_BINS));
  const top = Math.min(last, MAX_BINS);
  const out: Bin[] = [];
  for (let g = 1; g <= top; g++) {
    out.push({ label: String(g), count: counts[g] ?? 0, mine: g === mine });
  }
  if (last > MAX_BINS || counts.length - 1 > MAX_BINS) {
    let tail = 0;
    for (let g = MAX_BINS + 1; g < counts.length; g++) tail += counts[g] ?? 0;
    if (tail > 0 || mine > MAX_BINS) {
      out.push({ label: `${MAX_BINS + 1}+`, count: tail, mine: mine > MAX_BINS });
    }
  }
  const gaveUp = counts[0] ?? 0;
  if (gaveUp > 0 || mine === 0) out.push({ label: "gave up", count: gaveUp, mine: mine === 0 });
  return out;
}

export function render(container: HTMLElement, counts: number[], mine: number): void {
  const rows = bins(counts, mine);
  const max = Math.max(1, ...rows.map((r) => r.count));
  container.replaceChildren(
    ...rows.flatMap((r) => {
      const cls = r.mine ? "mine" : "";
      const label = el("span", `label ${cls}`, r.label);
      const bar = el("span", `bar ${cls}`);
      bar.style.width = `${Math.max(1, Math.round((r.count / max) * 100))}%`;
      const wrap = el("span", cls);
      wrap.append(bar);
      const count = el("span", `count ${cls}`, String(r.count));
      return [label, wrap, count];
    }),
  );
}

function el(tag: string, className: string, text?: string): HTMLSpanElement {
  const e = document.createElement(tag);
  e.className = className.trim();
  if (text !== undefined) e.textContent = text;
  return e;
}

// Give-ups count as worse than any solve; a give-up gets no percentile.
export function percentile(counts: number[], mine: number): number | null {
  if (mine === 0) return null;
  let total = counts[0] ?? 0;
  let notWorse = total;
  for (let g = 1; g < counts.length; g++) {
    const n = counts[g] ?? 0;
    total += n;
    if (g >= mine) notWorse += n;
  }
  if (total < 5) return null;
  return Math.round((notWorse / total) * 100);
}
