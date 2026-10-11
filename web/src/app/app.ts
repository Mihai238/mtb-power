import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { RideChart } from './ride-chart/ride-chart';
import { finiteValues, nanMax } from './ride/arrays';
import { DISPLAY_SMOOTHING_S, estimatePower, PowerEstimate } from './ride/power';
import { hasHeartRate, Ride } from './ride/ride';

export type Show = 'both' | 'hr' | 'power';

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

@Component({
  selector: 'app-root',
  imports: [RideChart],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly smoothingS = DISPLAY_SMOOTHING_S;
  protected readonly showOptions: { value: Show; label: string }[] = [
    { value: 'both', label: 'Both' },
    { value: 'hr', label: 'Heart rate' },
    { value: 'power', label: 'Power' },
  ];

  protected readonly loaded = signal<Loaded | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly dragging = signal(false);

  protected readonly riderWeight = signal(80);
  protected readonly bikeWeight = signal(12);
  protected readonly gearWeight = signal(3);
  protected readonly show = signal<Show>('both');

  protected readonly totalMass = computed(() => this.riderWeight() + this.bikeWeight() + this.gearWeight());

  protected readonly view = computed<View | null>(() => {
    const loaded = this.loaded();
    if (!loaded) return null;
    const { ride } = loaded;
    const show = this.show();
    const view: View = { showHr: false, power: null, notices: [], error: null, stats: [] };

    if (ride.seconds.length === 0) {
      view.error = 'This file has no recorded samples.';
      return view;
    }

    let showHr = show !== 'power';
    if (showHr && !hasHeartRate(ride)) {
      if (show === 'hr') {
        view.error = 'No heart rate data in this file.';
        return view;
      }
      view.notices.push('No heart rate data in this file.');
      showHr = false;
    } else if (showHr) {
      const hr = finiteValues(ride.heartRate);
      const avg = hr.reduce((sum, v) => sum + v, 0) / hr.length;
      view.stats.push(
        { label: 'Avg heart rate', value: avg.toFixed(0), unit: 'bpm' },
        { label: 'Max heart rate', value: nanMax(ride.heartRate).toFixed(0), unit: 'bpm' },
      );
    }

    if (show !== 'hr') {
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
        view.stats.push(
          { label: 'Avg power', value: power.average.toFixed(0), unit: 'W' },
          { label: 'Normalized power', value: power.normalized.toFixed(0), unit: 'W' },
          { label: `Max power (${DISPLAY_SMOOTHING_S} s)`, value: nanMax(power.smoothed).toFixed(0), unit: 'W' },
          { label: 'Work', value: (power.workJoules / 1000).toFixed(0), unit: 'kJ' },
        );
      }
    }
    view.showHr = showHr;
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

  protected valueFrom<T extends string>(event: Event): T {
    return (event.target as HTMLSelectElement | HTMLInputElement).value as T;
  }
}
