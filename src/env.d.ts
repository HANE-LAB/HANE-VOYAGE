// Hooks on window: the first three are set by screenshot tests before the page script runs; the rest are for reviewing moments from the console.
interface Window {
  __fixedQuality?: boolean;
  __dtMax?: number;
  __samples?: number;
  // the fleet's instance buffers and its update, for dev/shots.mjs motion
  __fleet: { OFF: Float32Array; DYN: Float32Array; INFO: Float32Array; updateFleet(t: number, dt: number, jump: boolean): unknown };
  // the two gates whose water is being drawn (src/rise.ts): [gate index, seconds since the top beam, the tie beam and the
  // legs' cross beams left the water (-1 not yet, 1000 long ago)], for dev/shots.mjs to shoot moments of a rise
  __rise(): number[][];
  // her look shown (src/figures.ts), the one it changes from and how far, which models are decoded and how long each took
  // (ms: all, and building), how far into a wave each of them is (-1: not waving) and how much each watches something
  __figures(): { era: number; prev: number; sweep: number; loaded: boolean[]; ms: number[][]; greet: number[]; watch: number[] };
  __eraAt(t: number): number;
  fleetSeek(day: string): void;
  fleetView(n: number): void;
  fleetStyle(s: string): void;
  fleetCinema(on: boolean): void;
  fleetFirework(kind?: string): void;
  fleetOrbit(az?: number, el?: number, zoom?: number): void;
  fleetLineup(dist?: number, az?: number, k?: number, px?: number): void;
  fleetPick(k?: number): void;
}
