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

const FONTS: Font[] = [
  { name: 'Editorial', display: `ui-serif,"New York",Georgia,serif`, body: SANS, ls: '-.015em', wt: '600' },
  { name: 'Grotesk', display: `"Avenir Next",${SANS}`, body: SANS, ls: '-.03em', wt: '800' },
  { name: 'Mono', display: `ui-monospace,"SF Mono",Menlo,monospace`, body: SANS, ls: '-.02em', wt: '700' },
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
    <span class="grow"></span>
    <button class="m-btn" id="mTilt">Tilt</button>
    <button class="m-btn" id="mShare">Share</button>`;
  document.body.append(bar);

  bar.querySelectorAll<HTMLElement>('.m-swatch').forEach(s =>
    s.addEventListener('click', () => { state.theme = Number(s.dataset.theme); applyStyle(); }));
  qs('#mFont')!.addEventListener('click', () => { state.font = (state.font + 1) % FONTS.length; applyStyle(); });
  qs('#mShuffle')!.addEventListener('click', () => {
    state.theme = Math.floor(Math.random() * THEMES.length);
    state.font = Math.floor(Math.random() * FONTS.length);
    applyStyle();
  });
  qs('#mShare')!.addEventListener('click', () => {
    const url = `${location.origin}${location.pathname}#m=${state.theme}.${state.font}`;
    navigator.clipboard.writeText(url).then(
      () => toast('Link copied. Your styling travels with it.'),
      () => window.prompt('Copy your link:', url),
    );
  });
  qs('#mTilt')!.addEventListener('click', enableTilt);
}

/* ── Tilt parallax ───────────────────────── */

type OrientationPerm = 'granted' | 'denied' | 'default';
interface DOEStatic { requestPermission?: () => Promise<OrientationPerm> }

let tiltOn = false;
let blobs: HTMLElement[] = [];
let hero: HTMLElement | null = null;
let targetX = 0, targetY = 0, curX = 0, curY = 0, rafPending = false;

function buildHeroFx(): void {
  const art = qs('#artboard');
  if (!art) return;
  const fx = document.createElement('div');
  fx.className = 'm-fx';
  fx.setAttribute('aria-hidden', 'true');
  const specs = [
    { s: 200, l: '-40px', t: '-30px', o: 0.5 },
    { s: 150, l: '58%', t: '20px', o: 0.4 },
    { s: 120, l: '30%', t: '150px', o: 0.3 },
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
  blobs = [...fx.querySelectorAll<HTMLElement>('.m-blob')];
  hero = qs('#heading');
}

function tiltFrame(): void {
  rafPending = false;
  curX += (targetX - curX) * 0.12;
  curY += (targetY - curY) * 0.12;
  blobs.forEach((b, i) => {
    const depth = (i + 1) * 6;
    b.style.transform = `translate(${curX * depth}px, ${curY * depth}px)`;
  });
  if (hero) hero.style.transform = `translate(${curX * -3}px, ${curY * -2}px)`;
  if (Math.abs(targetX - curX) > 0.05 || Math.abs(targetY - curY) > 0.05) schedule();
}

function schedule(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(tiltFrame);
}

function onOrient(e: DeviceOrientationEvent): void {
  const g = e.gamma ?? 0;
  const b = e.beta ?? 0;
  targetX = Math.max(-1, Math.min(1, g / 30));
  targetY = Math.max(-1, Math.min(1, (b - 45) / 30));
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
    targetX = targetY = 0; schedule();
    btn?.classList.remove('on');
    return;
  }
  const DOE = (window.DeviceOrientationEvent ?? undefined) as unknown as DOEStatic | undefined;
  const start = (): void => {
    tiltOn = true;
    window.addEventListener('deviceorientation', onOrient);
    btn?.classList.add('on');
    toast('Tilt your phone to explore.');
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
    <iframe title="Demo"></iframe>
    <div class="m-viewer-nav">
      <button class="m-prev" type="button" aria-label="Previous demo">‹</button>
      <span class="m-dots">${DEMOS.map(() => '<i></i>').join('')}</span>
      <button class="m-next" type="button" aria-label="Next demo">›</button>
    </div>`;
  document.body.append(v);
  v.querySelector('.m-close')!.addEventListener('click', () => closeViewer());
  v.querySelector('.m-prev')!.addEventListener('click', () => showDemo(viewerIdx - 1));
  v.querySelector('.m-next')!.addEventListener('click', () => showDemo(viewerIdx + 1));
}

function showDemo(idx: number): void {
  viewerIdx = Math.max(0, Math.min(DEMOS.length - 1, idx));
  const d = DEMOS[viewerIdx];
  const v = qs('.m-viewer');
  if (!v) return;
  (v.querySelector('iframe') as HTMLIFrameElement).src = d.href;
  v.querySelector('.m-vt')!.textContent = d.name;
  (v.querySelector('.m-open') as HTMLAnchorElement).href = d.href;
  (v.querySelector('.m-prev') as HTMLButtonElement).disabled = viewerIdx === 0;
  (v.querySelector('.m-next') as HTMLButtonElement).disabled = viewerIdx === DEMOS.length - 1;
  v.querySelectorAll('.m-dots i').forEach((dot, i) => dot.classList.toggle('on', i === viewerIdx));
}

function openViewer(idx: number): void {
  const v = qs('.m-viewer');
  if (!v) return;
  v.hidden = false;
  document.body.style.overflow = 'hidden';
  showDemo(idx);
}

function closeViewer(): void {
  const v = qs('.m-viewer');
  if (!v) return;
  v.hidden = true;
  document.body.style.overflow = '';
  (v.querySelector('iframe') as HTMLIFrameElement).src = 'about:blank';
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
  buildBar();
  buildViewer();
  setupCarousel();
  applyStyle();
  window.setTimeout(() => toast('Tip: restyle this page from the bar below.'), 1200);
}
