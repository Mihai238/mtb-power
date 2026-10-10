import { anyFinite } from './arrays';

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
