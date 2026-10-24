// Deterministic screenshots of the page, for checking that a change leaves the picture as it was.
//   node dev/shots.mjs <label> <url>          saves dev/.sandbox/shots/<label>/*.png and the compiled shaders
//   node dev/shots.mjs compare <a> <b>        prints the pixel difference per shot and whether the shaders match
//   node dev/shots.mjs flicker <label> <url>  measures how much the front torii jumps between frames
//   node dev/shots.mjs motion <label> <url>   measures how the ships move while playing (turning back, passing through)
//   node dev/shots.mjs board <url>            checks that no line of the readout board wraps, for every day and size
//   node dev/shots.mjs perf <label> <url>     times every frame on the GPU, held still and playing through rising gates
//   node dev/shots.mjs names <url>            checks pointing at, picking and finding ships
//   node dev/shots.mjs figures <url>          checks when her looks change and what she and Kobuta do, and times their decoding
// Frames run only when this script asks, with fixed time steps, so two runs draw exactly the same frames.
// Google Fonts are blocked, so text always uses the same system fonts.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT = path.join(import.meta.dirname, '.sandbox', 'shots');
// SHOTS_CHANNEL=msedge uses Edge, the same engine as the desktop app's WebView2
const CHANNEL = process.env.SHOTS_CHANNEL || 'chrome';
const DESKTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
const click = id => `document.getElementById(${JSON.stringify(id)}).click()`;
// plays on in 60 fps frames until the first gate whose top beam leaves the water has been out for s seconds
// (src/rise.ts). It follows that gate by index: at 1× the next gate starts to rise about 1.9 s later and takes the slot.
const untilOut = s => `(() => { let g = -1; for (let n = 0; n < 1200; n++){ const r = window.__rise();
  if (g < 0 && r[0][1] >= 0 && r[0][1] < 100) g = r[0][0];
  const own = r.find(x => x[0] === g); if (own && own[1] >= ${s}) return;
  window.__frames(1, 1000/60); } throw new Error('no gate rose'); })()`;
// a quiet stretch at 1×: the May 2024 gate starts to rise on 22 March, and its top beam leaves the water just after this
const RISE = ['fleetSeek("2024-03-26")', click('play')];
// [name, device, steps]: a number runs that many 50 ms frames; a string runs in the page
const SHOTS = [
  ['today', DESKTOP, [24]],
  ['view1', DESKTOP, ['fleetView(1)', 24]],
  ['view2', DESKTOP, ['fleetView(2)', 24]],
  ['real', DESKTOP, ['fleetStyle("real")', 24]],
  ['real-view1', DESKTOP, ['fleetStyle("real")', 'fleetView(1)', 24]],
  ['real-view2', DESKTOP, ['fleetStyle("real")', 'fleetView(2)', 24]],
  // the water off a rising gate: 0.5, 1, 2 and 3 s after its top beam leaves the sea, and paused at 2 s for 10 and 30 s
  // more, when the water still drains by the clock
  ['rise-0.5', DESKTOP, [...RISE, untilOut(0.5)]],
  ['rise-1', DESKTOP, [...RISE, untilOut(1)]],
  ['rise-2', DESKTOP, [...RISE, untilOut(2)]],
  ['rise-3', DESKTOP, [...RISE, untilOut(3)]],
  ['rise-hold-10', DESKTOP, [...RISE, untilOut(2), click('play'), 200]],
  ['rise-hold-30', DESKTOP, [...RISE, untilOut(2), click('play'), 600]],
  ['rise-1-real', DESKTOP, ['fleetStyle("real")', ...RISE, untilOut(1)]],
  ['peak', DESKTOP, ['fleetSeek("2022-10-16")', 24]],
  ['early', DESKTOP, ['fleetSeek("2021-06-01")', 24]],
  ['close', DESKTOP, ['fleetOrbit(0.6, 0.15, 0.35)', 24]],
  ['firework', DESKTOP, [8, 'fleetFirework()', 60]],
  ['playback', DESKTOP, ['fleetSeek("2022-10-08")', click('play'), 60]],
  ['start', DESKTOP, [click('play'), 40]],
  ['cinema', DESKTOP, ['fleetCinema(true)', 30]],
  ['legend', DESKTOP, [click('legendBtn'), 4]],
  ['phone', PHONE, [24]],
  ['phone-view1', PHONE, ['fleetView(1)', 24]],
  ['phone-view2', PHONE, ['fleetView(2)', 24]],
  ['phone-real', PHONE, ['fleetStyle("real")', 24]],
];

