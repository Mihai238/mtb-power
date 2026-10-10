import {
  afterRenderEffect, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input,
  viewChild,
} from '@angular/core';
import { LineChart } from 'echarts/charts';
import {
  DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent,
  ToolboxComponent, TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

import { PowerEstimate } from '../ride/power';
import { Ride } from '../ride/ride';
import { buildChartOption } from './chart-option';

echarts.use([
  LineChart, DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent,
  TitleComponent, ToolboxComponent, TooltipComponent, CanvasRenderer,
]);

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

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('chart');
  private readonly destroyRef = inject(DestroyRef);
  private chart?: echarts.ECharts;

  constructor() {
    afterRenderEffect(() => {
      const option = buildChartOption({
        ride: this.ride(), power: this.power(), title: this.title(),
        showHr: this.showHr(),
      });
      if (!this.chart) {
        const element = this.container().nativeElement;
        this.chart = echarts.init(element);
        const resize = new ResizeObserver(() => this.chart?.resize());
        resize.observe(element);
        this.destroyRef.onDestroy(() => {
          resize.disconnect();
          this.chart?.dispose();
        });
      }
      this.chart.setOption(option, { notMerge: true });
    });
  }
}
