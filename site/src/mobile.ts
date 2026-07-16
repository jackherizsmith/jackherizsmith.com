// Mobile gets its own creative idiom rather than a shrunk-down editor:
// tap-to-restyle theming, opt-in gyroscope parallax, and a swipeable demo
// viewer. Desktop never runs any of this (main.ts gates on viewport width).

interface Theme {
  bg: string; surface: string; ink: string; body: string;
  accent: string; onaccent: string; line: string;
}
interface Font { name: string; display: string; body: string; ls: string; wt: string }

const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

const THEMES: Theme[] = [
  { bg: '#f0f2f5', surface: '#ffffff', ink: '#17191c', body: '#5a6067', accent: '#0d99ff', onaccent: '#ffffff', line: '#e6e8ec' },
  { bg: '#f6f1ea', surface: '#fffdf9', ink: '#2a2320', body: '#5c4f45', accent: '#c2410c', onaccent: '#ffffff', line: '#e7ded2' },
  { bg: '#eef2ee', surface: '#ffffff', ink: '#14231b', body: '#3c4a42', accent: '#0e9e6e', onaccent: '#ffffff', line: '#dbe5de' },
  { bg: '#fdf2f8', surface: '#ffffff', ink: '#500724', body: '#9d174d', accent: '#ec4899', onaccent: '#ffffff', line: '#f6d9e8' },
  { bg: '#14161c', surface: '#1e222c', ink: '#f2f4f8', body: '#aab2c0', accent: '#7c9cff', onaccent: '#0b1020', line: '#2b303c' },
  { bg: '#0f0f10', surface: '#1a1a1c', ink: '#fafafa', body: '#b0b0b4', accent: '#e5e5e5', onaccent: '#111111', line: '#2a2a2e' },
];

// Font pairings chosen by vibe, not name: a title face + a complementary body
// face, applied across every heading and all body text.
const FONTS: Font[] = [
  { name: 'Editorial', display: `ui-serif,"New York",Georgia,serif`, body: `"Avenir Next",${SANS}`, ls: '-.02em', wt: '600' },
  { name: 'Professional', display: `Georgia,"Times New Roman",Times,serif`, body: `"Helvetica Neue",Helvetica,Arial,sans-serif`, ls: '-.01em', wt: '700' },
  { name: 'Casual', display: `"Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif`, body: `"Trebuchet MS","Segoe UI",Verdana,sans-serif`, ls: '0', wt: '600' },
  { name: 'Developer', display: `ui-monospace,"SF Mono",Menlo,monospace`, body: SANS, ls: '-.03em', wt: '700' },
];

const DEMOS = [
  { key: 'data', name: 'Data', href: '/demos/data' },
  { key: 'notes', name: 'Notes', href: '/demos/notes' },
  { key: 'pulse', name: 'Pulse', href: '/demos/pulse' },
  { key: 'roe', name: 'Read Only Everything', href: '/demos/roe' },
];

const LS_KEY = 'jhs-mobile-style';
const state = { theme: 0, font: 0 };

function qs<T extends HTMLElement = HTMLElement>(sel: string): T | null {
  return document.querySelector<T>(sel);
}

function applyStyle(): void {
  const t = THEMES[state.theme];
  const f = FONTS[state.font];
  const r = document.documentElement.style;
  r.setProperty('--m-bg', t.bg);
  r.setProperty('--m-surface', t.surface);
  r.setProperty('--m-ink', t.ink);
  r.setProperty('--m-body', t.body);
  r.setProperty('--m-accent', t.accent);
  r.setProperty('--m-onaccent', t.onaccent);
  r.setProperty('--m-line', t.line);
  r.setProperty('--m-display', f.display);
  r.setProperty('--m-display-ls', f.ls);
  r.setProperty('--m-display-wt', f.wt);
  r.setProperty('--m-body-font', f.body);
  document.querySelectorAll<HTMLElement>('.m-swatch').forEach((s, i) =>
    s.classList.toggle('on', i === state.theme));
  const fontBtn = qs('#mFont');
  if (fontBtn) fontBtn.textContent = f.name;
  save();
}

