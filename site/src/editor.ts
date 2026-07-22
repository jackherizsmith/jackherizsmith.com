import * as store from './store';
import * as hist from './history';

interface Rect { x: number; y: number; w: number; h: number }
interface SnapCand { v: number; rect: Rect }
interface LiveVals { x: number; y: number; w: number; h: number; r: number }

interface Gesture {
  kind: 'drag' | 'resize' | 'rotate';
  node: HTMLElement;
  id: string;
  startX: number;
  startY: number;
  base: store.NodeState;
  rect0: Rect;
  dir: string;
  moved: boolean;
  live: { x: number; y: number; r: number; w: number | null; h: number | null };
  targetsX: SnapCand[];
  targetsY: SnapCand[];
}

let canvas: HTMLElement;
let canvasInner: HTMLElement;
let selBox: HTMLElement;
let dimsEl: HTMLElement;
let guidesEl: HTMLElement;

let selected: HTMLElement | null = null;
let gesture: Gesture | null = null;
let editingEl: HTMLElement | null = null;
let editingPrev = '';
let lastWasSelected = false;
let squelchClick = false;
let pendingNav: number | undefined;
let rotateCentre = { x: 0, y: 0 };
let rotateStart = 0;
let nudge: { id: string; before: { x: number; y: number }; timer: number } | null = null;

const selectCbs: Array<(el: HTMLElement | null) => void> = [];
const liveCbs: Array<(v: LiveVals | null) => void> = [];

export function onSelect(cb: (el: HTMLElement | null) => void): void { selectCbs.push(cb); }
export function onLive(cb: (v: LiveVals | null) => void): void { liveCbs.push(cb); }
export function selectedEl(): HTMLElement | null { return selected; }
export function isBusy(): boolean { return gesture?.moved === true || editingEl !== null; }

