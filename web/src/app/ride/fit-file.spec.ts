import { Encoder, FileIdMesg, Profile, RecordMesg, SessionMesg } from '@garmin/fitsdk';

import { loadRide } from './fit-file';
import { hasHeartRate } from './ride';

const START = new Date('2026-10-09T12:00:00Z');
const at = (seconds: number) => new Date(START.getTime() + seconds * 1000);

function fitFile(records: RecordMesg[], session?: SessionMesg): Uint8Array {
  const encoder = new Encoder();
  const fileId: FileIdMesg = {
    manufacturer: 'development', product: 1, timeCreated: START, type: 'activity',
  };
  encoder.onMesg(Profile.MesgNum['FILE_ID'], fileId);
  for (const record of records) encoder.onMesg(Profile.MesgNum['RECORD'], record);
  if (session) encoder.onMesg(Profile.MesgNum['SESSION'], session);
  return encoder.close();
}

describe('loadRide', () => {
  it('reads the samples, sorted, keeping the first of duplicate timestamps', () => {
    const ride = loadRide(fitFile([
      { timestamp: at(2), heartRate: 130, speed: 5, distance: 10, altitude: 100 },
      { timestamp: at(0), heartRate: 120, speed: 4, distance: 0, altitude: 99 },
      { timestamp: at(2), heartRate: 199, speed: 9, distance: 99, altitude: 999 },
      { timestamp: at(3), heartRate: 0, distance: 15, altitude: 101 },
    ], { timestamp: at(3), avgTemperature: 22 }));

    expect(ride.start).toEqual(START);
    expect(Array.from(ride.seconds)).toEqual([0, 2, 3]);
    // A heart rate of 0 is a strap dropout, not a reading.
    expect(Array.from(ride.heartRate)).toEqual([120, 130, NaN]);
    expect(Array.from(ride.speed)).toEqual([4, 5, NaN]);
    expect(Array.from(ride.distance)).toEqual([0, 10, 15]);
    expect(Array.from(ride.altitude)).toEqual([99, 100, 101]);
    expect(ride.temperatureC).toBe(22);
    expect(hasHeartRate(ride)).toBe(true);
  });

  it('returns an empty ride for a file without records', () => {
    const ride = loadRide(fitFile([]));
    expect(ride.seconds.length).toBe(0);
    expect(ride.temperatureC).toBeNull();
    expect(hasHeartRate(ride)).toBe(false);
  });

  it('rejects a file that is not FIT', () => {
    expect(() => loadRide(new TextEncoder().encode('not a fit file at all'))).toThrow('not a FIT file');
  });
});