function save(): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

function load(): void {
  const m = location.hash.match(/^#m=(\d+)\.(\d+)$/);
  if (m) {
    state.theme = Math.min(THEMES.length - 1, Number(m[1]));
    state.font = Math.min(FONTS.length - 1, Number(m[2]));
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<typeof state>;
      if (typeof s.theme === 'number') state.theme = Math.min(THEMES.length - 1, Math.max(0, s.theme));
      if (typeof s.font === 'number') state.font = Math.min(FONTS.length - 1, Math.max(0, s.font));
    }
  } catch { /* ignore corrupt/blocked storage */ }
}

function toast(msg: string): void {
  const t = qs('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  window.setTimeout(() => t.classList.remove('on'), 2600);
}

function buildBar(): void {
  const bar = document.createElement('div');
  bar.className = 'm-bar';
  bar.setAttribute('aria-label', 'Restyle this page');
  const swatches = THEMES.map((t, i) =>
    `<button class="m-swatch" style="background:${t.accent}" aria-label="Theme ${i + 1}" data-theme="${i}"></button>`).join('');
  bar.innerHTML = `
    <span class="m-swatches">${swatches}</span>
    <button class="m-btn" id="mFont">Editorial</button>
    <button class="m-btn" id="mShuffle">Shuffle</button>
    <button class="m-btn" id="mTilt">Tilt</button>`;
  document.body.append(bar);

  bar.querySelectorAll<HTMLElement>('.m-swatch').forEach(s =>
    s.addEventListener('click', () => { state.theme = Number(s.dataset.theme); applyStyle(); }));
  qs('#mFont')!.addEventListener('click', () => { state.font = (state.font + 1) % FONTS.length; applyStyle(); });
  qs('#mShuffle')!.addEventListener('click', () => {
    state.theme = Math.floor(Math.random() * THEMES.length);
    state.font = Math.floor(Math.random() * FONTS.length);
    applyStyle();
  });
  qs('#mTilt')!.addEventListener('click', enableTilt);
}

/* ── Tilt parallax ───────────────────────── */

type OrientationPerm = 'granted' | 'denied' | 'default';
interface DOEStatic { requestPermission?: () => Promise<OrientationPerm> }

let tiltOn = false;
let stage: HTMLElement | null = null;
let baseG: number | null = null, baseB: number | null = null, gotEvent = false;
let targetX = 0, targetY = 0, curX = 0, curY = 0, rafPending = false;

function buildHeroFx(): void {
  const art = qs('#artboard');
  if (!art) return;
  const fx = document.createElement('div');
  fx.className = 'm-fx';
  fx.setAttribute('aria-hidden', 'true');
  const specs = [
    { s: 200, l: '-40px', t: '-30px', o: 0.7 },
    { s: 150, l: '58%', t: '20px', o: 0.6 },
    { s: 120, l: '30%', t: '150px', o: 0.5 },
  ];
  specs.forEach(sp => {
    const b = document.createElement('div');
    b.className = 'm-blob';
    b.style.width = b.style.height = `${sp.s}px`;
    b.style.left = sp.l;
    b.style.top = sp.t;
    b.style.opacity = String(sp.o);
    fx.append(b);
  });
  art.prepend(fx);
  stage = art;
}

// The published mobile site is the desktop design's layer stack made physical:
// each block sits higher than the one beneath it (top of the page nearest),
// so tilting fans them into an exaggerated 3D staircase.
function setupDepthLayers(): void {
  if (!stage) return;
  const kids = ([...stage.children] as HTMLElement[])
    .filter(el => el.id !== 'emptyState' && !el.classList.contains('m-fx'));
  const base = 78, step = 9;
  kids.forEach((el, i) => el.style.setProperty('--z', String(base - i * step)));
  stage.querySelector<HTMLElement>('.m-fx')?.style.setProperty('--z', '-120');
}

function tiltFrame(): void {
  rafPending = false;
  curX += (targetX - curX) * 0.12;
  curY += (targetY - curY) * 0.12;
  if (stage) {
    // Each block carries its own perspective and tilts about its own centre
    // (see CSS), so this stays stable while the page scrolls — no giant
    // rotating element, no scroll-synced origin. --tz ramps depth in from flat;
    // higher --z blocks pop nearer, so each sits above the one beneath it.
    const mag = Math.min(1, Math.hypot(curX, curY));
    stage.style.setProperty('--tz', mag.toFixed(3));
    stage.style.setProperty('--rx', `${(curY * -16).toFixed(2)}deg`);
    stage.style.setProperty('--ry', `${(curX * 16).toFixed(2)}deg`);
  }
  if (Math.abs(targetX - curX) > 0.02 || Math.abs(targetY - curY) > 0.02) schedule();
}

function schedule(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(tiltFrame);
}

function onOrient(e: DeviceOrientationEvent): void {
  const g = e.gamma, b = e.beta;
  if (g === null || b === null) return;
  gotEvent = true;
  // Recentre on the first reading: however the phone is held becomes neutral,
  // and we react to movement from there (24 degrees of tilt = full effect).
  if (baseG === null) { baseG = g; baseB = b; }
  targetX = Math.max(-1, Math.min(1, (g - baseG) / 24));
  targetY = Math.max(-1, Math.min(1, (b - (baseB ?? b)) / 24));
  schedule();
}

function enableTilt(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    toast('Tilt is off while reduced motion is on.');
    return;
  }
  const btn = qs('#mTilt');
  if (tiltOn) {
    tiltOn = false;
    window.removeEventListener('deviceorientation', onOrient);
    targetX = targetY = curX = curY = 0;
    if (stage) {
      stage.style.setProperty('--tz', '0');
      stage.style.setProperty('--rx', '0deg');
      stage.style.setProperty('--ry', '0deg');
      stage.classList.remove('tilt3d');
    }
    btn?.classList.remove('on');
    return;
  }
  const DOE = (window.DeviceOrientationEvent ?? undefined) as unknown as DOEStatic | undefined;
  const start = (): void => {
    tiltOn = true;
    gotEvent = false;
    baseG = baseB = null;
    stage?.classList.add('tilt3d');
    window.addEventListener('deviceorientation', onOrient);
    btn?.classList.add('on');
    toast('Tilt your phone. Each layer lifts in 3D from wherever you’re holding it.');
    window.setTimeout(() => {
      if (tiltOn && !gotEvent) toast('This device isn’t sending motion data, so tilt has nothing to work with.');
    }, 1600);
  };
  if (DOE && typeof DOE.requestPermission === 'function') {
    DOE.requestPermission().then(res => {
      if (res === 'granted') start();
      else toast('Motion access denied.');
    }).catch(() => toast('Motion not available on this device.'));
  } else if (DOE) {
    start();
  } else {
    toast('This device has no motion sensor.');
  }
}