function init() {
  let now = 0;
  const queue = [];
  window.__realNow = performance.now.bind(performance);
  performance.now = () => now;
  window.requestAnimationFrame = cb => queue.push(cb);
  window.__frames = (n, ms = 50) => { for (let i = 0; i < n; i++) { now += ms; for (const cb of queue.splice(0)) cb(now); } };
  window.__fixedQuality = true;
  window.__samples = 4;
  const shaders = window.__shaders = new Set();
  for (const gl of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const source = gl.prototype.shaderSource;
    gl.prototype.shaderSource = function (shader, text) { shaders.add(text); return source.call(this, shader, text); };
  }
}

// a fresh page in its own context, so localStorage and the style setting start empty
async function open(browser, device, url, name) {
  const context = await browser.newContext(device);
  await context.addInitScript(init);
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', e => console.log(`  ${name}: page error: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) console.log(`  ${name}: console: ${m.text()}`); });
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) console.log(`  ${name}: failed to load ${r.url()}`); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.fleetSeek === 'function', null, { polling: 100, timeout: 30000 });
  // her figures decode in the background (src/figures.ts); every run waits for all of them, so frames are the same
  await page.waitForFunction(() => !window.__figures || window.__figures().loaded.every(Boolean), null, { polling: 100, timeout: 60000 });
  return page;
}

async function capture(label, url) {
  const dir = path.join(OUT, label);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: CHANNEL });
  const shaders = new Set();
  try {
    for (const [name, device, steps] of SHOTS) {
      const t0 = Date.now();
      const page = await open(browser, device, url, name);
      for (const step of steps) {
        if (typeof step === 'number') await page.evaluate(n => window.__frames(n), step);
        else await page.evaluate(step);
      }
      // CSS transitions run on real time (the cinema bars take 0.6 s), so they jump to their end state
      await page.screenshot({ path: path.join(dir, name + '.png'), animations: 'disabled' });
      for (const s of await page.evaluate(() => [...window.__shaders])) shaders.add(s);
      console.log(`  ${name}  ${Date.now() - t0} ms`);
      await page.context().close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(dir, 'shaders.json'), JSON.stringify([...shaders].sort(), null, 1));
}

// Mean brightness of the front torii's beams and upper posts (回望, desktop) in every frame at 60 fps.
// The 二次元 rules forbid the gates from jumping between dark and lit; a largest jump near 0.02 is fine, the old strobe was 0.13.
// The ships box holds her flagship and the nearest ships, the ones big enough on screen for ink lines and the edge light.
// The sea box is the water under them, where their lanterns reflect. The rise box is where each new gate's beams come
// up through it during playback, pouring water. The vets box holds the oldest ships behind her, with the tallest
// pillars of light (src/veterans.ts), today and during the 2022 playback.
// Placed for the 回望 framing that keeps the rising gate's water line above the dock (2026-10-23, src/camera.ts); the
// earlier framing had them at torii [262, 228, 298, 150], ships [400, 360, 140, 110], sea [440, 470, 180, 70],
// rise [100, 300, 500, 200], vets [535, 380, 120, 75].
const BOXES = { torii: [345, 195, 250, 110], ships: [380, 315, 160, 110], sea: [620, 405, 140, 55], rise: [220, 400, 460, 120], vets: [540, 330, 120, 65] };
// [name, steps, frames, cells]. The playback above runs in the slowed-down anniversary weeks; ordinary runs at 1× in a
// quiet spring (2024), a new gate about every 1.9 s, and also scans every 40 px cell above the dock for pops (below).
// It runs in 写实: 二次元 draws its water on twos, a deliberate one-frame change twelve times a second that a pop scan
// cannot tell from a cut.
const FLICKER = [
  ['fireworks', ['fleetFirework()', 'fleetFirework()', 'fleetFirework()'], 600],
  ['playback', ['fleetSeek("2022-10-08")', click('play')], 600],
  ['ordinary', ['fleetStyle("real")', 'fleetSeek("2024-03-01")', click('play')], 600, true],
];
// A pop is a cell whose mean brightness jumps by more than 0.008 in one frame while the frames either side of it barely
// change (the jump is more than four times both neighbouring changes). Gates and ships sweeping across a cell change it
// over several frames and are not counted; something cut off in one frame (the water of a gate the bookkeeping drops, a
// texture window moving) is, even where a box would average it away.
const CELL = 40, CELL_H = 520;
function cellPops(grid) {
  const pops = [];
  for (let c = 0; c < grid[0].length; c++) {
    const d = []; for (let k = 1; k < grid.length; k++) d.push(Math.abs(grid[k][c] - grid[k - 1][c]));
    for (let k = 1; k < d.length - 1; k++) {
      const n = Math.max(d[k - 1], d[k + 1]);
      if (d[k] > 0.008 && d[k] > 4*n) pops.push({ cell: c, frame: k + 1, jump: d[k], around: n });
    }
  }
  return pops;
}

