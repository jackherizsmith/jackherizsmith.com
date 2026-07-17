export interface NodeState {
  x: number;
  y: number;
  r: number;
  w: number | null;
  h: number | null;
  text: string | null;
  fill: string | null;
  hidden: boolean;
}

export interface AddedSticky {
  id: string;
  x: number;
  y: number;
}

export interface DocSnapshot {
  v: 1;
  nodes: Record<string, Partial<NodeState>>;
  added: AddedSticky[];
}

const LS_KEY = 'jhs-editor-v1';

const registry = new Map<string, HTMLElement>();
const states = new Map<string, NodeState>();
const baseRots = new Map<string, number>();
const baseTexts = new Map<string, string>();
const added: AddedSticky[] = [];

let loading = false;
let remixSource = false;
let persistTimer: number | undefined;
const changeCbs: Array<(id: string) => void> = [];
const forkCbs: Array<() => void> = [];

export function onChange(cb: (id: string) => void): void { changeCbs.push(cb); }
export function onFork(cb: () => void): void { forkCbs.push(cb); }

function computedRotation(el: HTMLElement): number {
  const m = getComputedStyle(el).transform;
  if (!m || m === 'none' || !m.startsWith('matrix(')) return 0;
  const v = m.slice(7, -1).split(',').map(Number);
  return Math.round(Math.atan2(v[1], v[0]) * 180 / Math.PI * 10) / 10;
}

function registerEl(el: HTMLElement): void {
  const id = el.dataset.id;
  if (!id) return;
  registry.set(id, el);
  baseRots.set(id, computedRotation(el));
  if (el.hasAttribute('data-text')) baseTexts.set(id, el.innerText);
}

export function registerAll(): void {
  document.querySelectorAll<HTMLElement>('[data-node]').forEach(registerEl);
}

export function getEl(id: string): HTMLElement | undefined { return registry.get(id); }
export function allIds(): string[] { return [...registry.keys()]; }
export function isText(el: HTMLElement): boolean { return el.hasAttribute('data-text'); }

export function defaultStateOf(id: string): NodeState {
  return { x: 0, y: 0, r: baseRots.get(id) ?? 0, w: null, h: null, text: null, fill: null, hidden: false };
}

export function getState(id: string): NodeState {
  const s = states.get(id);
  return s ? { ...s } : defaultStateOf(id);
}

function statesEqual(a: NodeState, b: NodeState): boolean {
  return a.x === b.x && a.y === b.y && a.r === b.r && a.w === b.w && a.h === b.h
    && a.text === b.text && a.fill === b.fill && a.hidden === b.hidden;
}

export function applyVisual(el: HTMLElement, v: { x: number; y: number; r: number; w: number | null; h: number | null }): void {
  el.style.transform = `translate(${v.x}px, ${v.y}px) rotate(${v.r}deg)`;
  el.style.width = v.w === null ? '' : `${v.w}px`;
  if (isText(el)) el.style.minHeight = v.h === null ? '' : `${v.h}px`;
  else el.style.height = v.h === null ? '' : `${v.h}px`;
}

function fillsBackground(el: HTMLElement): boolean {
  return !isText(el) || el.classList.contains('btn') || el.classList.contains('sticky');
}

function apply(el: HTMLElement, s: NodeState): void {
  applyVisual(el, s);
  const id = el.dataset.id ?? '';
  if (isText(el)) {
    const want = s.text ?? baseTexts.get(id) ?? el.textContent ?? '';
    if (el.innerText !== want) el.textContent = want;
  }
  if (s.fill !== null) {
    if (fillsBackground(el)) el.style.background = s.fill;
    else el.style.color = s.fill;
  } else {
    el.style.background = '';
    el.style.color = '';
  }
  el.style.visibility = s.hidden ? 'hidden' : '';
}

function notify(id: string): void {
  if (loading) return;
  if (remixSource) {
    remixSource = false;
    history.replaceState(null, '', location.pathname + location.search);
    forkCbs.forEach(cb => cb());
  }
  schedulePersist();
  changeCbs.forEach(cb => cb(id));
}

export function setState(id: string, patch: Partial<NodeState>): void {
  const el = registry.get(id);
  if (!el) return;
  const next = { ...getState(id), ...patch };
  if (statesEqual(next, getState(id)) && states.has(id)) return;
  states.set(id, next);
  apply(el, next);
  notify(id);
}

export function editCount(): number {
  let n = added.length;
  states.forEach((s, id) => { if (!statesEqual(s, defaultStateOf(id))) n++; });
  return n;
}

export function hasChanges(): boolean { return editCount() > 0; }

export function serialise(): DocSnapshot | null {
  const nodes: Record<string, Partial<NodeState>> = {};
  states.forEach((s, id) => {
    const d = defaultStateOf(id);
    const patch: Partial<NodeState> = {};
    if (s.x !== d.x) patch.x = s.x;
    if (s.y !== d.y) patch.y = s.y;
    if (s.r !== d.r) patch.r = s.r;
    if (s.w !== d.w) patch.w = s.w;
    if (s.h !== d.h) patch.h = s.h;
    if (s.text !== d.text) patch.text = s.text;
    if (s.fill !== d.fill) patch.fill = s.fill;
    if (s.hidden !== d.hidden) patch.hidden = s.hidden;
    if (Object.keys(patch).length) nodes[id] = patch;
  });
  if (!Object.keys(nodes).length && !added.length) return null;
  return { v: 1, nodes, added: added.map(a => ({ ...a })) };
}