/* ── Swipeable demos ─────────────────────── */

let viewerIdx = 0;

function loadSlide(i: number): void {
  if (i < 0 || i >= DEMOS.length) return;
  const slide = document.querySelectorAll<HTMLElement>('.m-slide')[i];
  const f = slide?.querySelector('iframe') as HTMLIFrameElement | null;
  if (f && !f.getAttribute('src')) f.src = DEMOS[i].href;
}

function setActive(i: number): void {
  viewerIdx = Math.max(0, Math.min(DEMOS.length - 1, i));
  [viewerIdx - 1, viewerIdx, viewerIdx + 1].forEach(loadSlide);
  const v = qs('.m-viewer');
  if (!v) return;
  const vt = v.querySelector('.m-vt');
  if (vt) vt.textContent = DEMOS[viewerIdx].name;
  const open = v.querySelector('.m-open') as HTMLAnchorElement | null;
  if (open) open.href = DEMOS[viewerIdx].href;
  const prev = v.querySelector('.m-prev') as HTMLButtonElement | null;
  const next = v.querySelector('.m-next') as HTMLButtonElement | null;
  if (prev) prev.disabled = viewerIdx === 0;
  if (next) next.disabled = viewerIdx === DEMOS.length - 1;
  v.querySelectorAll('.m-dots i').forEach((d, n) => d.classList.toggle('on', n === viewerIdx));
}