async function flicker(label, url) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: CHANNEL });
  const series = {};
  try {
    for (const [name, steps, frames, cells] of FLICKER) {
      const page = await open(browser, DESKTOP, url, name);
      await page.evaluate(() => window.__frames(24));
      for (const step of steps) await page.evaluate(step);
      // the WebGL canvas still holds the frame within the task that drew it, so read it right after each frame
      const [lums, grid, newest] = await page.evaluate(([n, boxes, cells, C, H]) => {
        const sea = document.getElementById('sea'), out = boxes.map(() => []), grid = [], newest = [];
        const gs = boxes.map(([, , w, h]) => new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true }));
        const gc = cells && new OffscreenCanvas(sea.width, H).getContext('2d', { willReadFrequently: true });
        for (let i = 0; i < n; i++) {
          window.__frames(1, 1000/60);
          boxes.forEach(([x, y, w, h], b) => {
            gs[b].drawImage(sea, x, y, w, h, 0, 0, w, h);
            const d = gs[b].getImageData(0, 0, w, h).data;
            let s = 0;
            for (let j = 0; j < d.length; j += 4) s += 0.299*d[j] + 0.587*d[j + 1] + 0.114*d[j + 2];
            out[b].push(s/(d.length/4)/255);
          });
          if (cells) {
            gc.drawImage(sea, 0, 0, sea.width, H, 0, 0, sea.width, H);
            const d = gc.getImageData(0, 0, sea.width, H).data, nx = Math.floor(sea.width/C), row = new Array(nx*Math.floor(H/C)).fill(0);
            for (let y = 0; y < Math.floor(H/C)*C; y++) for (let x = 0; x < nx*C; x++) {
              const j = (y*sea.width + x)*4;
              row[Math.floor(y/C)*nx + Math.floor(x/C)] += (0.299*d[j] + 0.587*d[j + 1] + 0.114*d[j + 2])/255/(C*C);
            }
            grid.push(row);
            newest.push(window.__rise()[0][0]);
          }
        }
        return [out, grid, newest];
      }, [frames, Object.values(BOXES), !!cells, CELL, CELL_H]);
      Object.keys(BOXES).forEach((box, b) => {
        const lum = series[box === 'torii' ? name : `${name} ${box}`] = lums[b];
        let jump = 0, at = 0;
        for (let i = 1; i < lum.length; i++) if (Math.abs(lum[i] - lum[i - 1]) > jump) { jump = Math.abs(lum[i] - lum[i - 1]); at = i; }
        console.log(`  ${name.padEnd(10)} ${box.padEnd(6)} brightness ${Math.min(...lum).toFixed(3)} to ${Math.max(...lum).toFixed(3)}, largest jump ${jump.toFixed(4)} at frame ${at}`);
      });
      if (cells) {
        const pops = cellPops(grid), nx = Math.floor(1280/CELL);
        series[`${name} pops`] = pops;
        const worst = pops.reduce((a, p) => p.jump > a.jump ? p : a, { jump: 0 });
        console.log(`  ${name.padEnd(10)} pops   ${pops.length} in ${new Set(pops.map(p => p.frame)).size} frames` +
          (pops.length ? `, largest ${worst.jump.toFixed(4)} at frame ${worst.frame} in the cell at x ${(worst.cell % nx)*CELL}, y ${Math.floor(worst.cell/nx)*CELL}` : ''));
        // the frames where a new gate starts to rise and the bookkeeping lets the gate two back go (src/rise.ts)
        const drops = newest.flatMap((g, i) => i && g !== newest[i - 1] ? [i] : []), at = pops.filter(p => drops.includes(p.frame));
        series[`${name} drops`] = drops;
        console.log(`  ${name.padEnd(10)} drops  ${drops.length} (frames ${drops.join(', ')}), ${at.length} cells pop then` +
          (at.length ? `, largest ${Math.max(...at.map(p => p.jump)).toFixed(4)}` : ''));
      }
      await page.context().close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(dir, 'flicker.json'), JSON.stringify(series));
}

// How the ships move while playing, read from the instance buffers (window.__fleet) every frame at 60 fps:
//   moving    ships that moved more than 0.012 a frame (0.7 a second), the most at once and the mean
//   reversals a ship turning to the opposite way without stopping first (stopped = still for 6 frames): called back
//   overlaps  frames in which a ship comes closer to another it moves against than ships at their berths ever sit,
//             counted per pair: passing through it. Close means within half the touching distance both along and
//             across the column (berth jitter brings parked neighbours to 0.56 of it, never closer).
// Hull sizes are the models' in src/ships.ts (length, width with the sail) times the instance scale.
// It also times updateFleet alone: 600 calls at 60 fps from 2022-10-12 and 600 at today, median ms per call.
const MOTION = [
  ['2021', ['fleetSeek("2021-07-25")', click('play')], 900],
  ['2022', ['fleetSeek("2022-10-08")', click('play')], 900],
  ['decline', ['fleetSeek("2022-11-01")', click('play')], 900],
  ['surge', ['fleetSeek("2026-10-06")', click('play')], 2400],
];