function qs(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

export function visualRect(el: HTMLElement): Rect {
  let x = 0, y = 0;
  let o: HTMLElement | null = el;
  while (o && o !== canvasInner) {
    x += o.offsetLeft;
    y += o.offsetTop;
    o = o.offsetParent instanceof HTMLElement ? o.offsetParent : null;
  }
  let t: HTMLElement | null = el;
  while (t && t !== canvasInner) {
    const id = t.dataset.id;
    if (id && t.dataset.node !== undefined) {
      const s = store.getState(id);
      x += s.x;
      y += s.y;
    }
    t = t.parentElement;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function containsLink(el: HTMLElement): boolean {
  return el.closest('a') !== null || el.querySelector('a') !== null;
}

function syncOverlay(): void {
  if (!selected || (selected.offsetWidth === 0 && !gesture)) {
    selBox.classList.remove('on');
    liveCbs.forEach(cb => cb(null));
    return;
  }
  const id = selected.dataset.id ?? '';
  const s = store.getState(id);
  const rect = visualRect(selected);
  let { x, y } = rect;
  let rot = s.r;
  if (gesture && gesture.node === selected && gesture.kind !== 'rotate') {
    x = gesture.rect0.x + (gesture.live.x - gesture.base.x);
    y = gesture.rect0.y + (gesture.live.y - gesture.base.y);
  }
  if (gesture && gesture.node === selected) rot = gesture.live.r;
  const w = selected.offsetWidth, h = selected.offsetHeight;
  selBox.style.left = `${x}px`;
  selBox.style.top = `${y}px`;
  selBox.style.width = `${w}px`;
  selBox.style.height = `${h}px`;
  selBox.style.transform = `rotate(${rot}deg)`;
  if (gesture?.kind === 'rotate') dimsEl.textContent = `${Math.round(rot)}°`;
  else {
    const linkHint = containsLink(selected) && !gesture ? ' · click again ↗' : '';
    dimsEl.textContent = `${Math.round(w)} × ${Math.round(h)}${linkHint}`;
  }
  selBox.classList.add('on');
  liveCbs.forEach(cb => cb({ x, y, w, h, r: rot }));
}

export function select(el: HTMLElement | null): void {
  selected = el;
  syncOverlay();
  selectCbs.forEach(cb => cb(el));
}

function snapTargets(exclude: HTMLElement): { xs: SnapCand[]; ys: SnapCand[] } {
  const xs: SnapCand[] = [], ys: SnapCand[] = [];
  const push = (rect: Rect): void => {
    xs.push({ v: rect.x, rect }, { v: rect.x + rect.w / 2, rect }, { v: rect.x + rect.w, rect });
    ys.push({ v: rect.y, rect }, { v: rect.y + rect.h / 2, rect }, { v: rect.y + rect.h, rect });
  };
  const art = document.getElementById('artboard');
  if (art) push(visualRect(art));
  for (const id of store.allIds()) {
    const el = store.getEl(id);
    if (!el || el === exclude || exclude.contains(el) || el.contains(exclude)) continue;
    if (store.getState(id).hidden) continue;
    if (el.parentElement?.closest('[data-node]')) continue;
    push(visualRect(el));
  }
  return { xs, ys };
}

function axisSnap(edges: number[], cands: SnapCand[]): { shift: number; hits: SnapCand[] } {
  let best = Infinity;
  for (const c of cands) for (const e of edges) {
    const d = c.v - e;
    if (Math.abs(d) < Math.abs(best)) best = d;
  }
  if (!Number.isFinite(best) || Math.abs(best) > 5) return { shift: 0, hits: [] };
  const snapped = edges.map(e => e + best);
  const seen = new Set<number>();
  const hits = cands.filter(c => {
    const hit = snapped.some(e => Math.abs(e - c.v) < 0.5);
    if (!hit) return false;
    const key = Math.round(c.v * 2);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { shift: best, hits };
}

function renderGuides(hitsX: SnapCand[], hitsY: SnapCand[], drag: Rect): void {
  guidesEl.textContent = '';
  for (const hit of hitsX) {
    const top = Math.min(drag.y, hit.rect.y) - 4;
    const bottom = Math.max(drag.y + drag.h, hit.rect.y + hit.rect.h) + 4;
    const g = document.createElement('div');
    g.className = 'guide v';
    g.style.left = `${hit.v}px`;
    g.style.top = `${top}px`;
    g.style.height = `${bottom - top}px`;
    guidesEl.append(g);
  }
  for (const hit of hitsY) {
    const left = Math.min(drag.x, hit.rect.x) - 4;
    const right = Math.max(drag.x + drag.w, hit.rect.x + hit.rect.w) + 4;
    const g = document.createElement('div');
    g.className = 'guide h';
    g.style.top = `${hit.v}px`;
    g.style.left = `${left}px`;
    g.style.width = `${right - left}px`;
    guidesEl.append(g);
  }
}

function startGesture(kind: Gesture['kind'], node: HTMLElement, e: PointerEvent, dir = ''): void {
  const id = node.dataset.id ?? '';
  const base = store.getState(id);
  gesture = {
    kind, node, id, dir,
    startX: e.clientX, startY: e.clientY,
    base, rect0: visualRect(node), moved: false,
    live: { x: base.x, y: base.y, r: base.r, w: base.w, h: base.h },
    targetsX: [], targetsY: [],
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  window.clearTimeout(pendingNav);
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (!target) return;
  if (editingEl && editingEl.contains(target)) return;
  const node = target.closest<HTMLElement>('[data-node]');
  if (editingEl) commitTextEdit();
  if (!node || !canvasInner.contains(node) || !node.dataset.id) {
    select(null);
    return;
  }
  lastWasSelected = selected === node;
  select(node);
  startGesture('drag', node, e);
  e.preventDefault();
}

function onHandleDown(e: PointerEvent): void {
  if (!selected || !(e.currentTarget instanceof HTMLElement)) return;
  const dir = e.currentTarget.dataset.handle ?? '';
  if (editingEl) commitTextEdit();
  startGesture(dir === 'rotate' ? 'rotate' : 'resize', selected, e, dir);
  if (dir === 'rotate') {
    const b = selBox.getBoundingClientRect();
    rotateCentre = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    rotateStart = Math.atan2(e.clientY - rotateCentre.y, e.clientX - rotateCentre.x);
  }
  e.stopPropagation();
  e.preventDefault();
}

function onPointerMove(e: PointerEvent): void {
  const g = gesture;
  if (!g) return;
  const dx = e.clientX - g.startX;
  const dy = e.clientY - g.startY;
  if (!g.moved) {
    if (g.kind === 'drag' && Math.hypot(dx, dy) < 3) return;
    g.moved = true;
    document.body.classList.add('interacting');
    if (g.kind === 'drag') {
      const t = snapTargets(g.node);
      g.targetsX = t.xs;
      g.targetsY = t.ys;
    }
  }
  if (g.kind === 'drag') {
    const rect: Rect = { x: g.rect0.x + dx, y: g.rect0.y + dy, w: g.rect0.w, h: g.rect0.h };
    const sx = axisSnap([rect.x, rect.x + rect.w / 2, rect.x + rect.w], g.targetsX);
    const sy = axisSnap([rect.y, rect.y + rect.h / 2, rect.y + rect.h], g.targetsY);
    rect.x += sx.shift;
    rect.y += sy.shift;
    g.live.x = g.base.x + dx + sx.shift;
    g.live.y = g.base.y + dy + sy.shift;
    store.applyVisual(g.node, g.live);
    renderGuides(sx.hits, sy.hits, rect);
  } else if (g.kind === 'resize') {
    const rad = g.base.r * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const ldx = dx * cos + dy * sin;
    const ldy = -dx * sin + dy * cos;
    const w0 = g.rect0.w, h0 = g.rect0.h;
    let w = w0, h = h0;
    if (g.dir.includes('e')) w = w0 + ldx;
    if (g.dir.includes('w')) w = w0 - ldx;
    if (g.dir.includes('s')) h = h0 + ldy;
    if (g.dir.includes('n')) h = h0 - ldy;
    w = Math.max(24, Math.round(w));
    h = Math.max(24, Math.round(h));
    let nx = g.base.x, ny = g.base.y;
    if (g.dir.includes('w')) { nx += (w0 - w) * cos; ny += (w0 - w) * sin; }
    if (g.dir.includes('n')) { nx += -(h0 - h) * sin; ny += (h0 - h) * cos; }
    g.live.w = w;
    g.live.h = h;
    g.live.x = Math.round(nx);
    g.live.y = Math.round(ny);
    store.applyVisual(g.node, g.live);
  } else {
    const a = Math.atan2(e.clientY - rotateCentre.y, e.clientX - rotateCentre.x);
    let r = g.base.r + (a - rotateStart) * 180 / Math.PI;
    r = ((r + 180) % 360 + 360) % 360 - 180;
    if (e.shiftKey) r = Math.round(r / 15) * 15;
    else for (const t of [0, 90, -90, 180, -180]) {
      if (Math.abs(r - t) < 5) { r = t; break; }
    }
    g.live.r = Math.round(r * 10) / 10;
    store.applyVisual(g.node, g.live);
  }
  syncOverlay();
}

function onPointerUp(): void {
  const g = gesture;
  gesture = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  guidesEl.textContent = '';
  document.body.classList.remove('interacting');
  if (!g) return;
  if (g.moved) {
    squelchClick = true;
    window.setTimeout(() => { squelchClick = false; }, 0);
    const { id } = g;
    const before = { x: g.base.x, y: g.base.y, r: g.base.r, w: g.base.w, h: g.base.h };
    const after = { x: g.live.x, y: g.live.y, r: g.live.r, w: g.live.w, h: g.live.h };
    store.setState(id, after);
    const labels = { drag: 'Move', resize: 'Resize', rotate: 'Rotate' } as const;
    hist.push({
      label: `${labels[g.kind]} ${g.node.dataset.node ?? ''}`,
      undo: () => store.setState(id, before),
      redo: () => store.setState(id, after),
    });
  }
  syncOverlay();
}

function onClick(e: MouseEvent): void {
  if (squelchClick) {
    e.preventDefault();
    e.stopPropagation();
    squelchClick = false;
    return;
  }
  const target = e.target instanceof HTMLElement ? e.target : null;
  const a = target?.closest('a');
  if (!a || !canvasInner.contains(a)) return;
  if (e.metaKey || e.ctrlKey) return;
  if (!lastWasSelected) {
    e.preventDefault();
    return;
  }
  if (a.closest('[data-node][data-text]')) {
    e.preventDefault();
    const href = a.href;
    pendingNav = window.setTimeout(() => location.assign(href), 280);
  }
}

function onDblClick(e: MouseEvent): void {
  window.clearTimeout(pendingNav);
  const target = e.target instanceof HTMLElement ? e.target : null;
  const node = target?.closest<HTMLElement>('[data-node][data-text]');
  if (!node || !canvasInner.contains(node)) return;
  e.preventDefault();
  beginTextEdit(node);
}

function onEditBlur(): void { commitTextEdit(); }

function onEditKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelTextEdit();
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    commitTextEdit();
  }
  e.stopPropagation();
}

export function beginTextEdit(el: HTMLElement): void {
  if (editingEl === el) return;
  if (editingEl) commitTextEdit();
  select(el);
  editingEl = el;
  editingPrev = el.innerText;
  try {
    el.contentEditable = 'plaintext-only';
  } catch {
    el.contentEditable = 'true';
  }
  el.classList.add('editing');
  selBox.classList.add('editing');
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  el.addEventListener('blur', onEditBlur);
  el.addEventListener('keydown', onEditKey);
}

function exitEdit(): HTMLElement | null {
  const el = editingEl;
  if (!el) return null;
  editingEl = null;
  el.removeAttribute('contenteditable');
  el.classList.remove('editing');
  selBox.classList.remove('editing');
  el.removeEventListener('blur', onEditBlur);
  el.removeEventListener('keydown', onEditKey);
  return el;
}

function cancelTextEdit(): void {
  const el = exitEdit();
  if (!el) return;
  el.innerText = editingPrev;
  syncOverlay();
}

export function commitTextEdit(): void {
  const el = exitEdit();
  if (!el) return;
  const id = el.dataset.id ?? '';
  const next = el.innerText.replace(/\u00a0/g, ' ');
  if (next !== editingPrev) {
    const before = store.getState(id).text;
    store.setState(id, { text: next });
    hist.push({
      label: 'Edit text',
      undo: () => store.setState(id, { text: before }),
      redo: () => store.setState(id, { text: next }),
    });
  }
  syncOverlay();
}

function onKey(e: KeyboardEvent): void {
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
  if (editingEl) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) hist.redo();
    else hist.undo();
    return;
  }
  if (mod && e.key === '\\') {
    e.preventDefault();
    document.body.classList.toggle('panels-hidden');
    syncOverlay();
    return;
  }
  if (!selected) return;
  const el = selected;
  const id = el.dataset.id ?? '';
  if (e.key === 'Escape') {
    select(null);
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    store.setState(id, { hidden: true });
    hist.push({
      label: `Delete ${el.dataset.node ?? ''}`,
      undo: () => { store.setState(id, { hidden: false }); select(el); },
      redo: () => store.setState(id, { hidden: true }),
    });
    select(null);
    return;
  }
  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };
  const d = arrows[e.key];
  if (!d) return;
  e.preventDefault();
  const k = e.shiftKey ? 10 : 1;
  const s = store.getState(id);
  if (!nudge || nudge.id !== id) nudge = { id, before: { x: s.x, y: s.y }, timer: 0 };
  window.clearTimeout(nudge.timer);
  store.setState(id, { x: s.x + d[0] * k, y: s.y + d[1] * k });
  const n = nudge;
  n.timer = window.setTimeout(() => {
    const after = store.getState(id);
    const fx = after.x, fy = after.y;
    hist.push({
      label: 'Nudge',
      undo: () => store.setState(id, { x: n.before.x, y: n.before.y }),
      redo: () => store.setState(id, { x: fx, y: fy }),
    });
    if (nudge === n) nudge = null;
  }, 600);
}

export function initEditor(): void {
  canvas = qs('#canvas');
  canvasInner = qs('#canvasInner');
  selBox = qs('#selBox');
  dimsEl = qs('#dims');
  guidesEl = qs('#guides');
  canvasInner.addEventListener('pointerdown', onPointerDown);
  canvasInner.addEventListener('click', onClick);
  canvasInner.addEventListener('dblclick', onDblClick);
  selBox.querySelectorAll<HTMLElement>('[data-handle]').forEach(h => {
    h.addEventListener('pointerdown', onHandleDown);
  });
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => syncOverlay());
  store.onChange(id => {
    if (selected && selected.dataset.id === id) syncOverlay();
  });
  document.querySelectorAll<HTMLAnchorElement>('#canvasInner a').forEach(a => {
    a.draggable = false;
  });
  canvas.scrollLeft = 90;
  canvas.scrollTop = 30;
}
