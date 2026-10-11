/**
 * Find the climbs in a ride from its altitude over distance.
 *
 * A climb runs from a low point up to the next high point. It ends once the rider has
 * dropped CLIMB_END_DROP_M below that high point, or ridden CLIMB_END_FLAT_M without
 * getting any higher, so short dips and brief flat bits stay part of the climb.
 */

import { averagePower, PowerEstimate, sampleDurations, segmentBounds } from './power';
import { Ride } from './ride';

export const CLIMB_END_DROP_M = 5;
export const CLIMB_END_FLAT_M = 200;
// Altimeter noise at the foot and the top shouldn't stretch a climb over the flat
// around it: it starts at the last point within this of its lowest point, and ends at
// the first point within this of its highest.
export const CLIMB_TRIM_M = 1;
export const MIN_CLIMB_GAIN_M = 20;
export const MIN_CLIMB_GRADE = 0.03;

export interface Climb {
  from: number; // sample index at the foot
  to: number; // sample index at the top; the stats below cover samples [from, to)
  lengthM: number;
  gainM: number;
  grade: number; // average over the whole climb
  movingSeconds: number; // pauses excluded
  vamMPerH: number; // metres climbed per hour of moving time
}

export function detectClimbs(ride: Ride): Climb[] {
  // Height gained or lost during a pause wasn't ridden (pushing with auto-pause on, or a
  // barometric altimeter drifting at a stop), so like power.ts, never measure across one:
  // each segment's altitude is shifted to carry on where the previous one ended.
  const valid: number[] = [];
  const heights: number[] = [];
  const distances: number[] = [];
  for (const [start, end] of segmentBounds(ride.seconds)) {
    let shift = NaN;
    for (let i = start; i < end; i++) {
      if (!(Number.isFinite(ride.distance[i]) && Number.isFinite(ride.altitude[i]))) continue;
      const k = valid.length;
      if (Number.isNaN(shift)) shift = k ? heights[k - 1] - ride.altitude[i] : 0;
      valid.push(i);
      heights.push(ride.altitude[i] + shift);
      distances.push(k ? Math.max(distances[k - 1], ride.distance[i]) : ride.distance[i]);
    }
  }
  const climbs: Climb[] = [];
  if (!valid.length) return climbs;
  const alt = (k: number) => heights[k];
  const dist = (k: number) => distances[k];
  const durations = sampleDurations(ride.seconds);

  const measure = (low: number, high: number): Climb | null => {
    let foot = low;
    for (let k = high; k >= low; k--) {
      if (alt(k) <= alt(low) + CLIMB_TRIM_M) {
        foot = k;
        break;
      }
    }
    let top = high;
    for (let k = foot; k <= high; k++) {
      if (alt(k) >= alt(high) - CLIMB_TRIM_M) {
        top = k;
        break;
      }
    }
    const lengthM = dist(top) - dist(foot);
    const gainM = alt(top) - alt(foot);
    if (!(lengthM > 0) || gainM < MIN_CLIMB_GAIN_M || gainM / lengthM < MIN_CLIMB_GRADE) return null;
    const [from, to] = [valid[foot], valid[top]];
    let movingSeconds = 0;
    for (let i = from; i < to; i++) movingSeconds += durations[i];
    return {
      from, to, lengthM, gainM, grade: gainM / lengthM, movingSeconds,
      vamMPerH: (gainM / movingSeconds) * 3600,
    };
  };

  // Positions in `valid` of the current candidate's lowest point and the highest point after it.
  let low = 0;
  let high = 0;
  for (let k = 1; k < valid.length; k++) {
    if (alt(k) > alt(high)) {
      high = k;
    } else if (alt(high) - alt(k) >= CLIMB_END_DROP_M || dist(k) - dist(high) >= CLIMB_END_FLAT_M) {
      const climb = measure(low, high);
      if (climb) climbs.push(climb);
      // The next climb starts from the lowest point since the top, and may already be underway.
      let next = high + 1;
      for (let j = next; j <= k; j++) if (alt(j) < alt(next)) next = j;
      low = high = next;
      for (let j = next; j <= k; j++) if (alt(j) > alt(high)) high = j;
    } else if (alt(k) < alt(low)) {
      // Lower than the foot before rising enough to count: start over from here.
      low = high = k;
    }
  }
  const last = measure(low, high);
  if (last) climbs.push(last);
  return climbs;
}

/** All the climbs taken together; NaN where there's no data, e.g. without any climbs. */
export interface ClimbTotals {
  movingSeconds: number;
  heartRateAvg: number;
  heartRateMax: number;
  powerAvg: number; // time-weighted, like averagePower()
  powerMax: number; // of the display-smoothed power
  workJoules: number;
}

export function climbTotals(ride: Ride, climbs: Climb[], power: PowerEstimate | null): ClimbTotals {
  let movingSeconds = 0;
  let hrSum = 0;
  let hrCount = 0;
  let heartRateMax = NaN;
  let workJoules = 0;
  let poweredSeconds = 0;
  let powerMax = NaN;
  for (const { from, to, movingSeconds: seconds } of climbs) {
    movingSeconds += seconds;
    for (let i = from; i <= to; i++) {
      const hr = ride.heartRate[i];
      if (Number.isFinite(hr) && !(hr <= heartRateMax)) heartRateMax = hr;
      const smoothed = power?.smoothed[i] ?? NaN;
      if (Number.isFinite(smoothed) && !(smoothed <= powerMax)) powerMax = smoothed;
      // Sums cover [from, to), like Climb.movingSeconds.
      if (i === to) continue;
      if (Number.isFinite(hr)) {
        hrSum += hr;
        hrCount++;
      }
      const watts = power?.watts[i] ?? NaN;
      if (Number.isFinite(watts)) {
        workJoules += watts * power!.durations[i];
        poweredSeconds += power!.durations[i];
      }
    }
  }
  return {
    movingSeconds,
    heartRateAvg: hrCount ? hrSum / hrCount : NaN,
    heartRateMax,
    powerAvg: poweredSeconds ? workJoules / poweredSeconds : NaN,
    powerMax,
    workJoules: poweredSeconds ? workJoules : NaN,
  };
}

/** The climbs of a ride with each one's average power and their totals. */
export interface ClimbSummary {
  climbs: Climb[];
  watts: number[]; // average power of each climb; NaN without a power estimate
  totals: ClimbTotals;
}

export function summarizeClimbs(ride: Ride, climbs: Climb[],
                                power: PowerEstimate | null): ClimbSummary {
  return {
    climbs,
    watts: climbs.map(c => (power ? averagePower(power, c.from, c.to) : NaN)),
    totals: climbTotals(ride, climbs, power),
  };
}
