import { climbTotals, detectClimbs } from './climbs';
import { averagePower, estimatePower } from './power';
import { Ride } from './ride';

const SPEED = 5; // m/s, one sample per second

/**
 * A ride over a profile given as [distance (m), altitude (m)] corners, linear in between.
 * `pauses` maps a distance to a stop of that many seconds there.
 */
function profileRide(corners: [number, number][], pauses: Record<number, number> = {}): Ride {
  const end = corners[corners.length - 1][0];
  const seconds: number[] = [];
  const distance: number[] = [];
  const altitude: number[] = [];
  let t = 0;
  for (let d = 0; d <= end; d += SPEED) {
    const k = corners.findIndex(([cd], i) => i > 0 && cd >= d);
    const [d0, a0] = corners[k - 1];
    const [d1, a1] = corners[k];
    seconds.push(t);
    distance.push(d);
    altitude.push(a0 + ((d - d0) / (d1 - d0)) * (a1 - a0));
    t += 1 + (pauses[d] ?? 0);
  }
  const f64 = (values: number[]) => Float64Array.from(values);
  return {
    start: new Date(0), seconds: f64(seconds), heartRate: new Float64Array(seconds.length).fill(NaN),
    speed: new Float64Array(seconds.length).fill(SPEED), distance: f64(distance),
    altitude: f64(altitude), temperatureC: null,
  };
}

// Rounded, since trimming the foot and top within CLIMB_TRIM_M moves them by a few metres.
const round = (x: number, step: number) => Math.round(x / step) * step;
const summary = (ride: Ride) => detectClimbs(ride).map(c => ({
  from: round(ride.distance[c.from], 50), to: round(ride.distance[c.to], 50),
  gain: round(c.gainM, 5),
}));

describe('detectClimbs', () => {
  it('finds a climb from its foot to its top, without the flat around it', () => {
    const ride = profileRide([[0, 100], [500, 100], [1500, 160], [2000, 160]]);
    const [climb] = detectClimbs(ride);
    expect(summary(ride)).toEqual([{ from: 500, to: 1500, gain: 60 }]);
    expect(climb.grade).toBeCloseTo(0.06);
    expect(climb.movingSeconds).toBe(climb.lengthM / SPEED);
  });

  it('keeps a short dip as part of the climb', () => {
    const ride = profileRide([[0, 100], [500, 130], [550, 126], [1000, 160]]);
    expect(summary(ride)).toEqual([{ from: 0, to: 1000, gain: 60 }]);
  });

  it('splits at a dip of 5 m or more', () => {
    const ride = profileRide([[0, 100], [500, 130], [550, 125], [1000, 160]]);
    expect(summary(ride)).toEqual([{ from: 0, to: 500, gain: 30 }, { from: 550, to: 1000, gain: 35 }]);
  });

  it('splits at 200 m without getting higher', () => {
    const ride = profileRide([[0, 100], [500, 130], [700, 130], [1200, 160]]);
    expect(summary(ride)).toEqual([{ from: 0, to: 500, gain: 30 }, { from: 700, to: 1200, gain: 30 }]);
  });

  it('starts the next climb at the dip when the 200 m rule ends one mid-rise', () => {
    const ride = profileRide([[0, 100], [500, 130], [550, 127], [700, 129.9], [1200, 170]]);
    expect(summary(ride)).toEqual([{ from: 0, to: 500, gain: 30 }, { from: 600, to: 1200, gain: 40 }]);
  });

  it('ignores rises under 20 m and climbs under 3% on average', () => {
    expect(summary(profileRide([[0, 100], [200, 119], [400, 100]]))).toEqual([]);
    expect(summary(profileRide([[0, 100], [2000, 158]]))).toEqual([]);
  });

  it('counts only moving time on a climb with a stop', () => {
    const corners: [number, number][] = [[0, 100], [500, 140]];
    const [paused] = detectClimbs(profileRide(corners, { 250: 120 }));
    const [ridden] = detectClimbs(profileRide(corners));
    expect(paused.movingSeconds).toBe(ridden.movingSeconds);
  });

  it("doesn't count height gained during a pause", () => {
    // 18 m ridden, plus 11 m pushed uphill with auto-pause on.
    const ride = profileRide([[0, 100], [300, 118]], { 150: 60 });
    ride.distance.forEach((d, i) => d > 150 && (ride.altitude[i] += 11));
    expect(detectClimbs(ride)).toEqual([]);
  });

  it('finds nothing without altitude', () => {
    const ride = profileRide([[0, 100], [500, 140]]);
    ride.altitude.fill(NaN);
    expect(detectClimbs(ride)).toEqual([]);
  });
});

describe('climbTotals', () => {
  it('covers the climbs only', () => {
    const ride = profileRide([[0, 100], [500, 100], [1500, 160], [2500, 160], [3000, 190]]);
    // Easy on the flat between the climbs, harder on them.
    ride.heartRate = ride.distance.map(d => (d < 500 || (d > 1500 && d < 2500) ? 110 : 150));
    const climbs = detectClimbs(ride);
    const power = estimatePower(ride, 90)!;
    const totals = climbTotals(ride, climbs, power);
    expect(climbs.length).toBe(2);
    expect(totals.movingSeconds).toBe(climbs[0].movingSeconds + climbs[1].movingSeconds);
    expect(totals.heartRateAvg).toBe(150);
    expect(totals.heartRateMax).toBe(150);
    expect(totals.workJoules).toBeCloseTo(totals.powerAvg * totals.movingSeconds);
    const [first, second] = climbs.map(c => averagePower(power, c.from, c.to) * c.movingSeconds);
    expect(totals.workJoules).toBeCloseTo(first + second);
  });

  it('is NaN without climbs or power', () => {
    const ride = profileRide([[0, 100], [500, 100]]);
    expect(climbTotals(ride, [], estimatePower(ride, 90))).toEqual({
      movingSeconds: 0, heartRateAvg: NaN, heartRateMax: NaN, powerAvg: NaN, powerMax: NaN,
      workJoules: NaN,
    });
    const climbing = profileRide([[0, 100], [500, 140]]);
    const totals = climbTotals(climbing, detectClimbs(climbing), null);
    expect(totals.movingSeconds).toBeGreaterThan(0);
    expect(totals.powerAvg).toBeNaN();
  });
});
