/**
 * Estimate rider power from speed and altitude, using the standard cycling power model.
 *
 * At every sample, the rider's power covers
 *
 *     gravity:      m·g·sin(θ)·v
 *     rolling:      m·g·Crr·cos(θ)·v
 *     air drag:     ½·ρ·CdA·v³
 *     acceleration: (m + wheel inertia)·a·v
 *
 * divided by drivetrain efficiency. Negative results (coasting, braking) are clamped to 0,
 * because the rider can't produce negative power.
 */

import { anyFinite, clip, diff, median, searchLeft, searchRight } from './arrays';
import { Ride } from './ride';

export const G = 9.80665;

export interface BikeSetup {
  cdaM2: number; // drag area: frontal area × drag coefficient
  // Rolling resistance on the flat and on climbs/descents. Without surface data the
  // MTB setup assumes asphalt on the flat and gravel/singletrack on climbs and
  // descents, blending linearly between FLAT_GRADE and OFFROAD_GRADE.
  crrFlat: number;
  crrClimb: number;
  drivetrainEfficiency: number;
  // Rotating wheels and tires store kinetic energy too; roughly equivalent to this
  // much extra mass when accelerating.
  wheelInertiaKg: number;
}

export const MTB: BikeSetup = {
  cdaM2: 0.45, // upright MTB position
  // ~2.35" knobby tires at MTB pressures. The offroad value also has to cover losses
  // the model doesn't see: suspension, roots, body movement.
  crrFlat: 0.010,
  crrClimb: 0.020,
  drivetrainEfficiency: 0.96, // chain running in dirt, not a clean road drivetrain
  wheelInertiaKg: 1.5,
};

export const FLAT_GRADE = 0.02;
export const OFFROAD_GRADE = 0.04;
// The surface is a property of the road, so it's judged from the slope over a longer
// stretch; altimeter noise on a flat road shouldn't flip it to offroad.
export const SURFACE_HALF_WINDOW_M = 100;
export const DEFAULT_TEMPERATURE_C = 20.0;

// Samples further apart than this belong to different segments (pause, dropout);
// smoothing and acceleration never cross a segment boundary.
export const SEGMENT_GAP_S = 10;
export const SPEED_SMOOTHING_S = 5; // GPS speed jitter turns into fake acceleration spikes
export const GRADE_HALF_WINDOW_M = 25; // grade measured over 50 m of distance
export const MAX_GRADE = 0.35;
export const STOPPED_SPEED = 0.5; // m/s; below this the rider is treated as standing still
export const DISPLAY_SMOOTHING_S = 30; // 1-second estimates are too noisy to read directly
export const NP_WINDOW_S = 30; // fixed by the definition of Normalized Power

export interface PowerEstimate {
  watts: Float64Array; // per-sample estimate, NaN where speed/altitude are missing
  smoothed: Float64Array; // DISPLAY_SMOOTHING_S rolling average, for plotting
  grade: Float64Array;
  durations: Float64Array; // seconds each sample stands for (pauses excluded)
  normalized: number; // Normalized Power, see normalizedPower()
  workJoules: number;
  // Time-weighted over the moving segments, coasting counted as 0 W like a power meter.
  average: number;
}

/** [start, end) index ranges of the parts of the ride without a gap longer than `maxGap`. */
export function segmentBounds(seconds: ArrayLike<number>,
                              maxGap: number = SEGMENT_GAP_S): [number, number][] {
  const edges = [0];
  for (let i = 1; i < seconds.length; i++) {
    if (seconds[i] - seconds[i - 1] > maxGap) edges.push(i);
  }
  edges.push(seconds.length);
  return edges.slice(0, -1).map((a, k) => [a, edges[k + 1]]);
}

