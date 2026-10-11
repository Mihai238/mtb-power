import type { EChartsCoreOption } from 'echarts/core';

import { nanMax, nanMean, nanMin } from '../ride/arrays';
import { Climb, detectClimbs } from '../ride/climbs';
import { averagePower, DISPLAY_SMOOTHING_S, PowerEstimate } from '../ride/power';
import { Ride } from '../ride/ride';
import { movingMinutes, withGaps } from '../ride/timeline';

export const HR_COLOR = '#d6336c';
export const POWER_COLOR = '#1c7ed6';
const ALTITUDE_COLOR = '#e0e0e0';
const AVERAGE_COLOR = '#666';
const PAUSE_COLOR = '#999';
const GRID_COLOR = '#e6e6e6';
const SELECTION_COLOR = 'rgba(28, 126, 214, 0.12)';
const CLIMB_COLOR = 'rgba(247, 103, 7, 0.1)';
const CLIMB_TEXT_COLOR = '#d9480f';

export const POWER_SERIES_ID = 'power';

export interface ChartInput {
  ride: Ride;
  power: PowerEstimate | null;
  title: string;
  showHr: boolean;
  riderKg: number; // for the climbs' W/kg
}

interface TooltipParam {
  seriesName: string;
  data: [number, number | null];
}

/** Heart rate and/or estimated power; with only one, it gets the left axis alone. */
export function buildChartOption({ ride, power, title, showHr, riderKg }: ChartInput):
    EChartsCoreOption {
  const showPower = power !== null;
  // Pauses are cut out of the time axis and marked with a dotted line, never drawn as gaps.
  const { minutes, pauseAt } = movingMinutes(ride.seconds);
  const xMax = minutes.length && minutes[minutes.length - 1] > 0 ? minutes[minutes.length - 1] : 1;
  const flat = (y: number) => [[0, y], [xMax, y]];

  const yAxes: Record<string, unknown>[] = [];
  const series: Record<string, unknown>[] = [];
  const legend: string[] = [];
  // Series shown in the hover readout, by series name.
  const readouts = new Map<string, { label: string; unit: string; color: string }>();
  const titleParts = [title];
  const dataLine = {
    type: 'line', showSymbol: false, symbol: 'circle', symbolSize: 7,
    connectNulls: false, animation: false,
    emphasis: { disabled: true },
  };
  const averageLine = (name: string, y: number, yAxisIndex: number) => ({
    type: 'line', name, data: flat(y), yAxisIndex, symbol: 'none', silent: true,
    lineStyle: { color: AVERAGE_COLOR, width: 1, type: 'dashed' },
    itemStyle: { color: AVERAGE_COLOR }, z: 4, animation: false, emphasis: { disabled: true },
  });

  if (showHr) {
    const avg = nanMean(ride.heartRate);
    yAxes.push({
      type: 'value', position: 'left', scale: true, name: 'Heart rate (bpm)',
      nameLocation: 'middle', nameGap: 40, splitLine: { lineStyle: { color: GRID_COLOR } },
    });
    series.push({
      ...dataLine, name: 'Heart rate', yAxisIndex: 0, z: 3,
      data: withGaps(minutes, ride.heartRate),
      lineStyle: { color: HR_COLOR, width: 1.2 },
      itemStyle: { color: HR_COLOR, borderColor: '#fff', borderWidth: 1.5 },
    });
    series.push(averageLine(`avg HR ${avg.toFixed(0)} bpm`, avg, 0));
    legend.push('Heart rate', `avg HR ${avg.toFixed(0)} bpm`);
    readouts.set('Heart rate', { label: 'Heart rate', unit: 'bpm', color: HR_COLOR });
    titleParts.push(`max ${nanMax(ride.heartRate).toFixed(0)} bpm`);
  }

  if (power) {
    const index = yAxes.length;
    const max = nanMax(power.smoothed);
    const name = `Power, estimated (${DISPLAY_SMOOTHING_S} s avg)`;
    yAxes.push({
      type: 'value', position: showHr ? 'right' : 'left', min: 0, max: max * 1.1,
      name: 'Power, estimated (W)', nameLocation: 'middle', nameGap: 40,
      axisLabel: { showMaxLabel: false },
      splitLine: showHr ? { show: false } : { lineStyle: { color: GRID_COLOR } },
    });
    series.push({
      ...dataLine, id: POWER_SERIES_ID, name, yAxisIndex: index, z: 2,
      data: withGaps(minutes, power.smoothed),
      lineStyle: { color: POWER_COLOR, width: 1.2, opacity: showHr ? 0.85 : 1 },
      itemStyle: { color: POWER_COLOR, borderColor: '#fff', borderWidth: 1.5 },
    });
    readouts.set(name, { label: 'Power', unit: 'W', color: POWER_COLOR });
    titleParts.push(`est. avg ${power.average.toFixed(0)} W`, `NP ${power.normalized.toFixed(0)} W`);
    if (showHr) {
      legend.splice(1, 0, name);
    } else {
      const avgName = `avg ${power.average.toFixed(0)} W`;
      series.push(averageLine(avgName, power.average, index));
      legend.push(name, avgName);
      titleParts.push(`max ${max.toFixed(0)} W`);
    }
  }

  // Elevation profile as context behind the data: no axis, no legend, no hover readout.
  // Climbs are shaded bands behind it, read out on hover.
  const climbs = detectClimbs(ride);
  const low = nanMin(ride.altitude);
  if (Number.isFinite(low)) {
    const high = nanMax(ride.altitude);
    const span = Math.max(high - low, 1);
    // A floor below the lowest point so valleys keep some fill, and headroom so the
    // profile stays in the lower ~60% of the chart.
    const floor = low - 0.1 * span;
    yAxes.push({ type: 'value', show: false, min: floor, max: high + 0.6 * span });
    series.push({
      type: 'line', name: 'Altitude', yAxisIndex: yAxes.length - 1, z: 0, silent: true,
      data: withGaps(minutes, ride.altitude), symbol: 'none', animation: false,
      emphasis: { disabled: true },
      lineStyle: { width: 0 }, areaStyle: { color: ALTITUDE_COLOR, opacity: 1, origin: 'start' },
      markArea: {
        silent: true, animation: false, itemStyle: { color: CLIMB_COLOR },
        data: climbs.map(c => [{ xAxis: minutes[c.from] }, { xAxis: minutes[c.to] }]),
      },
    });
  }

  if (pauseAt.length && series.length) {
    series[0]['markLine'] = {
      silent: true, symbol: 'none', label: { show: false }, animation: false,
      lineStyle: { color: PAUSE_COLOR, width: 0.8, type: 'dotted' },
      data: pauseAt.map(x => ({ xAxis: x })),
    };
  }

  return {
    animation: false,
    title: { text: titleParts.join('  ·  '), left: 8, top: 4, textStyle: { fontSize: 14, fontWeight: 'normal' } },
    // Lines only in the legend, like the plotted series; the dots belong to the hover readout.
    legend: {
      data: legend, right: 8, top: 28, itemGap: 16, textStyle: { fontSize: 11 },
      itemStyle: { opacity: 0 },
    },
    grid: { left: 64, right: showHr && showPower ? 64 : 24, top: 64, bottom: 56 },
    xAxis: {
      type: 'value', min: 0, max: xMax,
      name: 'Moving time (min), pauses marked with dotted lines',
      nameLocation: 'middle', nameGap: 30,
      splitLine: { lineStyle: { color: GRID_COLOR } },
      axisLabel: { formatter: (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1)) },
    },
    yAxis: yAxes,
    series,
    tooltip: {
      trigger: 'axis',
      // Dots on the lines mark the readout; no cursor line.
      axisPointer: { type: 'none' },
      // ECharts passes the sample nearest to the cursor in each series. Over a gap that is
      // one of the null points withGaps() puts there, so the readout stays empty.
      formatter: (params: TooltipParam[]) => {
        const rows: string[] = [];
        let x = NaN;
        for (const { seriesName, data } of params) {
          const readout = readouts.get(seriesName);
          if (!readout || data[1] === null) continue;
          x = data[0];
          rows.push(`<div style="color:${readout.color};font-weight:600">` +
                    `${readout.label} ${data[1].toFixed(0)} ${readout.unit}</div>`);
        }
        if (!rows.length) return '';
        const k = climbs.findIndex(c => minutes[c.from] <= x && x <= minutes[c.to]);
        if (k >= 0) rows.push(climbReadout(climbs[k], k, climbs.length, power, riderKg));
        return `<div style="color:#666">${x.toFixed(1)} min</div>${rows.join('')}`;
      },
    },
    dataZoom: [{
      type: 'inside', xAxisIndex: 0, filterMode: 'none',
      // Pinch or ctrl+scroll zooms; plain scrolling keeps scrolling the page. A plain drag
      // selects a stretch of the ride (see RideChart), so panning needs shift.
      zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: 'shift',
    }],
    toolbox: {
      left: 4, bottom: 4, itemSize: 14,
      feature: {
        restore: { title: 'Reset zoom' },
        saveAsImage: { title: 'Save as PNG', name: title.replace(/\.fit$/i, ''), pixelRatio: 2 },
      },
    },
  };
}

