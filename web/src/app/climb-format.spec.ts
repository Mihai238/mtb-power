import { formatClimb, formatDuration, formatPerKg, formatWatts, UNKNOWN } from './climb-format';

describe('formatClimb', () => {
  const climb = {
    from: 0, to: 100, lengthM: 1328, gainM: 79.6, grade: 0.0601, movingSeconds: 667.4,
    vamMPerH: 429.4,
  };

  it('formats every number of a climb', () => {
    expect(formatClimb(climb, 154.4, 80)).toEqual({
      length: '1.33', gain: '80', grade: '6.0', time: '11:07', vam: '429', power: '154',
      perKg: '1.9',
    });
  });

  it('shows power and W/kg as unknown without a power estimate', () => {
    expect(formatClimb(climb, NaN, 80)).toEqual(
      expect.objectContaining({ power: UNKNOWN, perKg: UNKNOWN }));
  });
});

describe('formatWatts and formatPerKg', () => {
  it('needs a power, and a rider weight for W/kg', () => {
    expect(formatWatts(236.4)).toBe('236');
    expect(formatWatts(NaN)).toBe(UNKNOWN);
    expect(formatPerKg(236, 80)).toBe('3.0');
    expect(formatPerKg(236, 0)).toBe(UNKNOWN);
    expect(formatPerKg(236, NaN)).toBe(UNKNOWN);
  });
});

describe('formatDuration', () => {
  it('rounds to whole seconds, carrying into the minutes', () => {
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(667.4)).toBe('11:07');
    expect(formatDuration(5)).toBe('0:05');
  });
});