async function motion(label, url) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: CHANNEL });
  const series = {};
  let bad = 0;
  try {
    for (const [name, steps, frames] of MOTION) {
      const page = await open(browser, DESKTOP, url, name);
      await page.evaluate(() => window.__frames(24));
      for (const step of steps) await page.evaluate(step);
      const r = await page.evaluate(n => {
        const { OFF, DYN, INFO } = window.__fleet, N = OFF.length/4;
        const SIZE = [[1, 0.46], [1, 0.38], [1, 0.70], [1, 0.42], [1, 0.40]];   // by kind: 舰长, anonymous, flagship, 提督, 总督
        const px = new Float32Array(N), pz = new Float32Array(N), seen = new Uint8Array(N), mov = new Uint8Array(N);
        const dx0 = new Float32Array(N), dz0 = new Float32Array(N), vx = new Float32Array(N), vz = new Float32Array(N), still = new Uint16Array(N);
        const C = 3.2, grid = new Map(), cell = (x, z) => Math.floor(x/C)*100003 + Math.floor(z/C);
        const out = { moving: [], reversals: 0, overlaps: 0, overlapShips: 0, maxStep: 0 };
        const hit = new Uint8Array(N);
        // the frame after the seek snaps every ship to that day; count from the third frame on
        for (let f = -2; f < n; f++) {
          window.__frames(1, 1000/60);
          grid.clear();
          let moving = 0;
          for (let i = 0; i < N; i++) {
            mov[i] = 0;
            if (OFF[i*4+3] <= 0 || DYN[i*2+1] <= 0.05) { seen[i] = 0; continue; }
            const x = OFF[i*4], z = OFF[i*4+1];
            vx[i] = 0; vz[i] = 0;
            if (seen[i] && f >= 0) {
              const dx = x - px[i], dz = z - pz[i], d = Math.hypot(dx, dz);
              out.maxStep = Math.max(out.maxStep, d);
              vx[i] = dx; vz[i] = dz;
              if (d > 0.012) {
                moving++; mov[i] = 1;
                if (still[i] < 6 && dx0[i]*dx + dz0[i]*dz < -0.5*d) out.reversals++;
                dx0[i] = dx/d; dz0[i] = dz/d; still[i] = 0;
              } else if (still[i] < 999) still[i]++;
            } else { dx0[i] = 0; dz0[i] = 0; still[i] = 999; }
            seen[i] = 1; px[i] = x; pz[i] = z;
            const k = cell(x, z); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
          }
          if (f < 0) continue;
          out.moving.push(moving);
          for (let i = 0; i < N; i++) {
            if (!mov[i]) continue;
            const si = SIZE[INFO[i*4+3]], s = OFF[i*4+3], cx = Math.floor(OFF[i*4]/C), cz = Math.floor(OFF[i*4+1]/C);
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
              for (const j of grid.get((cx + a)*100003 + cz + b) || []) {
                if (j === i || (mov[j] && j < i) || Math.hypot(vx[i] - vx[j], vz[i] - vz[j]) < 0.012) continue;
                const sj = SIZE[INFO[j*4+3]], t = OFF[j*4+3];
                if (Math.abs(OFF[i*4+1] - OFF[j*4+1]) < 0.25*(si[0]*s + sj[0]*t) && Math.abs(OFF[i*4] - OFF[j*4]) < 0.25*(si[1]*s + sj[1]*t)) {
                  out.overlaps++; if (!hit[i]) { hit[i] = 1; out.overlapShips++; }
                }
              }
            }
          }
        }
        return out;
      }, frames);
      const mean = r.moving.reduce((a, b) => a + b, 0)/r.moving.length;
      console.log(`  ${name.padEnd(8)} moving at once ${Math.max(...r.moving)} (mean ${mean.toFixed(1)}), reversals ${r.reversals}, overlaps ${r.overlaps} (${r.overlapShips} ships), largest step ${r.maxStep.toFixed(2)}`);
      series[name] = r;
      bad += r.reversals + r.overlaps;
      await page.context().close();
    }
    const page = await open(browser, DESKTOP, url, 'cost');
    const cost = await page.evaluate(() => {
      const now = window.__realNow, run = (d0, rate) => {
        const ms = [];
        for (let i = 0; i < 600; i++) { const a = now(); window.__fleet.updateFleet(d0 + i*rate/60, 1/60, i === 0); ms.push(now() - a); }
        return ms.sort((a, b) => a - b)[300];
      };
      const [y, m, d] = [2022, 10, 12], d0 = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2021, 1, 3))/864e5);
      return { surge: run(d0, 2), today: run(d0 + 1471, 0) };
    });
    console.log(`  updateFleet median ${cost.surge.toFixed(3)} ms a call from 2022-10-12, ${cost.today.toFixed(3)} ms at today`);
    series.cost = cost;
    await page.context().close();
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(dir, 'motion.json'), JSON.stringify(series));
  // a ship turning back or passing through another fails the check (the numbers are still written above)
  return !bad;
}

