import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { RideChart } from './ride-chart/ride-chart';
import { climbTotals, detectClimbs, formatDuration } from './ride/climbs';
import { averagePower, DISPLAY_SMOOTHING_S, estimatePower, PowerEstimate } from './ride/power';
import { hasHeartRate, Ride } from './ride/ride';
import { movingMinutes } from './ride/timeline';

// Shown until the rider opens a file of their own. Relative, so it resolves against the base href.
const DEMO_FILE = 'demo-ride.fit';

interface Loaded {
  fileName: string;
  ride: Ride;
}

/** What to plot for the current file and settings, mirroring the command-line version. */
interface View {
  showHr: boolean;
  power: PowerEstimate | null;
  notices: string[];
  error: string | null;
  stats: { label: string; value: string; unit: string }[];
}

/** One row of the climbs table, formatted; '–' where a value is unknown. */
interface ClimbRow {
  start: string;
  length: string;
  gain: string;
  grade: string;
  time: string;
  vam: string;
  power: string;
  perKg: string;
}

@Component({
  selector: 'app-root',
  imports: [RideChart],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly smoothingS = DISPLAY_SMOOTHING_S;

  protected readonly loaded = signal<Loaded | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly dragging = signal(false);

  protected readonly riderWeight = signal(80);
  protected readonly bikeWeight = signal(12);
  protected readonly gearWeight = signal(3);

  protected readonly totalMass = computed(() => this.riderWeight() + this.bikeWeight() + this.gearWeight());

  // Climbs depend on the ride alone, so they're found once per file, not on every setting change.
  protected readonly climbs = computed(() => {
    const loaded = this.loaded();
    return loaded ? detectClimbs(loaded.ride) : [];
  });

  protected readonly climbRows = computed<ClimbRow[]>(() => {
    const loaded = this.loaded();
    if (!loaded) return [];
    const power = this.view()?.power ?? null;
    const riderKg = this.riderWeight();
    const { minutes } = movingMinutes(loaded.ride.seconds);
    return this.climbs().map(climb => {
      const watts = power ? averagePower(power, climb.from, climb.to) : NaN;
      return {
        start: minutes[climb.from].toFixed(1),
        length: (climb.lengthM / 1000).toFixed(2),
        gain: climb.gainM.toFixed(0),
        grade: (climb.grade * 100).toFixed(1),
        time: formatDuration(climb.movingSeconds),
        vam: climb.vamMPerH.toFixed(0),
        power: Number.isFinite(watts) ? watts.toFixed(0) : '–',
        perKg: Number.isFinite(watts) && riderKg > 0 ? (watts / riderKg).toFixed(1) : '–',
      };
    });
  });

  protected readonly view = computed<View | null>(() => {
    const loaded = this.loaded();
    if (!loaded) return null;
    const { ride } = loaded;
    const view: View = { showHr: false, power: null, notices: [], error: null, stats: [] };

    if (ride.seconds.length === 0) {
      view.error = 'This file has no recorded samples.';
      return view;
    }

    const showHr = hasHeartRate(ride);
    if (!showHr) view.notices.push('No heart rate data in this file.');

    const mass = this.totalMass();
    if (!(mass > 0)) {
      view.error = 'Enter rider and bike weights to estimate power.';
      return view;
    }
    const power = estimatePower(ride, mass);
    if (!power) {
      if (!showHr) {
        view.error = "No speed/altitude data in this file, so power can't be estimated.";
        return view;
      }
      view.notices.push("No speed/altitude data in this file, so power can't be estimated.");
    } else {
      view.power = power;
    }
    view.showHr = showHr;

    // Stats cover the climbs only: that's where the power estimate holds up.
    const climbs = this.climbs();
    if (!climbs.length) {
      view.notices.push('No climbs in this ride, so there are no stats.');
      return view;
    }
    const totals = climbTotals(ride, climbs, view.power);
    const stat = (label: string, value: number, digits: number, unit: string) => {
      if (Number.isFinite(value)) view.stats.push({ label, value: value.toFixed(digits), unit });
    };
    stat('Climbing', totals.movingSeconds / 60, 0, 'min');
    if (showHr) {
      stat('Avg HR on climbs', totals.heartRateAvg, 0, 'bpm');
      stat('Max HR on climbs', totals.heartRateMax, 0, 'bpm');
    }
    if (view.power) {
      const riderKg = this.riderWeight();
      const perKg = riderKg > 0 ? ` (${(totals.powerAvg / riderKg).toFixed(1)} W/kg)` : '';
      stat('Avg power on climbs', totals.powerAvg, 0, `W${perKg}`);
      stat(`Max power on climbs (${DISPLAY_SMOOTHING_S} s)`, totals.powerMax, 0, 'W');
      stat('Work on climbs', totals.workJoules / 1000, 0, 'kJ');
    }
    return view;
  });

  constructor() {
    void this.openDemo();
  }

  protected async open(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      // The FIT SDK carries the whole FIT profile, so it's only downloaded once it's needed.
      const { loadRide } = await import('./ride/fit-file');
      const ride = loadRide(await file.arrayBuffer());
      this.loaded.set({ fileName: file.name, ride });
      this.loadError.set(null);
    } catch (error) {
      this.loaded.set(null);
      this.loadError.set(`Could not read ${file.name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async openDemo(): Promise<void> {
    try {
      const response = await fetch(DEMO_FILE);
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      const { loadRide } = await import('./ride/fit-file');
      // The rider may have opened a file of their own in the meantime.
      if (this.loaded() || this.loadError()) return;
      this.loaded.set({ fileName: DEMO_FILE, ride: loadRide(bytes) });
    } catch {
      // Without the demo the page just asks for a file.
    }
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.open(input.files?.[0]);
    // Let the same file be picked again after it was edited on disk.
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.open(event.dataTransfer?.files[0]);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected numberFrom(event: Event): number {
    return (event.target as HTMLInputElement).valueAsNumber;
  }
}
