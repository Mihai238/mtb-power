import { detectClimbs } from '../ride/climbs';
import { DISPLAY_SMOOTHING_S, estimatePower } from '../ride/power';
import { Ride } from '../ride/ride';
import { buildChartOption } from './chart-option';

const POWER_SERIES = `Power on climbs, estimated (${DISPLAY_SMOOTHING_S} s avg)`;

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

type Series = {
  name: string; yAxisIndex: number; markLine?: { data: unknown[] }; markArea?: { data: unknown[] };
};
type Formatter = (params: { seriesName: string; data: [number, number | null] }[]) => string;

describe('buildChartOption', () => {
  it('puts power on a right-hand axis next to heart rate, and marks the pause', () => {
    const r = ride();
    const option = buildChartOption({
      ride: r, power: estimatePower(r, 90), title: 'ride.fit', showHr: true, climbs: detectClimbs(r), riderKg: 75,
    });
    const series = option['series'] as Series[];
    const yAxes = option['yAxis'] as { position?: string; show?: boolean }[];
    expect(series.map(s => s.name)).toEqual(['Heart rate', POWER_SERIES, 'Altitude']);
    expect(yAxes.map(a => a.position)).toEqual(['left', 'right', undefined]);
    expect(series[0].markLine?.data.length).toBe(1);
  });

  it('gives power the left axis when shown alone', () => {
    const r = ride();
    const option = buildChartOption({
      ride: r, power: estimatePower(r, 90), title: 'ride.fit', showHr: false, climbs: detectClimbs(r), riderKg: 75,
    });
    const series = option['series'] as Series[];
    expect(series[0].name).toBe(POWER_SERIES);
    expect((option['yAxis'] as { position?: string }[])[0].position).toBe('left');
    expect(series[0].markLine?.data.length).toBe(1);
  });

  it('reads out heart rate and power under the cursor, and nothing over a gap', () => {
    const r = ride();
    const option = buildChartOption({
      ride: r, power: estimatePower(r, 90), title: 'ride.fit', showHr: true, climbs: detectClimbs(r), riderKg: 75,
    });
    const format = (option['tooltip'] as { formatter: Formatter }).formatter;
    const html = format([
      { seriesName: 'Heart rate', data: [12.5, 141] },
      { seriesName: POWER_SERIES, data: [12.5, 187.4] },
      { seriesName: 'Altitude', data: [12.5, 420] },
    ]);
    expect(html).toContain('12.5 min');
    expect(html).toContain('Heart rate 141 bpm');
    expect(html).toContain('Power 187 W');
    expect(html).not.toContain('420');
    expect(format([
      { seriesName: 'Heart rate', data: [5, null] },
      { seriesName: POWER_SERIES, data: [5, null] },
    ])).toBe('');
  });

  it('shades the climbs and reads out the one under the cursor', () => {
    const r = ride();
    const option = buildChartOption({
      ride: r, power: estimatePower(r, 90), title: 'ride.fit', showHr: true, climbs: detectClimbs(r), riderKg: 75,
    });
    const altitude = (option['series'] as Series[]).find(s => s.name === 'Altitude');
    expect(altitude?.markArea?.data.length).toBe(1);
    const format = (option['tooltip'] as { formatter: Formatter }).formatter;
    const html = format([{ seriesName: POWER_SERIES, data: [0.5, 187.4] }]);
    expect(html).toContain('Climb 1 of 1');
    expect(html).toMatch(/\d+ m over 0\.\d\d km, 5\.0%/);
    expect(html).toMatch(/avg \d+ W, \d\.\d W\/kg/);
  });

  it('plots power only on climbs', () => {
    const r = ride();
    const climb = {
      from: 10, to: 20, lengthM: 60, gainM: 3, grade: 0.05, movingSeconds: 10, vamMPerH: 1080,
    };
    const plotted = (climbs: (typeof climb)[]) => {
      const option = buildChartOption({
        ride: r, power: estimatePower(r, 90), title: 'ride.fit', showHr: true, climbs, riderKg: 75,
      });
      const series = (option['series'] as (Series & { data: [number, number | null][] })[])
        .find(s => s.name === POWER_SERIES);
      return series?.data.filter(([, y]) => y !== null).map(([x]) => x);
    };
    expect(plotted([])).toEqual([]);
    expect(plotted([climb])).toEqual(Array.from({ length: 11 }, (_, i) => (10 + i) / 60));
  });
});