/** Centered, time-based rolling mean that ignores NaN and never crosses a pause. */
export function rollingMean(seconds: Float64Array, values: Float64Array,
                            windowS: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  for (const [start, end] of segmentBounds(seconds)) {
    const n = end - start;
    const sums = new Float64Array(n + 1);
    const counts = new Float64Array(n + 1);
    for (let k = 0; k < n; k++) {
      const v = values[start + k];
      const valid = Number.isFinite(v);
      sums[k + 1] = sums[k] + (valid ? v : 0);
      counts[k + 1] = counts[k] + (valid ? 1 : 0);
    }
    for (let k = 0; k < n; k++) {
      const t = seconds[start + k];
      const lo = searchLeft(seconds, t - windowS / 2, start, end) - start;
      const hi = searchRight(seconds, t + windowS / 2, start, end) - start;
      const count = counts[hi] - counts[lo];
      out[start + k] = count > 0 ? (sums[hi] - sums[lo]) / count : NaN;
    }
  }
  return out;
}

/**
 * Slope over a fixed distance window, so slow climbing doesn't amplify altimeter noise.
 *
 * A barometric altimeter drifts while the rider stands still (the air pressure changes,
 * not the height), so the window never crosses a pause, and around a standstill it
 * measures from the moment of leaving / to the moment of arriving.
 */
export function gradeFromAltitude(seconds: Float64Array, distance: Float64Array,
                                  altitude: Float64Array,
                                  halfWindowM: number = GRADE_HALF_WINDOW_M): Float64Array {
  const grade = new Float64Array(distance.length).fill(NaN);
  for (const [start, end] of segmentBounds(seconds)) {
    const valid: number[] = [];
    for (let i = start; i < end; i++) {
      if (Number.isFinite(distance[i]) && Number.isFinite(altitude[i])) valid.push(i);
    }
    if (valid.length < 2) continue;
    const d = new Float64Array(valid.length);
    const alt = new Float64Array(valid.length);
    for (let k = 0; k < valid.length; k++) {
      d[k] = k ? Math.max(d[k - 1], distance[valid[k]]) : distance[valid[k]];
      alt[k] = altitude[valid[k]];
    }
    for (let k = 0; k < d.length; k++) {
      // Last sample at or before d - window (the departure from any stop there) ...
      const lo = Math.max(searchRight(d, d[k] - halfWindowM) - 1, 0);
      // ... and first sample at or after d + window (the arrival at any stop there).
      const hi = Math.min(searchLeft(d, d[k] + halfWindowM), d.length - 1);
      const span = d[hi] - d[lo];
      const g = span >= halfWindowM / 2 ? (alt[hi] - alt[lo]) / span : 0;
      grade[valid[k]] = clip(g, -MAX_GRADE, MAX_GRADE);
    }
  }
  return grade;
}

export function airDensity(altitudeM: number, temperatureC: number): number {
  const pressure = 101325 * (1 - 2.25577e-5 * altitudeM) ** 5.25588;
  return pressure / (287.05 * (temperatureC + 273.15));
}

export function rollingResistance(grade: number, bike: BikeSetup): number {
  const climbShare = clip((Math.abs(grade) - FLAT_GRADE) / (OFFROAD_GRADE - FLAT_GRADE), 0, 1);
  return bike.crrFlat + climbShare * (bike.crrClimb - bike.crrFlat);
}

/** d(speed)/dt per segment, like numpy.gradient: central differences, one-sided at the ends. */
export function acceleration(seconds: Float64Array, speed: Float64Array): Float64Array {
  const accel = new Float64Array(speed.length);
  for (const [start, end] of segmentBounds(seconds)) {
    if (end - start < 2) continue;
    const dx = diff(seconds.subarray(start, end));
    const uniform = dx.every(v => v === dx[0]);
    accel[start] = (speed[start + 1] - speed[start]) / dx[0];
    accel[end - 1] = (speed[end - 1] - speed[end - 2]) / dx[dx.length - 1];
    for (let i = start + 1; i < end - 1; i++) {
      if (uniform) {
        accel[i] = (speed[i + 1] - speed[i - 1]) / (2 * dx[0]);
      } else {
        const dx1 = dx[i - 1 - start];
        const dx2 = dx[i - start];
        const a = -dx2 / (dx1 * (dx1 + dx2));
        const b = (dx2 - dx1) / (dx1 * dx2);
        const c = dx1 / (dx2 * (dx1 + dx2));
        accel[i] = a * speed[i - 1] + b * speed[i] + c * speed[i + 1];
      }
    }
  }
  return accel;
}