// Does any line of the readout board wrap or stick out of it? The layout only depends on how many characters each
// figure has (they are tabular), so every day of data/voyage.json is reduced to its figures' lengths and one day per
// distinct set is laid out, plus every figure at its largest at once. Each runs at desktop and phone sizes, in both
// styles, with system fonts and with web fonts.
const BOARD_SIZES = [[1280, 720, 1], [1920, 1080, 1], [390, 844, 2], [375, 812, 2], [360, 800, 2], [320, 640, 2]];
async function board(url) {
  const v = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'voyage.json'), 'utf8'));
  const N = v.total.length, nf = n => n.toLocaleString('en-US'), named = [...v.named].sort((a, b) => a.start - b.start);
  const IDS = ['bTotal', 'bStay', 'bKan', 'bGuard', 'bLeft', 'bV3', 'bV2', 'bV1'], cases = new Map(), rows = [];
  for (let d = 0, k = 0, esc = 0; d < N; d++) {
    while (k < named.length && named[k].start < d + 1) { if (named[k].level < 3) esc++; k++; }
    const tier = T => named.slice(0, k).filter(n => n.acc - (N - 1 - d) >= T).length, total = Math.max(k, v.total[d]);
    rows.push({ day: d, bTotal: total, bStay: k, bKan: k - esc, bGuard: esc, bLeft: total - k, bV3: tier(365), bV2: tier(180), bV1: tier(30) });
  }
  for (const r of rows) { const key = IDS.map(id => nf(r[id]).length).join(); if (!cases.has(key)) cases.set(key, r); }
  cases.set('largest', { day: -1, ...Object.fromEntries(IDS.map(id => [id, Math.max(...rows.map(r => r[id]))])) });
  const browser = await chromium.launch({ channel: CHANNEL });
  let bad = 0;
  try {
    for (const fonts of [false, true]) for (const [width, height, deviceScaleFactor] of BOARD_SIZES) for (const style of ['toon', 'real']) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
      await context.addInitScript(init);
      if (!fonts) await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.fleetSeek === 'function', null, { polling: 100, timeout: 30000 });
      if (fonts) await page.evaluate(() => document.fonts.ready);
      const hits = await page.evaluate(([style, list, IDS]) => {
        window.__frames(2); fleetStyle(style); window.__frames(1);
        const board = document.querySelector('.board'), lines = [...board.querySelectorAll('.b-total, dt, .b-n, .b-sub, .b-vet, .b-more')];
        // a line's text boxes grouped by vertical overlap (a big figure and a small label on one line overlap); the
        // second veteran line (.b-more) is a line of its own
        const wraps = el => {
          const rows = [], tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n; (n = tw.nextNode());) {
            if (!n.textContent.trim() || (n.parentElement.closest('.b-more') && !el.classList.contains('b-more'))) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            for (const r of rg.getClientRects()) { if (!r.width) continue; const l = rows.find(l => r.top < l.bottom - 2 && l.top < r.bottom - 2);
              if (l) { l.top = Math.min(l.top, r.top); l.bottom = Math.max(l.bottom, r.bottom); } else rows.push({ top: r.top, bottom: r.bottom }); }
          }
          return rows.length > 1;
        };
        const out = el => { const b = board.getBoundingClientRect(), e = el.getBoundingClientRect(); return e.right > b.right - 1 || e.left < b.left + 1; };
        return list.flatMap(c => {
          for (const id of IDS) document.getElementById(id).textContent = c[id].toLocaleString('en-US');
          return lines.filter(el => wraps(el) || out(el)).map(el => [c.day, el.className || el.tagName]);
        });
      }, [style, [...cases.values()], IDS]);
      bad += hits.length;
      const day = d => d < 0 ? 'all largest' : new Date(Date.UTC(2021, 1, 3) + d*864e5).toISOString().slice(0, 10);
      console.log(`  ${fonts ? 'web fonts   ' : 'system fonts'} ${String(width).padStart(4)}x${height} ${style.padEnd(4)}: ${hits.length ? hits.slice(0, 3).map(([d, what]) => `${day(d)} ${what}`).join('; ') : 'no line wraps or sticks out'}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`  ${cases.size - 1} sets of figure lengths over ${N} days, plus all at their largest`);
  return !bad;
}

// comments and whitespace do not change a compiled shader
const bare = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, '');

async function compare(a, b) {
  const browser = await chromium.launch({ channel: CHANNEL });
  const page = await browser.newPage();
  const png = (label, name) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, label, name + '.png')).toString('base64');
  let same = true;
  for (const [name] of SHOTS) {
    const d = await page.evaluate(async ([x, y]) => {
      const pixels = async src => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const g = new OffscreenCanvas(img.width, img.height).getContext('2d');
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height).data;
      };
      const [p, q] = await Promise.all([pixels(x), pixels(y)]);
      if (p.length !== q.length) return { sizes: [p.length, q.length] };
      let n = 0, max = 0;
      for (let i = 0; i < p.length; i += 4) {
        const v = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]));
        if (v) { n++; max = Math.max(max, v); }
      }
      return { n, max, total: p.length / 4 };
    }, [png(a, name), png(b, name)]);
    if (d.sizes || d.n) same = false;
    console.log(`  ${name.padEnd(12)} ${d.sizes ? 'different sizes' : d.n ? `${d.n} of ${d.total} pixels differ, max ${d.max}` : 'identical'}`);
  }
  await browser.close();
  const shaders = label => new Set(JSON.parse(fs.readFileSync(path.join(OUT, label, 'shaders.json'), 'utf8')).map(bare));
  const [x, y] = [shaders(a), shaders(b)];
  const only = (p, q) => [...p].filter(s => !q.has(s));
  const missing = [...only(x, y), ...only(y, x)];
  console.log(`  shaders: ${x.size} vs ${y.size}, ${missing.length ? missing.length + ' differ' : 'all match'}`);
  // after a three.js upgrade every shader differs in the part three.js writes, so a few examples are enough
  for (const s of missing.slice(0, 4)) console.log('    ' + (x.has(s) ? a : b) + ' only: ' + s.slice(0, 160));
  return same && !missing.length;
}

// GPU time per frame (EXT_disjoint_timer_query_webgl2) on the integrated GPU (--force_low_power_gpu) at a phone's pixel
// count, where the effects cost the most: PERF_FRAMES frames held still at today, with nothing rising, then as many of
// 1× playback from 2024-03-26, through four gates rising out of the sea, then, on a fresh page at today, the most
// fireworks one day sends up (FW_DAY in src/fx.ts), the heaviest load they make. Each frame's CPU time (the page's whole frame in JavaScript) is reported beside it.
// Run it on the builds before and after a change and compare the means; a run's own noise is about 0.03 ms.
const PERF_FRAMES = 480;
async function perf(label, url) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: CHANNEL, args: ['--force_low_power_gpu'] });
  try {
    let page = await open(browser, PHONE, url, 'perf');
    const timed = () => page.evaluate(async n => {
      const gl = document.getElementById('sea').getContext('webgl2'), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) return null;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 20; i++) window.__frames(1, 1000/60);   // warm up
      await sleep(50);
      const qs = [], cpu = [];
      for (let i = 0; i < n; i++) {
        const q = gl.createQuery(), t0 = window.__realNow();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q); window.__frames(1, 1000/60); gl.endQuery(ext.TIME_ELAPSED_EXT);
        cpu.push(window.__realNow() - t0);
        qs.push(q);
        if (i % 8 === 7) await sleep(0);
      }
      // frames whose timing the driver dropped are left out
      const ms = [];
      for (const q of qs) {
        for (let k = 0; k < 3000 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await sleep(1);
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT)/1e6);
        gl.deleteQuery(q);
      }
      ms.sort((x, y) => x - y);
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return { gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '?', mean: ms.reduce((x, y) => x + y, 0)/ms.length,
        median: ms[ms.length >> 1], p90: ms[Math.floor(ms.length*0.9)], max: ms[ms.length - 1], frames: ms.length,
        cpu: cpu.reduce((x, y) => x + y, 0)/cpu.length };
    }, PERF_FRAMES);
    await page.evaluate(() => window.__frames(24));
    const still = await timed();
    if (!still) { console.log('  perf: this GPU has no EXT_disjoint_timer_query_webgl2'); return; }
    for (const step of RISE) await page.evaluate(step);
    const playing = await timed();
    await page.context().close();
    page = await open(browser, PHONE, url, 'perf');
    await page.evaluate(() => window.__frames(24));
    await page.evaluate(() => { for (let i = 0; i < 8; i++) window.fleetFirework(); });
    const fireworks = await timed();
    console.log(`  perf  ${still.gpu}`);
    for (const [name, r] of [['still', still], ['playing', playing], ['fireworks', fireworks]])
      console.log(`  perf  ${name.padEnd(9)} mean ${r.mean.toFixed(2)} ms, median ${r.median.toFixed(2)}, 90% under ${r.p90.toFixed(2)}, max ${r.max.toFixed(2)} (${r.frames} frames); CPU ${r.cpu.toFixed(2)} ms`);
    fs.writeFileSync(path.join(dir, 'perf.json'), JSON.stringify({ still, playing, fireworks }, null, 1));
  } finally {
    await browser.close();
  }
}

// Pointing at, picking and finding ships (src/names.ts), at 1280×720 in 回望 today: hovering shows a tag, a click picks
// the ship under it and a drag from there only turns the view; 回到船队 or Esc lets go, a click on the sky picks none; a UID is hashed
// and looked up; a name typed in is found (only where the page has names: data/voyage.json with them, or the dev
// server's ?sample-names). Without names no tag may show a name. Prints each check and returns whether all passed.
async function names(url) {
  const browser = await chromium.launch({ channel: CHANNEL });
  const results = [];
  const check = (what, ok, more = '') => { results.push(ok); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${more ? '  ' + more : ''}`); };
  try {
    const page = await open(browser, DESKTOP, url, 'names');
    const frames = n => page.evaluate(k => window.__frames(k, 1000/60), n);
    const tag = id => page.evaluate(i => { const t = document.getElementById(i); return { on: t.classList.contains('on'), text: t.innerText.trim() }; }, id);
    await frames(30);
    // find a ship by sweeping the mouse over the fleet until the hover tag shows
    let at = null;
    for (let y = 250; y < 480 && !at; y += 16) for (let x = 560; x < 1100 && !at; x += 16) {
      await page.mouse.move(x, y); await frames(1);
      if ((await tag('hoverTag')).on) at = [x, y];
    }
    check('悬停一条船时显示名牌', !!at, at ? `(${at})` : '');
    if (at) {
      const hover = (await tag('hoverTag')).text;
      await page.mouse.click(...at); await frames(2);
      const picked = await tag('shipTag');
      check('点击选中鼠标下的那条船', picked.on && picked.text === hover, JSON.stringify(picked.text));
      const named = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'voyage.json'), 'utf8')).named.some(m => m.name);
      if (!named && !url.includes('sample-names')) check('数据里没有名字：名牌只写等级和天数', /^(舰长|提督|总督|无名之舰)\s/.test(picked.text));
      await frames(90);
      await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(700, 380, { steps: 6 }); await page.mouse.up(); await frames(2);
      check('拖动不换选中的船', (await tag('shipTag')).text === picked.text);
      await page.click('#findClear'); await frames(20);
      check('「回到船队」放开', !(await tag('shipTag')).on);
      await page.mouse.click(640, 30); await frames(2);
      check('点空的天空不选中船', !(await tag('shipTag')).on);
      await page.evaluate(() => window.fleetPick(0)); await frames(2);
      await page.keyboard.press('Escape'); await frames(20);
      check('Esc 放开', !(await tag('shipTag')).on);
    }
    await page.click('#findBtn');
    await page.fill('#findQ', '1234567890');
    await page.waitForFunction(() => !/正在/.test(document.getElementById('findNote').textContent), null, { polling: 100, timeout: 10000 });
    check('按 UID 找船：在本机算出哈希再比对', /UID/.test(await page.textContent('#findNote')), JSON.stringify(await page.textContent('#findNote')));
    await page.fill('#findQ', '猫');
    const n = await page.evaluate(() => document.querySelectorAll('#findList button').length);
    if (n) {
      await page.click('#findList button'); await frames(90);  // 等镜头移到远处的船，名牌才会进入画面。
      const t = await tag('shipTag');
      check('按名字找到的船被选中', t.on && t.text.includes('猫'), JSON.stringify(t.text));
    } else console.log('  (页面没有名字，跳过按名字找)');
    const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'voyage.json'), 'utf8'));
    const unknown = data.named.find(n => n.acc === null && n.name);
    if (unknown) {
      await page.fill('#findQ', unknown.name);
      check('无依据的陪伴天数显示未知', (await page.textContent('#findList')).includes('陪伴天数未知'));
      const yesterday = new Date(Date.parse(data.meta.day0 + 'T00:00:00Z') + (data.total.length - 2)*864e5).toISOString().slice(0, 10);
      await page.evaluate(d => window.fleetSeek(d), yesterday); await frames(2);
      await page.fill('#findQ', ''); await page.fill('#findQ', unknown.name);
      const text = await page.textContent('#findList');
      check('历史日期不把未知误称为尚未上船', text.includes('陪伴天数未知') && !text.includes('这一天还没上船'));
    }
  } finally {
    await browser.close();
  }
  return results.every(Boolean);
}