export function encodeSnapshot(snap: DocSnapshot): string {
  const bytes = new TextEncoder().encode(JSON.stringify(snap));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeSnapshot(raw: string): DocSnapshot | null {
  try {
    const bin = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return validateSnapshot(parsed);
  } catch {
    return null;
  }
}

const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined;

function sanitisePatch(v: unknown): Partial<NodeState> | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const p: Partial<NodeState> = {};
  const x = num(o.x, -5000, 5000); if (x !== undefined) p.x = x;
  const y = num(o.y, -5000, 5000); if (y !== undefined) p.y = y;
  const r = num(o.r, -360, 360); if (r !== undefined) p.r = r;
  const w = num(o.w, 24, 2000); if (w !== undefined) p.w = w;
  const h = num(o.h, 24, 2000); if (h !== undefined) p.h = h;
  if (typeof o.text === 'string') p.text = o.text.slice(0, 2000);
  if (typeof o.fill === 'string' && /^#[0-9a-f]{3,8}$/i.test(o.fill)) p.fill = o.fill;
  if (typeof o.hidden === 'boolean') p.hidden = o.hidden;
  return Object.keys(p).length ? p : null;
}

function validateSnapshot(v: unknown): DocSnapshot | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.v !== 1 || typeof o.nodes !== 'object' || o.nodes === null) return null;
  const nodes: Record<string, Partial<NodeState>> = {};
  for (const [id, patch] of Object.entries(o.nodes as Record<string, unknown>)) {
    const p = sanitisePatch(patch);
    if (p) nodes[id] = p;
  }
  const addedIn = Array.isArray(o.added) ? o.added : [];
  const addedOut: AddedSticky[] = [];
  for (const a of addedIn.slice(0, 40)) {
    if (typeof a !== 'object' || a === null) continue;
    const ao = a as Record<string, unknown>;
    const x = num(ao.x, 0, 5000), y = num(ao.y, 0, 5000);
    if (typeof ao.id === 'string' && /^sticky-[a-z0-9]{1,12}$/.test(ao.id) && x !== undefined && y !== undefined) {
      addedOut.push({ id: ao.id, x, y });
    }
  }
  return { v: 1, nodes, added: addedOut };
}

function buildStickyEl(a: AddedSticky): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sticky hand';
  el.dataset.node = 'Sticky · yours';
  el.dataset.id = a.id;
  el.setAttribute('data-text', '');
  el.style.left = `${a.x}px`;
  el.style.top = `${a.y}px`;
  el.textContent = 'write something…';
  const canvasInner = document.getElementById('canvasInner');
  const overlay = document.getElementById('overlay');
  if (canvasInner) canvasInner.insertBefore(el, overlay);
  registerEl(el);
  return el;
}

export function createSticky(x: number, y: number): { id: string; el: HTMLElement } {
  const id = `sticky-${Math.random().toString(36).slice(2, 8)}`;
  const a: AddedSticky = { id, x, y };
  added.push(a);
  const el = buildStickyEl(a);
  notify(id);
  return { id, el };
}

export function removeSticky(id: string): AddedSticky | null {
  const i = added.findIndex(a => a.id === id);
  if (i === -1) return null;
  const [a] = added.splice(i, 1);
  registry.get(id)?.remove();
  registry.delete(id);
  states.delete(id);
  baseTexts.delete(id);
  baseRots.delete(id);
  notify(id);
  return a;
}

export function restoreSticky(a: AddedSticky, state?: Partial<NodeState>): HTMLElement {
  added.push({ ...a });
  const el = buildStickyEl(a);
  if (state) setState(a.id, state);
  else notify(a.id);
  return el;
}

function applySnapshot(snap: DocSnapshot): void {
  loading = true;
  snap.added.forEach(a => { if (!registry.has(a.id)) { added.push({ ...a }); buildStickyEl(a); } });
  for (const [id, patch] of Object.entries(snap.nodes)) {
    if (registry.has(id)) setState(id, patch);
  }
  loading = false;
}

export type LoadSource = 'remix' | 'local' | 'none';

export function loadInitial(): LoadSource {
  const m = location.hash.match(/^#s=(.+)$/);
  if (m) {
    const snap = decodeSnapshot(m[1]);
    if (snap) {
      applySnapshot(snap);
      remixSource = true;
      return 'remix';
    }
  }
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      const snap = validateSnapshot(JSON.parse(raw));
      if (snap) { applySnapshot(snap); return 'local'; }
    } catch { /* corrupt local copy: fall through to pristine */ }
  }
  return 'none';
}

function schedulePersist(): void {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    const snap = serialise();
    if (snap) localStorage.setItem(LS_KEY, JSON.stringify(snap));
    else localStorage.removeItem(LS_KEY);
  }, 400);
}

export function hardReset(): void {
  localStorage.removeItem(LS_KEY);
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
}