/** Return null if the ride lacks the speed, distance or altitude data the model needs. */
export function estimatePower(ride: Ride, totalMassKg: number,
                              bike: BikeSetup = MTB): PowerEstimate | null {
  if (![ride.speed, ride.distance, ride.altitude].every(anyFinite)) return null;

  const speed = rollingMean(ride.seconds, ride.speed, SPEED_SMOOTHING_S);
  const grade = gradeFromAltitude(ride.seconds, ride.distance, ride.altitude);
  const surfaceGrade = gradeFromAltitude(ride.seconds, ride.distance, ride.altitude,
                                         SURFACE_HALF_WINDOW_M);
  const accel = acceleration(ride.seconds, speed);
  const temperatureC = ride.temperatureC ?? DEFAULT_TEMPERATURE_C;

  const watts = new Float64Array(speed.length);
  for (let i = 0; i < watts.length; i++) {
    const v = speed[i];
    const theta = Math.atan(grade[i]);
    const rho = airDensity(ride.altitude[i], temperatureC);
    // Keep NaN (unknown) wherever an input was missing, rather than a fake 0.
    if (!(Number.isFinite(v) && Number.isFinite(grade[i]) && Number.isFinite(rho))) {
      watts[i] = NaN;
      continue;
    }
    const force =
      totalMassKg * G * Math.sin(theta)
      + totalMassKg * G * rollingResistance(surfaceGrade[i], bike) * Math.cos(theta)
      + 0.5 * rho * bike.cdaM2 * v ** 2
      + (totalMassKg + bike.wheelInertiaKg) * accel[i];
    const w = force * v / bike.drivetrainEfficiency;
    watts[i] = v < STOPPED_SPEED ? 0 : Math.max(w, 0);
  }

  const smoothed = rollingMean(ride.seconds, watts, DISPLAY_SMOOTHING_S);
  const durations = sampleDurations(ride.seconds);
  let workJoules = 0;
  let movingSeconds = 0;
  for (let i = 0; i < watts.length; i++) {
    if (Number.isFinite(watts[i])) {
      workJoules += watts[i] * durations[i];
      movingSeconds += durations[i];
    }
  }
  return {
    watts, smoothed, grade, durations, workJoules,
    average: workJoules / movingSeconds,
    normalized: normalizedPower(ride.seconds, watts, durations),
  };
}

/** Time-weighted average of samples [from, to), like PowerEstimate.average; NaN without data. */
export function averagePower({ watts, durations }: PowerEstimate, from: number, to: number): number {
  let work = 0;
  let seconds = 0;
  for (let i = Math.max(from, 0); i < Math.min(to, watts.length); i++) {
    if (Number.isFinite(watts[i])) {
      work += watts[i] * durations[i];
      seconds += durations[i];
    }
  }
  return seconds > 0 ? work / seconds : NaN;
}

/**
 * 4th root of the time-weighted mean of the 30 s rolling average to the 4th power, so
 * hard efforts count more than steady riding. Like the average, it covers moving
 * segments only, with coasting as 0 W.
 */
export function normalizedPower(seconds: Float64Array, watts: Float64Array,
                                durations: Float64Array): number {
  const rolling = rollingMean(seconds, watts, NP_WINDOW_S);
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < rolling.length; i++) {
    if (Number.isFinite(rolling[i])) {
      weighted += rolling[i] ** 4 * durations[i];
      total += durations[i];
    }
  }
  return (weighted / total) ** 0.25;
}

/** Time until the next sample; across a pause, assume the typical recording interval. */
export function sampleDurations(seconds: Float64Array): Float64Array {
  if (seconds.length < 2) return new Float64Array(seconds.length).fill(1);
  const dt = diff(seconds);
  const typical = median(dt);
  const out = new Float64Array(seconds.length);
  dt.forEach((v, i) => (out[i] = v > SEGMENT_GAP_S ? typical : v));
  out[out.length - 1] = typical;
  return out;
}