// Her looks and what she and Kobuta do (src/figures.ts). Each new outfit shows from 22:00 JST on 2022-02-14 and
// 2023-02-14, HANE's rule, checked at the minute either side as HANE's dev/test_render.cjs does. Moving the timeline
// shows the right look in the next frame; playing across a change sweeps the new look up her body in 0.9 s. Pressing
// play makes them wave, Kobuta 0.35 s later. Their decoding is timed on the integrated GPU at a phone's size, with the
// CPU slowed 4× like a phone's.
async function figures(url) {
  const browser = await chromium.launch({ channel: CHANNEL, args: ['--force_low_power_gpu'] });
  let bad = 0;
  const check = (ok, what) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`); };
  try {
    const context = await browser.newContext(PHONE);
    await context.addInitScript(init);
    await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__figures && window.__figures().loaded.every(Boolean), null, { polling: 100, timeout: 120000 });
    const ms = await page.evaluate(() => window.__figures().ms);
    console.log(`  decoding, CPU 4× slower: ${['2021', '2022', '2023', 'kobuta'].map((n, i) => `${n} ${ms[i][0]} ms (building ${ms[i][1]})`).join(', ')}`);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const jst = (y, m, d, h, mi = 0) => (Date.UTC(y, m - 1, d) - Date.UTC(2021, 1, 3))/864e5 + (h + mi/60)/24;
    for (const [at, era] of [[[2021, 2, 1, 16], 0], [[2022, 2, 14, 21, 59], 0], [[2022, 2, 14, 22], 1], [[2023, 2, 14, 21, 59], 1], [[2023, 2, 14, 22], 2], [[2026, 10, 15, 1], 2]])
      check(await page.evaluate(t => window.__eraAt(t), jst(...at)) === era, `${at.slice(0, 3).join('-')} ${at[3]}:${String(at[4] ?? 0).padStart(2, '0')} JST: look ${era + 1}`);
    for (const [day, era] of [['2022-02-14', 0], ['2022-02-15', 1], ['2023-02-14', 1], ['2023-02-15', 2], ['2021-06-01', 0], ['2026-10-01', 2]]) {
      const r = await page.evaluate(d => { window.fleetSeek(d); window.__frames(1, 1000/60); return window.__figures(); }, day);
      check(r.era === era && r.prev < 0, `moved to ${day}: look ${r.era + 1} in the next frame`);
    }
    const run = await page.evaluate(() => {
      window.fleetSeek('2022-02-12'); window.__frames(2, 1000/60); document.getElementById('play').click();
      const out = [];
      for (let i = 0; i < 400; i++) { window.__frames(1, 1000/60); const r = window.__figures(); out.push([r.era, r.prev, r.greet[0], r.greet[1]]); }
      return out;
    });
    const from = run.findIndex(([e]) => e === 1), to = run.findIndex(([, p], i) => i > from && p < 0);
    check(from > 0 && run[from][1] === 0 && to > from, `playing across 2022-02-14 22:00: look 1 sweeps into look 2 from frame ${from} in ${((to - from)/60).toFixed(2)} s`);
    const wave = k => run.findIndex(r => r[2 + k] >= 0);
    check(wave(0) === 0 && Math.abs(wave(1) - 21) <= 1, `play: she waves in frame ${wave(0)}, Kobuta in frame ${wave(1)}`);
  } finally {
    await browser.close();
  }
  return !bad;
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'compare') process.exitCode = (await compare(a, b)) ? 0 : 1;
else if (cmd === 'flicker' && b) await flicker(a, b);
else if (cmd === 'motion' && b) process.exitCode = (await motion(a, b)) ? 0 : 1;
else if (cmd === 'board' && a) process.exitCode = (await board(a)) ? 0 : 1;
else if (cmd === 'perf' && b) await perf(a, b);
else if (cmd === 'names' && a) process.exitCode = (await names(a)) ? 0 : 1;
else if (cmd === 'figures' && a) process.exitCode = (await figures(a)) ? 0 : 1;
else if (cmd && a) await capture(cmd, a);
else console.log('usage: node dev/shots.mjs <label> <url> | compare <a> <b> | flicker <label> <url> | motion <label> <url> | board <url> | perf <label> <url> | figures <url> | names <url>');
