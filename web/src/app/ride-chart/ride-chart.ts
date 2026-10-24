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
import { ClimbSummary } from '../ride/climbs';
import { averagePower, PowerEstimate } from '../ride/power';
import { Ride } from '../ride/ride';
import { Timeline } from '../ride/timeline';
import {
  ALTITUDE_SERIES_ID, buildChartOption, CLIMB_LABEL_FONT, CLIMB_LABEL_PADDING_X, climbBands,
  climbLabels, climbLabelsShown, POWER_SERIES_ID, selectionMarkArea, timeAxisEnd,
} from './chart-option';

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
  readonly timeline = input.required<Timeline>();
  readonly power = input<PowerEstimate | null>(null);
  readonly title = input('');
  readonly showHr = input(true);
  readonly climbs = input.required<ClimbSummary>();
  readonly riderKg = input(0);

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('chart');
  private readonly destroyRef = inject(DestroyRef);
  private chart?: echarts.ECharts;
  // Selected stretch in moving minutes, kept across redraws (e.g. a new weight).
  private selection: [number, number] | null = null;
  // The ride last drawn: redrawing the same ride keeps the zoom, a new one starts unzoomed.
  private drawnRide?: Ride;
  private dragStartPx: number | null = null;
  // Which climb labels were last shown, kept across redraws so they don't flicker.
  private labelsShown: boolean[] = [];
  private measureContext?: CanvasRenderingContext2D | null;

  constructor() {
    afterRenderEffect(() => {
      const ride = this.ride();
      const option = buildChartOption({
        ride, timeline: this.timeline(), power: this.power(), title: this.title(),
        showHr: this.showHr(), climbs: this.climbs(), riderKg: this.riderKg(),
        climbLabelsShown: this.labelsShown,
      });
      if (!this.chart) this.chart = this.init(this.container().nativeElement);
      const sameRide = ride === this.drawnRide;
      // A selection on another ride means nothing on this one.
      if (!sameRide) this.selection = null;
      const zoom = sameRide ? this.zoomRange() : null;
      // Lazy, so the redraw, the zoom and the selection render once together.
      this.chart.setOption(option, { notMerge: true, lazyUpdate: true });
      if (zoom) this.chart.setOption({ dataZoom: [zoom] }, { lazyUpdate: true });
      this.drawnRide = ride;
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
    // Where the labels land depends on the chart's width and zoom, so lay them out after
    // every render. Hiding or showing labels renders again, the same way, so this settles.
    chart.on('finished', () => this.layoutClimbLabels());
    return chart;
  }

  /** Zooms the time axis in on climb k, from its start to its end. */
  zoomToClimb(k: number): void {
    const climb = this.climbs().climbs[k];
    if (!this.chart || !climb) return;
    const { minutes } = this.timeline();
    this.chart.dispatchAction({
      type: 'dataZoom', startValue: minutes[climb.from], endValue: minutes[climb.to],
    });
  }

  /** Hides the labels of shorter climbs where labels would overlap on screen. */
  private layoutClimbLabels(): void {
    const chart = this.chart;
    if (!chart || !this.power()) return;
    const summary = this.climbs();
    const { minutes } = this.timeline();
    const end = timeAxisEnd(minutes);
    // ECharts centres a label on the visible part of its band.
    const zoom = this.zoomRange() ?? { start: 0, end: 100 };
    const toPx = (m: number) => chart.convertToPixel({ xAxisIndex: 0 }, m) as number;
    const left = toPx((zoom.start / 100) * end);
    const right = toPx((zoom.end / 100) * end);
    const clamp = (px: number) => Math.min(Math.max(px, left), right);
    const spans = climbLabels(summary.watts).map((text, k): [number, number] => {
      const { from, to } = summary.climbs[k];
      const middle = (clamp(toPx(minutes[from])) + clamp(toPx(minutes[to]))) / 2;
      const half = text ? this.textWidth(text) / 2 + CLIMB_LABEL_PADDING_X : 0;
      return [middle - half, middle + half];
    });
    const lengths = summary.climbs.map(c => minutes[c.to] - minutes[c.from]);
    const shown = climbLabelsShown(spans, lengths);
    if (shown.length === this.labelsShown.length &&
        shown.every((s, k) => s === this.labelsShown[k])) return;
    this.labelsShown = shown;
    chart.setOption({
      series: [{ id: ALTITUDE_SERIES_ID, markArea: { data: climbBands(minutes, summary, shown) } }],
    }, { lazyUpdate: true });
  }

  private textWidth(text: string): number {
    this.measureContext ??= document.createElement('canvas').getContext('2d');
    if (!this.measureContext) return text.length * 7;
    this.measureContext.font = CLIMB_LABEL_FONT;
    return this.measureContext.measureText(text).width;
  }

  /** The current zoom, as percentages of the time axis. */
  private zoomRange(): { start: number; end: number } | null {
    const [zoom] = (this.chart?.getOption()['dataZoom'] ?? []) as { start: number; end: number }[];
    return zoom ? { start: zoom.start, end: zoom.end } : null;
  }

  /** Moving minutes under a horizontal pixel position, clamped to the ride. */
  private toMinutes(x: number): number {
    const value = this.chart!.convertFromPixel({ xAxisIndex: 0 }, x) as number;
    const { minutes } = this.timeline();
    const end = minutes.length ? minutes[minutes.length - 1] : 0;
    return Math.min(Math.max(value, 0), end);
  }

  private drawSelection(): void {
    const power = this.power();
    if (!this.chart || !power) return;
    let markArea: Record<string, unknown> = { data: [] };
    if (this.selection) {
      const from = Math.min(...this.selection);
      const to = Math.max(...this.selection);
      const { minutes } = this.timeline();
      const average = averagePower(power, searchLeft(minutes, from), searchRight(minutes, to));
      markArea = selectionMarkArea(from, to, average);
    }
    this.chart.setOption({ series: [{ id: POWER_SERIES_ID, markArea }] }, { lazyUpdate: true });
  }
}
