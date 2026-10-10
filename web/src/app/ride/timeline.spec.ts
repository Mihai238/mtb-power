import { GAP_MINUTES, movingMinutes, withGaps } from './timeline';

const f64 = (values: number[]) => Float64Array.from(values);

describe('movingMinutes', () => {
  it('shrinks a pause to one recording interval and marks where it was', () => {
    const { minutes, pauseAt } = movingMinutes(f64([0, 1, 2, 602, 603]));
    expect(Array.from(minutes, m => m * 60)).toEqual([0, 1, 2, 3, 4]);
    expect(pauseAt).toHaveLength(1);
    expect(pauseAt[0] * 60).toBeCloseTo(2.5, 12);
  });

  it('leaves a ride without pauses unchanged', () => {
    const { minutes, pauseAt } = movingMinutes(f64([0, 1, 2, 4]));
    expect(Array.from(minutes, m => m * 60)).toEqual([0, 1, 2, 4]);
    expect(pauseAt).toEqual([]);
  });
});

describe('withGaps', () => {
  it('breaks the line at missing values, and with nulls just inside each gap', () => {
    expect(withGaps(f64([0, 0.01, 1]), f64([1, NaN, 3]))).toEqual([
      [0, 1], [0.01, null], [0.01 + GAP_MINUTES, null], [1 - GAP_MINUTES, null], [1, 3],
    ]);
  });

  it('puts a single null in the middle of a short gap', () => {
    expect(withGaps(f64([0, 0.25]), f64([1, 2]))).toEqual([[0, 1], [0.125, null], [0.25, 2]]);
  });
});
