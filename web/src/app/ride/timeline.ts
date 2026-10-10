import { diff, median } from './arrays';

// Samples further apart than this are drawn as a gap (strap dropout, auto-pause)
// instead of a straight line bridging the missing data.
export const GAP_MINUTES = 10 / 60;

/** Time axis with every pause cut out, plus where each pause was on that axis. */
export function movingMinutes(seconds: Float64Array): { minutes: Float64Array; pauseAt: number[] } {
  if (seconds.length < 2) return { minutes: seconds.map(s => s / 60), pauseAt: [] };
  const dt = diff(seconds);
  // A pause shrinks to one ordinary recording interval, so the line continues smoothly.
  const typical = median(dt);
  const minutes = new Float64Array(seconds.length);
  const pauseAt: number[] = [];
  let removed = 0;
  minutes[0] = seconds[0] / 60;
  for (let i = 1; i < seconds.length; i++) {
    const pause = dt[i - 1] > GAP_MINUTES * 60;
    if (pause) removed += dt[i - 1] - typical;
    minutes[i] = (seconds[i] - removed) / 60;
    if (pause) pauseAt.push((minutes[i - 1] + minutes[i]) / 2);
  }
  return { minutes, pauseAt };
}

/**
 * [x, y] points for a line chart, with null points wherever the line should break.
 *
 * The nulls sit one GAP_MINUTES inside each gap rather than at its edge, so a cursor in the
 * middle of a gap is nearest to a null point, and the hover readout shows nothing there
 * instead of a far-away sample.
 */
export function withGaps(minutes: Float64Array, values: Float64Array): [number, number | null][] {
  const points: [number, number | null][] = [];
  for (let i = 0; i < minutes.length; i++) {
    if (i > 0 && minutes[i] - minutes[i - 1] > GAP_MINUTES) {
      const before = minutes[i - 1] + GAP_MINUTES;
      const after = minutes[i] - GAP_MINUTES;
      if (before < after) points.push([before, null], [after, null]);
      else points.push([(minutes[i - 1] + minutes[i]) / 2, null]);
    }
    points.push([minutes[i], Number.isFinite(values[i]) ? values[i] : null]);
  }
  return points;
}