function climbReadout(climb: Climb, index: number, count: number, power: PowerEstimate | null,
                      riderKg: number): string {
  const seconds = Math.round(climb.movingSeconds);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const vam = (climb.gainM / climb.movingSeconds) * 3600;
  const lines = [
    `${climb.gainM.toFixed(0)} m over ${(climb.lengthM / 1000).toFixed(2)} km, ${(climb.grade * 100).toFixed(1)}%`,
    `${time} min, VAM ${vam.toFixed(0)} m/h`,
  ];
  const watts = power ? averagePower(power, climb.from, climb.to) : NaN;
  if (Number.isFinite(watts)) {
    const perKg = riderKg > 0 ? `, ${(watts / riderKg).toFixed(1)} W/kg` : '';
    lines.push(`avg ${watts.toFixed(0)} W${perKg}`);
  }
  return `<div style="margin-top:6px;color:${CLIMB_TEXT_COLOR};font-weight:600">` +
         `Climb ${index + 1} of ${count}</div><div>${lines.join('</div><div>')}</div>`;
}

/** Shading for a selected stretch [from, to] (minutes), labelled with its average power. */
export function selectionMarkArea(from: number, to: number, averageW: number):
    Record<string, unknown> {
  return {
    silent: true, animation: false,
    itemStyle: { color: SELECTION_COLOR },
    label: {
      show: Number.isFinite(averageW), position: 'insideTop', distance: 8,
      formatter: `avg ${averageW.toFixed(0)} W`,
      color: POWER_COLOR, fontWeight: 600, fontSize: 13,
      backgroundColor: 'rgba(255, 255, 255, 0.85)', padding: [3, 6], borderRadius: 4,
    },
    data: [[{ xAxis: Math.min(from, to) }, { xAxis: Math.max(from, to) }]],
  };
}
