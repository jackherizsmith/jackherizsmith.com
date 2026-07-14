import * as store from './store';
import * as hist from './history';
import * as editor from './editor';

function qs(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

let canvasInner: HTMLElement;
let canvas: HTMLElement;
let layersList: HTMLElement;
let artboard: HTMLElement;
let emptyState: HTMLElement;
let badge: HTMLElement;
let resetBtn: HTMLButtonElement;
let toastEl: HTMLElement;
let toastTimer: number | undefined;
let fillInput: HTMLInputElement;
let fillBefore: string | null | undefined;
let stickyCascade = 0;
let contentIds: string[] = [];
let layersQueued = false;

export function toast(msg: string, ms = 3200): void {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), ms);
}

function rgbToHex(c: string): string {
  const m = c.match(/\d+/g);
  if (!m || m.length < 3) return '#17191c';
  return '#' + m.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

function fillsBackground(el: HTMLElement): boolean {
  return !el.hasAttribute('data-text') || el.classList.contains('btn') || el.classList.contains('sticky');
}

function nodeDepth(el: HTMLElement): number {
  let d = 0;
  let p = el.parentElement;
  while (p && p !== canvasInner) {
    if (p.dataset.node !== undefined) d++;
    p = p.parentElement;
  }
  return d;
}

function buildLayers(): void {
  const scroll = layersList.parentElement?.scrollTop ?? 0;
  layersList.textContent = '';
  document.querySelectorAll<HTMLElement>('#canvasInner [data-node]').forEach(el => {
    const id = el.dataset.id;
    if (!id) return;
    const hidden = store.getState(id).hidden;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `layer d${Math.min(2, nodeDepth(el))}${hidden ? ' hidden-node' : ''}`;
    row.dataset.for = id;
    const icon = el.classList.contains('sticky') ? '◪'
      : id === 'artboard-v1' ? '#'
      : el.hasAttribute('data-text') ? 'T' : '▢';
    const iconEl = document.createElement('span');
    iconEl.className = 'icon';
    iconEl.textContent = icon;
    const nameEl = document.createElement('span');
    nameEl.className = 'lname';
    nameEl.textContent = el.dataset.node ?? id;
    const eye = document.createElement('span');
    eye.className = 'eye';
    eye.textContent = hidden ? '⊘' : '👁';
    eye.title = hidden ? 'Show' : 'Hide';
    eye.addEventListener('click', ev => {
      ev.stopPropagation();
      const next = !store.getState(id).hidden;
      store.setState(id, { hidden: next });
      hist.push({
        label: next ? 'Hide' : 'Show',
        undo: () => store.setState(id, { hidden: !next }),
        redo: () => store.setState(id, { hidden: next }),
      });
      if (next && editor.selectedEl() === el) editor.select(null);
    });
    row.append(iconEl, nameEl, eye);
    row.addEventListener('click', () => {
      if (store.getState(id).hidden) return;
      editor.select(el);
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    layersList.append(row);
  });
  markSelection(editor.selectedEl());
  if (layersList.parentElement) layersList.parentElement.scrollTop = scroll;
}

function queueLayers(): void {
  if (layersQueued) return;
  layersQueued = true;
  requestAnimationFrame(() => {
    layersQueued = false;
    buildLayers();
  });
}

function markSelection(el: HTMLElement | null): void {
  const id = el?.dataset.id;
  layersList.querySelectorAll<HTMLElement>('.layer').forEach(row => {
    row.classList.toggle('sel', row.dataset.for === id);
  });
}

export function markJackLayer(id: string | null): void {
  layersList.querySelectorAll<HTMLElement>('.layer').forEach(row => {
    row.classList.toggle('jacksel', row.dataset.for === id);
  });
}

function inspectorSelect(el: HTMLElement | null): void {
  fillBefore = undefined;
  const selName = qs('#selName');
  const youStatus = qs('#youStatus');
  if (!el) {
    selName.textContent = 'Nothing selected';
    youStatus.textContent = 'have the good cursor';
    for (const f of ['#fX', '#fY', '#fW', '#fH', '#fR']) qs(f).textContent = '—';
    qs('#tFont').textContent = '—';
    qs('#tSize').textContent = '—';
    fillInput.disabled = true;
    return;
  }
  selName.textContent = el.dataset.node ?? '';
  youStatus.textContent = `inspecting ${el.dataset.node ?? 'something'}`;
  const cs = getComputedStyle(el);
  qs('#tFont').textContent = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  qs('#tSize').textContent = `${Math.round(parseFloat(cs.fontSize))}px`;
  fillInput.disabled = false;
  fillInput.value = rgbToHex(fillsBackground(el) ? cs.backgroundColor : cs.color);
}

function inspectorLive(v: { x: number; y: number; w: number; h: number; r: number } | null): void {
  if (!v) return;
  const art = editor.visualRect(artboard);
  qs('#fX').textContent = String(Math.round(v.x - art.x));
  qs('#fY').textContent = String(Math.round(v.y - art.y));
  qs('#fW').textContent = String(Math.round(v.w));
  qs('#fH').textContent = String(Math.round(v.h));
  qs('#fR').textContent = `${Math.round(v.r * 10) / 10}°`;
}

function refreshBadge(): void {
  const n = store.editCount();
  const editCountEl = qs('#editCount');
  if (n > 0) {
    badge.textContent = 'your copy';
    badge.classList.add('edited');
    resetBtn.hidden = false;
    editCountEl.textContent = `${n} change${n === 1 ? '' : 's'}`;
  } else {
    badge.textContent = 'v2 · live';
    badge.classList.remove('edited');
    resetBtn.hidden = true;
    editCountEl.textContent = 'none yet';
  }
}

function checkEmpty(): void {
  const allGone = contentIds.length > 0 && contentIds.every(id => store.getState(id).hidden);
  emptyState.hidden = !allGone;
  artboard.classList.toggle('all-gone', allGone);
}

function wireToolbar(): void {
  const undoBtn = qs('#toolUndo') as HTMLButtonElement;
  const redoBtn = qs('#toolRedo') as HTMLButtonElement;
  undoBtn.addEventListener('click', () => hist.undo());
  redoBtn.addEventListener('click', () => hist.redo());
  hist.onChange(() => {
    undoBtn.disabled = !hist.canUndo();
    redoBtn.disabled = !hist.canRedo();
  });

  qs('#toolSticky').addEventListener('click', () => {
    const x = canvas.scrollLeft + 120 + (stickyCascade % 6) * 26;
    const y = canvas.scrollTop + 170 + (stickyCascade % 6) * 26;
    stickyCascade++;
    const { id, el } = store.createSticky(x, y);
    editor.select(el);
    editor.beginTextEdit(el);
    let savedState: Partial<store.NodeState> | undefined;
    hist.push({
      label: 'New sticky',
      undo: () => {
        savedState = store.getState(id);
        if (editor.selectedEl()?.dataset.id === id) editor.select(null);
        store.removeSticky(id);
      },
      redo: () => { store.restoreSticky({ id, x, y }, savedState); },
    });
  });

  resetBtn.addEventListener('click', () => {
    if (window.confirm("Reset to Jack's original? Everything you've changed here will be gone.")) {
      store.hardReset();
    }
  });

  qs('#publishBtn').addEventListener('click', () => {
    if (editor.selectedEl()) editor.commitTextEdit();
    const snap = store.serialise();
    if (!snap) {
      toast('Nothing changed yet. Go on, move something first.');
      return;
    }
    const url = `${location.origin}${location.pathname}#s=${store.encodeSnapshot(snap)}`;
    navigator.clipboard.writeText(url).then(
      () => toast('Remix link copied. Send someone your version of this site.'),
      () => { window.prompt('Copy your remix link:', url); },
    );
  });

  qs('#undoAllBtn').addEventListener('click', () => {
    if (hist.canUndo()) hist.undoAll();
    else contentIds.forEach(id => store.setState(id, { hidden: false }));
    toast('Career restored. Phew.');
  });
}

export function bootToast(source: store.LoadSource): void {
  if (source === 'remix') {
    toast("You're viewing someone's remix of this site. Edit anything to make it yours. Reset brings back the original.", 5200);
  }
}

export function initChrome(): void {
  canvasInner = qs('#canvasInner');
  canvas = qs('#canvas');
  layersList = qs('#layersList');
  artboard = qs('#artboard');
  emptyState = qs('#emptyState');
  badge = qs('#docBadge');
  resetBtn = qs('#resetBtn') as HTMLButtonElement;
  toastEl = qs('#toast');
  fillInput = qs('#fillInput') as HTMLInputElement;

  contentIds = [...artboard.querySelectorAll<HTMLElement>('[data-node]')]
    .filter(el => el.parentElement?.closest('[data-node]') === null)
    .map(el => el.dataset.id ?? '')
    .filter(Boolean);

  fillInput.addEventListener('input', () => {
    const el = editor.selectedEl();
    if (!el) return;
    const id = el.dataset.id ?? '';
    if (fillBefore === undefined) fillBefore = store.getState(id).fill;
    store.setState(id, { fill: fillInput.value });
  });
  fillInput.addEventListener('change', () => {
    const el = editor.selectedEl();
    if (!el) return;
    const id = el.dataset.id ?? '';
    const before = fillBefore;
    fillBefore = undefined;
    const after = fillInput.value;
    if (before === after) return;
    hist.push({
      label: 'Colour',
      undo: () => store.setState(id, { fill: before ?? null }),
      redo: () => store.setState(id, { fill: after }),
    });
  });

  wireToolbar();
  buildLayers();
  refreshBadge();
  checkEmpty();
  inspectorSelect(null);

  editor.onSelect(el => {
    markSelection(el);
    inspectorSelect(el);
  });
  editor.onLive(v => inspectorLive(v));
  store.onChange(() => {
    queueLayers();
    refreshBadge();
    checkEmpty();
  });
  store.onFork(() => toast('This is your copy now, saved in your browser. Reset any time.'));
}
