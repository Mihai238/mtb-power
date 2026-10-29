import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';

import { ClimbText, formatClimb, formatPerKg, UNKNOWN } from './climb-format';
import { Home } from './home/home';
import { RideChart } from './ride-chart/ride-chart';
import { detectClimbs, summarizeClimbs } from './ride/climbs';
import { DISPLAY_SMOOTHING_S, estimatePower, hasPowerData } from './ride/power';
import { hasHeartRate, Ride } from './ride/ride';
import { movingMinutes } from './ride/timeline';

// Opened from the home page. Relative, so it resolves against the base href.
const DEMO_FILE = 'demo-ride.fit';

interface Loaded {
  fileName: string;
  ride: Ride;
}

/** Messages and stats for the current file and settings. */
interface View {
  showHr: boolean;
  notices: string[];
  error: string | null;
  stats: { label: string; value: string; unit: string }[];
}

/** One row of the climbs table. */
interface ClimbRow extends ClimbText {
  start: string; // moving minutes, as on the chart's time axis
}

@Component({
  selector: 'app-root',
  imports: [Home, RideChart],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly smoothingS = DISPLAY_SMOOTHING_S;

  // Deferred, so it's only there once the chart has loaded.
  protected readonly chart = viewChild(RideChart);

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

  protected readonly timeline = computed(() => {
    const loaded = this.loaded();
    return loaded ? movingMinutes(loaded.ride.seconds) : null;
  });

  // Null without a usable weight or without the speed/altitude data the model needs.
  protected readonly power = computed(() => {
    const loaded = this.loaded();
    const mass = this.totalMass();
    return loaded && mass > 0 ? estimatePower(loaded.ride, mass) : null;
  });

  // Each climb's average power and the totals over all climbs, for the stats, table and chart.
  protected readonly climbSummary = computed(() => {
    const loaded = this.loaded();
    return loaded ? summarizeClimbs(loaded.ride, this.climbs(), this.power()) : null;
  });

  protected readonly climbRows = computed<ClimbRow[]>(() => {
    const summary = this.climbSummary();
    const timeline = this.timeline();
    if (!summary || !timeline) return [];
    const riderKg = this.riderWeight();
    return summary.climbs.map((climb, k) => ({
      start: timeline.minutes[climb.from].toFixed(1),
      ...formatClimb(climb, summary.watts[k], riderKg),
    }));
  });

  protected readonly view = computed<View | null>(() => {
    const loaded = this.loaded();
    if (!loaded) return null;
    const { ride } = loaded;
    const view: View = { showHr: false, notices: [], error: null, stats: [] };

    if (ride.seconds.length === 0) {
      view.error = 'This file has no recorded samples.';
      return view;
    }

    const showHr = hasHeartRate(ride);
    if (!showHr) view.notices.push('No heart rate data in this file.');

    const power = this.power();
    if (!power && !hasPowerData(ride)) {
      // Without heart rate or speed/altitude there's nothing to plot.
      const reason = "No speed/altitude data in this file, so power can't be estimated.";
      if (!showHr) {
        view.error = reason;
        return view;
      }
      view.notices.push(reason);
    } else if (!power) {
      // The data is there, so a weight is being retyped: only a notice, so the chart (with
      // at least the elevation profile) and its zoom stay put.
      view.notices.push('Enter rider, bike and gear weights to estimate power.');
    }
    view.showHr = showHr;

    // Stats cover the climbs only: that's where the power estimate holds up.
    const summary = this.climbSummary()!;
    if (!summary.climbs.length) {
      view.notices.push('No climbs in this ride, so there are no stats.');
      return view;
    }
    const { totals } = summary;
    const stat = (label: string, value: number, digits: number, unit: string) => {
      if (Number.isFinite(value)) view.stats.push({ label, value: value.toFixed(digits), unit });
    };
    stat('Climbing', totals.movingSeconds / 60, 0, 'min');
    if (showHr) {
      stat('Avg HR on climbs', totals.heartRateAvg, 0, 'bpm');
      stat('Max HR on climbs', totals.heartRateMax, 0, 'bpm');
    }
    if (power) {
      const perKg = formatPerKg(totals.powerAvg, this.riderWeight());
      const unit = perKg === UNKNOWN ? 'W' : `W (${perKg} W/kg)`;
      stat('Avg power on climbs', totals.powerAvg, 0, unit);
      stat(`Max power on climbs (${DISPLAY_SMOOTHING_S} s)`, totals.powerMax, 0, 'W');
      stat('Work on climbs', totals.workJoules / 1000, 0, 'kJ');
    }
    return view;
  });

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

  protected async openDemo(): Promise<void> {
    try {
      const response = await fetch(DEMO_FILE);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
      await this.open(new File([await response.blob()], DEMO_FILE));
    } catch (error) {
      this.loadError.set(`Could not load the demo ride: ${error instanceof Error ? error.message : error}`);
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