function scrollToDemo(i: number): void {
  const track = qs('.m-track');
  if (!track) return;
  const clamped = Math.max(0, Math.min(DEMOS.length - 1, i));
  track.scrollTo({ left: clamped * track.clientWidth, behavior: 'smooth' });
}

function buildViewer(): void {
  const v = document.createElement('div');
  v.className = 'm-viewer';
  v.hidden = true;
  v.innerHTML = `
    <div class="m-viewer-bar">
      <button class="m-close" type="button">← Back</button>
      <span class="m-vt"></span>
      <a class="m-open" target="_blank" rel="noopener">Open ↗</a>
    </div>
    <div class="m-track">
      ${DEMOS.map(d => `
        <div class="m-slide">
          <iframe title="${d.name}" loading="lazy"></iframe>
          <button class="m-try" type="button">Tap to try ${d.name}</button>
        </div>`).join('')}
    </div>
    <div class="m-viewer-nav">
      <button class="m-prev" type="button" aria-label="Previous demo">‹</button>
      <span class="m-dots">${DEMOS.map(() => '<i></i>').join('')}</span>
      <button class="m-next" type="button" aria-label="Next demo">›</button>
    </div>`;
  document.body.append(v);

  const track = v.querySelector('.m-track') as HTMLElement;
  v.querySelector('.m-close')!.addEventListener('click', closeViewer);
  v.querySelector('.m-prev')!.addEventListener('click', () => scrollToDemo(viewerIdx - 1));
  v.querySelector('.m-next')!.addEventListener('click', () => scrollToDemo(viewerIdx + 1));
  v.querySelectorAll<HTMLElement>('.m-slide').forEach(slide => {
    slide.querySelector('.m-try')!.addEventListener('click', () => {
      const f = slide.querySelector('iframe') as HTMLIFrameElement;
      f.style.pointerEvents = 'auto';
      (slide.querySelector('.m-try') as HTMLElement).style.display = 'none';
    });
  });

  let raf = 0;
  track.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== viewerIdx) setActive(i);
    });
  }, { passive: true });
}

function openViewer(idx: number): void {
  const v = qs('.m-viewer');
  const track = qs('.m-track');
  if (!v || !track) return;
  v.hidden = false;
  document.body.style.overflow = 'hidden';
  setActive(idx);
  track.scrollLeft = viewerIdx * track.clientWidth;
}

function closeViewer(): void {
  const v = qs('.m-viewer');
  if (!v) return;
  v.hidden = true;
  document.body.style.overflow = '';
}

function setupCarousel(): void {
  const chip = qs('a.play[data-demo]');
  const section = chip?.closest<HTMLElement>('.work');
  if (!section) return;
  section.classList.add('m-carousel');
  const hint = document.createElement('p');
  hint.className = 'm-swipehint';
  hint.textContent = 'swipe to browse, tap to open →';
  section.before(hint);
  section.querySelectorAll<HTMLElement>('.item').forEach(item => {
    const key = item.querySelector<HTMLElement>('[data-demo]')?.dataset.demo;
    const idx = DEMOS.findIndex(d => d.key === key);
    if (idx < 0) return;
    item.addEventListener('click', e => {
      e.preventDefault();
      openViewer(idx);
    });
  });
}

export function initMobile(): void {
  load();
  buildHeroFx();
  setupDepthLayers();
  buildBar();
  buildViewer();
  setupCarousel();
  applyStyle();
  window.setTimeout(() => toast('Tip: restyle this page from the bar below.'), 1200);
}
