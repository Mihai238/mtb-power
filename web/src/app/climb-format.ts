import { Climb } from './ride/climbs';

// Shown in place of a value that's unknown, e.g. power without a power estimate.
export const UNKNOWN = '–';

/**
 * A climb's numbers as text. The climbs table, the hover readout and the band labels all
 * use this, so they always show the same values.
 */
export interface ClimbText {
  length: string; // km
  gain: string; // m
  grade: string; // %
  time: string; // m:ss
  vam: string; // m/h
  power: string; // W
  perKg: string; // W/kg
}

export function formatClimb(climb: Climb, watts: number, riderKg: number): ClimbText {
  return {
    length: (climb.lengthM / 1000).toFixed(2),
    gain: climb.gainM.toFixed(0),
    grade: (climb.grade * 100).toFixed(1),
    time: formatDuration(climb.movingSeconds),
    vam: climb.vamMPerH.toFixed(0),
    power: formatWatts(watts),
    perKg: formatPerKg(watts, riderKg),
  };
}

export function formatWatts(watts: number): string {
  return Number.isFinite(watts) ? watts.toFixed(0) : UNKNOWN;
}

/** W/kg uses the rider's weight alone, as is usual, so it compares across bikes. */
export function formatPerKg(watts: number, riderKg: number): string {
  return Number.isFinite(watts) && riderKg > 0 ? (watts / riderKg).toFixed(1) : UNKNOWN;
}

/** m:ss, e.g. 11:07. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
