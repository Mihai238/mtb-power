import {
  afterRenderEffect, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input,
  viewChild,
} from '@angular/core';
import { LineChart } from 'echarts/charts';
import {
  DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent,
  TitleComponent, ToolboxComponent, TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

import { searchLeft, searchRight } from '../ride/arrays';
import { averagePower, PowerEstimate } from '../ride/power';
import { Ride } from '../ride/ride';
import { movingMinutes } from '../ride/timeline';
import { buildChartOption, POWER_SERIES_ID, selectionMarkArea } from './chart-option';

echarts.use([
  LineChart, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent,
  MarkLineComponent, TitleComponent, ToolboxComponent, TooltipComponent, CanvasRenderer,
]);

// A press that moves less than this is a click, which clears the selection.
const CLICK_TOLERANCE_PX = 3;

interface PointerEvent {
  offsetX: number;
  offsetY: number;
  event: { shiftKey?: boolean };
}

@Component({
  selector: 'app-ride-chart',
  template: '<div #chart class="chart"></div>',
  styles: ':host { display: block; } .chart { width: 100%; height: 100%; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RideChart {
  readonly ride = input.required<Ride>();
  readonly power = input<PowerEstimate | null>(null);
  readonly title = input('');
  readonly showHr = input(true);
  readonly riderKg = input(0);

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('chart');
  private readonly destroyRef = inject(DestroyRef);
  private chart?: echarts.ECharts;
  private minutes: Float64Array = new Float64Array();
  // Selected stretch in moving minutes, kept across redraws (e.g. a new weight).
  private selection: [number, number] | null = null;
  private dragStartPx: number | null = null;

  constructor() {
    afterRenderEffect(() => {
      const ride = this.ride();
      const option = buildChartOption({
        ride, power: this.power(), title: this.title(), showHr: this.showHr(),
        riderKg: this.riderKg(),
      });
      this.minutes = movingMinutes(ride.seconds).minutes;
      if (!this.chart) this.chart = this.init(this.container().nativeElement);
      this.chart.setOption(option, { notMerge: true });
      this.drawSelection();
    });
  }

  private init(element: HTMLDivElement): echarts.ECharts {
    const chart = echarts.init(element);
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(element);
    this.destroyRef.onDestroy(() => {
      resize.disconnect();
      chart.dispose();
    });

    // Dragging across the plot selects a stretch of the ride; shift + drag pans instead.
    const zr = chart.getZr();
    zr.on('mousedown', (e: PointerEvent) => {
      if (!this.power() || e.event.shiftKey) return;
      if (!chart.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return;
      this.dragStartPx = e.offsetX;
    });
    zr.on('mousemove', (e: PointerEvent) => {
      if (this.dragStartPx === null) return;
      if (Math.abs(e.offsetX - this.dragStartPx) < CLICK_TOLERANCE_PX) return;
      this.selection = [this.toMinutes(this.dragStartPx), this.toMinutes(e.offsetX)];
      this.drawSelection();
    });
    zr.on('mouseup', (e: PointerEvent) => {
      if (this.dragStartPx === null) return;
      if (Math.abs(e.offsetX - this.dragStartPx) < CLICK_TOLERANCE_PX) this.selection = null;
      this.dragStartPx = null;
      this.drawSelection();
    });
    // "Reset zoom" restores the original option, which has no selection.
    chart.on('restore', () => {
      this.selection = null;
    });
    return chart;
  }

  /** Moving minutes under a horizontal pixel position, clamped to the ride. */
  private toMinutes(x: number): number {
    const value = this.chart!.convertFromPixel({ xAxisIndex: 0 }, x) as number;
    const end = this.minutes.length ? this.minutes[this.minutes.length - 1] : 0;
    return Math.min(Math.max(value, 0), end);
  }

  private drawSelection(): void {
    const power = this.power();
    if (!this.chart || !power) return;
    let markArea: Record<string, unknown> = { data: [] };
    if (this.selection) {
      const from = Math.min(...this.selection);
      const to = Math.max(...this.selection);
      const average = averagePower(power, searchLeft(this.minutes, from),
                                   searchRight(this.minutes, to));
      markArea = selectionMarkArea(from, to, average);
    }
    this.chart.setOption({ series: [{ id: POWER_SERIES_ID, markArea }] }, { lazyUpdate: true });
  }
}
