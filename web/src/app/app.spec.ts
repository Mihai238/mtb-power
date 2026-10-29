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

  afterEach(() => vi.restoreAllMocks());

  it('opens on the home page, with a file picker and the demo ride', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const home = page.querySelector('app-home');
    expect(home?.querySelector('h1')?.textContent).toContain('MTB power');
    expect(home?.querySelector('input[type="file"]')).not.toBeNull();
    expect(Array.from(home?.querySelectorAll('button') ?? [], b => b.textContent?.trim()))
      .toContain('Try the demo ride');
    // The demo waits to be asked for, and the analyser waits for a ride.
    expect(fetch).not.toHaveBeenCalled();
    expect(page.querySelector('.controls')).toBeNull();
  });

  it('describes every photo on the home page and credits its photographer', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const home = (fixture.nativeElement as HTMLElement).querySelector('app-home')!;
    const photos = Array.from(home.querySelectorAll<HTMLImageElement>('img:not(.logo)'));
    expect(photos.length).toBe(4);
    for (const photo of photos) expect(photo.alt.trim()).not.toBe('');
    const credits = home.querySelectorAll('.credits a[href*="unsplash.com/@"], .credits a[href*="pexels.com/@"]');
    expect(credits.length).toBe(4);
    expect(home.querySelector('.credits a[href*="pexels.com/@jeferson-gonzalez"]')).not.toBeNull();
  });

  it('shows the logo by the title, on the home page and in the analyser', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const logo = () => page.querySelector<HTMLImageElement>('h1 img.logo');
    expect(page.querySelector('app-home h1 img.logo')).not.toBeNull();
    expect(logo()?.getAttribute('src')).toBe('logo.svg');
    // Beside the name, so it's decoration for screen readers.
    expect(logo()?.alt).toBe('');
    fixture.componentInstance['loaded'].set({ fileName: 'climb.fit', ride: climbingRide() });
    await fixture.whenStable();
    expect(page.querySelector('header h1 a img.logo')?.getAttribute('src')).toBe('logo.svg');
  });

  it('leaves the home page once a ride is open', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance['loaded'].set({ fileName: 'climb.fit', ride: climbingRide() });
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('app-home')).toBeNull();
    expect(page.querySelector('.controls')).not.toBeNull();
  });

  it('goes back to the home page from the title', async () => {
    // jsdom has no scrolling.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance['loaded'].set({ fileName: 'climb.fit', ride: climbingRide() });
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const home = page.querySelector<HTMLAnchorElement>('header h1 a');
    expect(home?.textContent).toBe('MTB power');
    home!.click();
    await fixture.whenStable();
    expect(page.querySelector('app-home')).not.toBeNull();
    expect(page.querySelector('.controls')).toBeNull();
  });

  it('loads the demo ride when asked, and says so when it cannot', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const demo = Array.from(page.querySelectorAll<HTMLButtonElement>('app-home button'))
      .find(b => b.textContent?.includes('Try the demo ride'))!;
    demo.click();
    await vi.waitFor(() => expect(page.querySelector('[role="alert"]')).not.toBeNull());
    expect(fetch).toHaveBeenCalledWith('demo-ride.fit');
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Could not load the demo ride');
  });

  it('always shows the climbs table, without a toggle', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance['loaded'].set({ fileName: 'climb.fit', ride: climbingRide() });
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('details, summary')).toBeNull();
    const climbs = page.querySelector('.climbs');
    expect(climbs?.querySelector('h2')?.textContent).toBe('Climbs (1)');
    const cells = Array.from(climbs?.querySelectorAll('tbody td') ?? [], td => td.textContent);
    // #, start, length, gain, grade, time, VAM, avg power, W/kg
    expect(cells.length).toBe(9);
    expect(cells.slice(0, 5)).toEqual(['1', expect.any(String), expect.any(String), '148', '6.0']);
    expect(Number(cells[7])).toBeGreaterThan(0);
  });

  it('leaves the climbs table out of a ride without climbs', async () => {
    const fixture = TestBed.createComponent(App);
    const ride = climbingRide();
    ride.altitude.fill(300);
    fixture.componentInstance['loaded'].set({ fileName: 'flat.fit', ride });
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.chart')).not.toBeNull();
    expect(page.querySelector('.climbs')).toBeNull();
    expect(page.querySelector('table')).toBeNull();
  });

  it('shows stats for the climbs only', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance['loaded'].set({ fileName: 'climb.fit', ride: climbingRide() });
    await fixture.whenStable();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.stats dt'), dt => dt.textContent);
    expect(labels).toEqual([
      'Climbing', 'Avg HR on climbs', 'Max HR on climbs', 'Avg power on climbs',
      'Max power on climbs (10 s)', 'Work on climbs',
    ]);
  });

  it('keeps the chart and heart rate while a weight is being retyped', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app['loaded'].set({ fileName: 'climb.fit', ride: climbingRide() });
    app['riderWeight'].set(NaN);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.querySelector('.message')?.textContent).toContain('Enter rider, bike and gear weights');
    expect(page.querySelector('.chart')).not.toBeNull();
    expect(Array.from(page.querySelectorAll('.stats dt'), dt => dt.textContent))
      .toEqual(['Climbing', 'Avg HR on climbs', 'Max HR on climbs']);
  });

  it('keeps the chart of a ride without heart rate while a weight is being retyped', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const ride = climbingRide();
    ride.heartRate.fill(NaN);
    app['loaded'].set({ fileName: 'climb.fit', ride });
    app['riderWeight'].set(NaN);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(Array.from(page.querySelectorAll('.message'), m => m.textContent?.trim())).toEqual([
      'No heart rate data in this file.', 'Enter rider, bike and gear weights to estimate power.',
    ]);
    expect(page.querySelector('.chart')).not.toBeNull();
  });

  it("names missing speed/altitude data, not the weight, when power can't be estimated", async () => {
    const page = async (heartRate: boolean, riderKg: number) => {
      const fixture = TestBed.createComponent(App);
      const ride = climbingRide();
      ride.altitude.fill(NaN);
      if (!heartRate) ride.heartRate.fill(NaN);
      fixture.componentInstance['loaded'].set({ fileName: 'trainer.fit', ride });
      fixture.componentInstance['riderWeight'].set(riderKg);
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    };
    const noData = "No speed/altitude data in this file, so power can't be estimated.";
    // Without heart rate there's nothing to plot, whatever the weight.
    for (const riderKg of [80, NaN]) {
      const alone = await page(false, riderKg);
      expect(alone.querySelector('[role="alert"]')?.textContent).toBe(noData);
      expect(alone.querySelector('.chart')).toBeNull();
    }
    // With heart rate, the chart stays and the notice names the data, even with no weight.
    const withHr = await page(true, NaN);
    expect(withHr.querySelector('[role="alert"]')).toBeNull();
    const notices = Array.from(withHr.querySelectorAll('.message'), m => m.textContent?.trim());
    expect(notices).toContain(noData);
    expect(notices.some(n => n?.includes('weights'))).toBe(false);
    expect(withHr.querySelector('.chart')).not.toBeNull();
  });
});
