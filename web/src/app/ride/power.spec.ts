import {
  acceleration, airDensity, averagePower, estimatePower, G, gradeFromAltitude, MAX_GRADE, MTB,
  rollingMean, sampleDurations, segmentBounds,
} from './power';
import { Ride } from './ride';

const f64 = (values: number[]) => Float64Array.from(values);
const range = (n: number, step = 1) => f64(Array.from({ length: n }, (_, i) => i * step));

function steadyRide(n: number, speed: number, grade = 0): Ride {
  const seconds = range(n);
  const distance = seconds.map(t => t * speed);
  return {
    start: new Date(0), seconds, heartRate: new Float64Array(n).fill(120),
    speed: new Float64Array(n).fill(speed), distance,
    altitude: distance.map(d => 200 + d * grade), temperatureC: 15,
  };
}

describe('segmentBounds', () => {
  it('splits where samples are more than the gap apart', () => {
    expect(segmentBounds(f64([0, 1, 2, 20, 21]))).toEqual([[0, 3], [3, 5]]);
  });

  it('returns one empty segment for no samples', () => {
    expect(segmentBounds(f64([]))).toEqual([[0, 0]]);
  });
});

describe('rollingMean', () => {
  it('averages a centered time window, ignoring NaN', () => {
    expect(Array.from(rollingMean(range(4), f64([1, NaN, 3, 5]), 2))).toEqual([1, 2, 4, 4]);
  });

  it('never averages across a pause', () => {
    const out = rollingMean(f64([0, 1, 100, 101]), f64([10, 20, 30, 40]), 300);
    expect(Array.from(out)).toEqual([15, 15, 35, 35]);
  });

  it('stays NaN where the window holds no values', () => {
    expect(Array.from(rollingMean(range(3), f64([NaN, NaN, NaN]), 2))).toEqual([NaN, NaN, NaN]);
  });
});

describe('acceleration', () => {
  it('matches numpy.gradient on uniform spacing', () => {
    expect(Array.from(acceleration(range(3), f64([0, 1, 4])))).toEqual([1, 2, 3]);
  });

  it('matches numpy.gradient on uneven spacing', () => {
    expect(Array.from(acceleration(f64([0, 1, 3]), f64([0, 1, 9])))).toEqual([1, 2, 4]);
  });

  it('is 0 for a segment with a single sample', () => {
    expect(Array.from(acceleration(f64([0, 1, 50]), f64([1, 2, 7])))).toEqual([1, 1, 0]);
  });
});

describe('gradeFromAltitude', () => {
  it('measures a constant slope', () => {
    const distance = range(21, 10);
    const grade = gradeFromAltitude(range(21), distance, distance.map(d => d * 0.05));
    for (const g of grade) expect(g).toBeCloseTo(0.05, 12);
  });

  it('clips to the maximum grade', () => {
    const distance = range(21, 10);
    const grade = gradeFromAltitude(range(21), distance, distance.map(d => d));
    expect(Array.from(grade).every(g => g === MAX_GRADE)).toBe(true);
  });

  it('is 0 when the rider covers too little distance to measure', () => {
    const grade = gradeFromAltitude(range(5), f64([0, 1, 2, 3, 4]), f64([0, 1, 2, 3, 4]));
    expect(Array.from(grade)).toEqual([0, 0, 0, 0, 0]);
  });

  it('stays NaN where distance or altitude is missing', () => {
    const distance = range(5, 10);
    const grade = gradeFromAltitude(range(5), distance, f64([0, NaN, 1, 1.5, 2]));
    expect(grade[1]).toBeNaN();
    expect(grade[0]).toBeCloseTo(0.05, 12);
  });
});

describe('sampleDurations', () => {
  it('counts a pause as one typical recording interval', () => {
    expect(Array.from(sampleDurations(f64([0, 1, 2, 30, 31])))).toEqual([1, 1, 1, 1, 1]);
  });

  it('counts a single sample as 1 s', () => {
    expect(Array.from(sampleDurations(f64([5])))).toEqual([1]);
  });
});

describe('estimatePower', () => {
  it('returns null without altitude data', () => {
    const ride = steadyRide(60, 8);
    ride.altitude.fill(NaN);
    expect(estimatePower(ride, 90)).toBeNull();
  });

  it('balances rolling resistance and drag on a flat road at steady speed', () => {
    const v = 10;
    const mass = 85;
    const power = estimatePower(steadyRide(120, v), mass, MTB)!;
    const rho = airDensity(200, 15);
    const expected = (mass * G * MTB.crrFlat + 0.5 * rho * MTB.cdaM2 * v ** 2) * v
      / MTB.drivetrainEfficiency;
    expect(power.watts[60]).toBeCloseTo(expected, 9);
    expect(averagePower(power, 0, 120)).toBeCloseTo(expected, 9);
  });

  it('adds the climbing work on a slope', () => {
    const flat = estimatePower(steadyRide(120, 4), 90, MTB)!;
    const climb = estimatePower(steadyRide(120, 4, 0.06), 90, MTB)!;
    // sin(atan(0.06)) · m · g · v, plus the offroad rolling resistance on a climb.
    expect(climb.watts[60] - flat.watts[60]).toBeGreaterThan(90 * G * 0.0599 * 4 / MTB.drivetrainEfficiency);
  });

  it('counts standing still and coasting downhill as 0 W', () => {
    expect(Array.from(estimatePower(steadyRide(30, 0.2), 90)!.watts).every(w => w === 0)).toBe(true);
    expect(estimatePower(steadyRide(120, 12, -0.08), 90)!.watts[60]).toBe(0);
  });
});

describe('averagePower', () => {
  it('averages a slice of the ride, weighted by sample duration and skipping missing values', () => {
    const power = estimatePower(steadyRide(10, 5), 90)!;
    power.watts.set([100, 200, NaN, 300, 400]);
    power.durations.set([1, 1, 1, 2, 1]);
    expect(averagePower(power, 1, 5)).toBeCloseTo((200 + 300 * 2 + 400) / 4, 12);
  });

  it('is NaN for a slice without data', () => {
    const power = estimatePower(steadyRide(10, 5), 90)!;
    expect(averagePower(power, 3, 3)).toBeNaN();
  });
});
