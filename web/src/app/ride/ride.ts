import { anyFinite } from './arrays';

// Samples further apart than this belong to different segments (a pause or a dropout).
// Smoothing and acceleration never cross a segment boundary, climbs don't count height
// gained across one, and the chart cuts the gap out of its time axis.
export const SEGMENT_GAP_S = 10;

/** Per-second samples from a FIT activity. Missing values are NaN. */
export interface Ride {
  start: Date | null;
  seconds: Float64Array; // elapsed wall-clock time since the first sample
  heartRate: Float64Array; // bpm
  speed: Float64Array; // m/s
  distance: Float64Array; // m
  altitude: Float64Array; // m
  temperatureC: number | null; // session average, used for air density
}

export function hasHeartRate(ride: Ride): boolean {
  return anyFinite(ride.heartRate);
}
