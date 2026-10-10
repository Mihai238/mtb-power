// The few numpy operations the ride model relies on, for Float64Array with NaN as "missing".

/** First index in `a[from..to)` whose value is >= x (numpy searchsorted, side="left"). */
export function searchLeft(a: ArrayLike<number>, x: number, from = 0, to = a.length): number {
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index in `a[from..to)` whose value is > x (numpy searchsorted, side="right"). */
export function searchRight(a: ArrayLike<number>, x: number, from = 0, to = a.length): number {
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function median(values: ArrayLike<number>): number {
  const sorted = Float64Array.from(values).sort();
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function diff(values: ArrayLike<number>): Float64Array {
  const out = new Float64Array(Math.max(values.length - 1, 0));
  for (let i = 0; i < out.length; i++) out[i] = values[i + 1] - values[i];
  return out;
}

export function anyFinite(values: ArrayLike<number>): boolean {
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) return true;
  return false;
}

export function finiteValues(values: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) out.push(values[i]);
  return out;
}

export function nanMean(values: ArrayLike<number>): number {
  const finite = finiteValues(values);
  return finite.length ? finite.reduce((sum, v) => sum + v, 0) / finite.length : NaN;
}

export function nanMax(values: ArrayLike<number>): number {
  let max = NaN;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v) && !(v <= max)) max = v;
  }
  return max;
}

export function nanMin(values: ArrayLike<number>): number {
  let min = NaN;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v) && !(v >= min)) min = v;
  }
  return min;
}

export function clip(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}
