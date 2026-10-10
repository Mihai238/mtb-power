# Cycling power

Open a `.fit` mountain bike ride and see heart rate and estimated power, with the elevation
profile behind them. Pauses are cut out of the time axis and marked with a dotted line.
Everything runs in the browser; the file is never uploaded.

## Run

```bash
npm install
npx ng serve        # http://localhost:4200
```

Use `npx ng` rather than a global `ng`, so the project's Angular CLI version is used.

## Test and build

```bash
npx ng test --watch=false
npx ng build        # static files in dist/cycling-power/browser
```

The build output is plain static files and can be hosted anywhere (e.g. GitHub Pages).

## Layout

| File | |
|---|---|
| `src/app/ride/fit-file.ts` | reads `record` and `session` messages with Garmin's FIT SDK |
| `src/app/ride/power.ts` | physics model (MTB setup), Normalized Power |
| `src/app/ride/timeline.ts` | moving-time axis, line breaks at gaps |
| `src/app/ride-chart/` | ECharts chart and hover readout |
| `src/app/app.*` | file picker, settings, summary |

The FIT SDK and ECharts are loaded lazily, when a file is opened and when the chart is first shown.
