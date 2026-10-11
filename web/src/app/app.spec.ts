import { DeferBlockBehavior, TestBed } from '@angular/core/testing';

import { App } from './app';
import { Ride } from './ride/ride';

/** 10 minutes at 5 m/s: 500 m flat, then 2.5 km at 6%. */
function climbingRide(): Ride {
  const seconds = Float64Array.from({ length: 600 }, (_, i) => i);
  const distance = seconds.map(t => t * 5);
  return {
    start: new Date(0), seconds, heartRate: seconds.map(() => 140),
    speed: seconds.map(() => 5), distance,
    altitude: distance.map(d => 300 + Math.max(d - 500, 0) * 0.06), temperatureC: null,
  };
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // Keep the chart's placeholder; ECharts has no canvas to draw on here.
      deferBlockBehavior: DeferBlockBehavior.Manual,
    }).compileComponents();
  });

  it('asks for a file before one is opened', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('MTB power');
    expect(compiled.querySelector('.empty')?.textContent).toContain('Open a .fit file');
  });

  it('lists the climbs in a collapsed table', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance['loaded'].set({ fileName: 'climb.fit', ride: climbingRide() });
    await fixture.whenStable();
    const details = (fixture.nativeElement as HTMLElement).querySelector('details.climbs');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe('Climbs (1)');
    const cells = Array.from(details?.querySelectorAll('tbody td') ?? [], td => td.textContent);
    // #, start, length, gain, grade, time, VAM, avg power, W/kg
    expect(cells.length).toBe(9);
    expect(cells.slice(0, 5)).toEqual(['1', expect.any(String), expect.any(String), '148', '6.0']);
    expect(Number(cells[7])).toBeGreaterThan(0);
  });
});
