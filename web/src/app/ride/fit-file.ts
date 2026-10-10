import { Decoder, Stream } from '@garmin/fitsdk';

import { Ride } from './ride';

type Message = Record<string, unknown>;

function first(message: Message, ...names: string[]): number {
  for (const name of names) {
    const value = message[name];
    if (typeof value === 'number') return value;
  }
  return NaN;
}

function toMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  return null;
}

/** Read every `record` message in a FIT file. Throws if the file can't be decoded. */
export function loadRide(bytes: ArrayBuffer | Uint8Array): Ride {
  const stream = Stream.fromByteArray(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  if (!Decoder.isFIT(stream)) throw new Error('not a FIT file');

  // Some devices (e.g. COROS) write field definitions whose size doesn't match the field's
  // type. The decoder reads what it can; only give up if it found no samples at all.
  const { messages, errors } = new Decoder(stream).read({
    // Keep heart rate exactly as the records report it.
    mergeHeartRates: false,
  });
  const records = (messages.recordMesgs ?? []) as unknown as Message[];
  if (errors.length && !records.length) throw errors[0];

  let temperatureC: number | null = null;
  for (const session of (messages.sessionMesgs ?? []) as unknown as Message[]) {
    if ('avgTemperature' in session) {
      const value = session['avgTemperature'];
      temperatureC = typeof value === 'number' ? value : null;
    }
  }

  const rows: { t: number; hr: number; speed: number; distance: number; altitude: number }[] = [];
  for (const record of records) {
    const t = toMillis(record['timestamp']);
    if (t === null) continue;
    let hr = first(record, 'heartRate');
    // Devices write 0 when the strap drops out.
    if (hr === 0) hr = NaN;
    rows.push({
      t,
      hr,
      speed: first(record, 'enhancedSpeed', 'speed'),
      distance: first(record, 'distance'),
      altitude: first(record, 'enhancedAltitude', 'altitude'),
    });
  }

  if (!rows.length) {
    const empty = () => new Float64Array(0);
    return {
      start: null, seconds: empty(), heartRate: empty(), speed: empty(),
      distance: empty(), altitude: empty(), temperatureC,
    };
  }

  // Everything downstream assumes strictly increasing time: sort, and keep the first of
  // any samples sharing a timestamp. The sort is stable, so "first" means first in the file.
  rows.sort((a, b) => a.t - b.t);
  const kept = rows.filter((r, i) => i === 0 || r.t !== rows[i - 1].t);
  const start = kept[0].t;
  const column = (pick: (r: (typeof kept)[number]) => number) => Float64Array.from(kept, pick);
  return {
    start: new Date(start),
    seconds: column(r => (r.t - start) / 1000),
    heartRate: column(r => r.hr),
    speed: column(r => r.speed),
    distance: column(r => r.distance),
    altitude: column(r => r.altitude),
    temperatureC,
  };
}
