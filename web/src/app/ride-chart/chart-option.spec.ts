import { estimatePower } from '../ride/power';
import { Ride } from '../ride/ride';
import { buildChartOption } from './chart-option';

const f64 = (values: number[]) => Float64Array.from(values);

function ride(): Ride {
  const seconds = f64([...Array.from({ length: 60 }, (_, i) => i), ...Array.from({ length: 60 }, (_, i) => 900 + i)]);
  return {
    start: new Date(0), seconds,
    heartRate: seconds.map(t => 120 + (t % 7)),
    speed: seconds.map(() => 6),
    distance: seconds.map((_, i) => i * 6),
    altitude: seconds.map((_, i) => 300 + i * 0.3),
    temperatureC: null,
  };
}

type Series = { name: string; yAxisIndex: number; markLine?: { data: unknown[] } };
type Formatter = (params: { seriesName: string; data: [number, number | null] }[]) => string;

describe('buildChartOption', () => {
  it('puts power on a right-hand axis next to heart rate, and marks the pause', () => {
    const r = ride();
    const option = buildChartOption({
      ride: r, power: estimatePower(r, 90), title: 'ride.fit', showHr: true,
    });
    const series = option['series'] as Series[];
    const yAxes = option['yAxis'] as { position?: string; show?: boolean }[];
    expect(series.map(s => s.name)).toEqual([
      'Heart rate', expect.stringMatching(/^avg HR \d+ bpm$/), 'Power, estimated (30 s avg)', 'Altitude',
    ]);
    expect(yAxes.map(a => a.position)).toEqual(['left', 'right', undefined]);
    expect(series[0].markLine?.data.length).toBe(1);
  });

  it('gives power the left axis and its own average line when shown alone', () => {
    const r = ride();
    const option = buildChartOption({
      ride: r, power: estimatePower(r, 90), title: 'ride.fit', showHr: false,
    });
    const series = option['series'] as Series[];
    expect(series[0].name).toBe('Power, estimated (30 s avg)');
    expect(series[1].name).toMatch(/^avg \d+ W$/);
    expect(series[0].markLine?.data.length).toBe(1);
  });

  it('reads out heart rate and power under the cursor, and nothing over a gap', () => {
    const r = ride();
    const option = buildChartOption({
      ride: r, power: estimatePower(r, 90), title: 'ride.fit', showHr: true,
    });
    const format = (option['tooltip'] as { formatter: Formatter }).formatter;
    const html = format([
      { seriesName: 'Heart rate', data: [12.5, 141] },
      { seriesName: 'Power, estimated (30 s avg)', data: [12.5, 187.4] },
      { seriesName: 'Altitude', data: [12.5, 420] },
    ]);
    expect(html).toContain('12.5 min');
    expect(html).toContain('Heart rate 141 bpm');
    expect(html).toContain('Power 187 W');
    expect(html).not.toContain('420');
    expect(format([
      { seriesName: 'Heart rate', data: [5, null] },
      { seriesName: 'Power, estimated (30 s avg)', data: [5, null] },
    ])).toBe('');
  });
});
