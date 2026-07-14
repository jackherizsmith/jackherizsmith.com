import * as store from './store';
import * as editor from './editor';
import { markJackLayer } from './chrome';

interface PlanStep {
  id: string;
  status: string;
  bubble: string | null;
  flash: boolean;
  tidy?: boolean;
}
interface Action extends PlanStep { el: HTMLElement }

const PLAN: PlanStep[] = [
  { id: 'heading', status: 'admiring the serif', bubble: null, flash: true },
  { id: 'sticky-cv', status: 'avoiding the CV', bubble: 'I know, I know.', flash: true },
  { id: 'work-notes', status: 'polishing Notes', bubble: null, flash: true },
  { id: 'work-data', status: 'testing the Data demo', bubble: 'ship it soon', flash: true },
  { id: 'sticky-idea', status: 'quite pleased with this', bubble: 'still a good idea', flash: true },
  { id: 'artboard-v1', status: 'visiting 2019', bubble: 'we don’t talk about v1', flash: true },
  { id: 'btn-contact', status: 'hovering over the button', bubble: null, flash: true },
  { id: 'intro', status: 'rewording the intro', bubble: '“actually enjoy using”… keep', flash: true },
  { id: 'sticky-humility', status: 'straightening a sticky', bubble: 'straighter ✓', flash: true, tidy: true },
];

const REACTIONS = [
  'ooh, good choice',
  'careful, that took ages',
  'go on, drag it somewhere',
  'inspector’s on the right →',
  'the stickies move too, you know',
];

let cursor: HTMLElement;
let bubble: HTMLElement;
let flashBox: HTMLElement;
let statusEl: HTMLElement;

let jx = 900, jy = 640, tx = 900, ty = 640;
let action: Action | null = null;
let dwellUntil = 0;
let planIdx = 0;
let tidied = false;
let reactIdx = 0;
let lastReact = 0;
let remixQuip = false;
const queue: Action[] = [];

function qs(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

function say(text: string, ms = 2600): void {
  bubble.textContent = text;
  bubble.classList.add('on');
  window.setTimeout(() => bubble.classList.remove('on'), ms);
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function flash(el: HTMLElement): void {
  const r = editor.visualRect(el);
  flashBox.style.left = `${r.x}px`;
  flashBox.style.top = `${r.y}px`;
  flashBox.style.width = `${r.w}px`;
  flashBox.style.height = `${r.h}px`;
  flashBox.classList.add('on');
  markJackLayer(el.dataset.id ?? null);
  window.setTimeout(() => {
    flashBox.classList.remove('on');
    markJackLayer(null);
  }, 2400);
}

function targetNear(el: HTMLElement): void {
  const r = editor.visualRect(el);
  tx = r.x + r.w * (0.3 + Math.random() * 0.5);
  ty = r.y + r.h * (0.3 + Math.random() * 0.5);
}

function isUsable(el: HTMLElement | undefined): el is HTMLElement {
  if (!el) return false;
  const id = el.dataset.id ?? '';
  return !store.getState(id).hidden && el.offsetWidth > 0;
}

function nextAction(): void {
  const queued = queue.shift();
  if (queued) {
    if (!isUsable(queued.el)) return;
    action = queued;
  } else {
    const step = PLAN[planIdx % PLAN.length];
    planIdx++;
    const el = store.getEl(step.id);
    if (!isUsable(el)) return;
    if (step.tidy && tidied) return;
    action = { ...step, el };
  }
  targetNear(action.el);
  setStatus(action.status);
}

function arrive(): void {
  const a = action;
  action = null;
  if (!a) return;
  if (a.flash && a.el !== editor.selectedEl()) flash(a.el);
  if (a.bubble) say(a.bubble);
  if (a.tidy && !tidied) {
    tidied = true;
    const id = a.el.dataset.id ?? '';
    const s = store.getState(id);
    const d = store.defaultStateOf(id);
    if (s.x === d.x && s.y === d.y && s.r === d.r) {
      a.el.style.transition = 'transform .8s ease';
      a.el.style.transform = 'translate(0px, 0px) rotate(0.5deg)';
      window.setTimeout(() => { a.el.style.transition = ''; }, 900);
    }
  }
  dwellUntil = performance.now() + 2200 + Math.random() * 2800;
}

function userSelected(el: HTMLElement | null): void {
  if (!el) return;
  const now = performance.now();
  if (now - lastReact < 9000 || reactIdx >= REACTIONS.length) return;
  lastReact = now;
  queue.push({
    id: el.dataset.id ?? '',
    el,
    status: 'coming to look',
    bubble: REACTIONS[reactIdx++],
    flash: false,
  });
}

function tick(now: number): void {
  requestAnimationFrame(tick);
  if (editor.isBusy()) return;
  if (!action) {
    if (now < dwellUntil) return;
    nextAction();
    return;
  }
  const dx = tx - jx, dy = ty - jy;
  const dist = Math.hypot(dx, dy);
  if (dist < 3) {
    arrive();
    return;
  }
  const step = Math.min(dist, 1.6 + dist * 0.028);
  jx += (dx / dist) * step;
  jy += (dy / dist) * step;
  cursor.style.transform = `translate(${jx}px, ${jy}px)`;
}

export function initJack(): void {
  cursor = qs('#jackCursor');
  bubble = qs('#jackBubble');
  flashBox = qs('#jackSel');
  statusEl = qs('#jackStatus');
  cursor.style.transform = `translate(${jx}px, ${jy}px)`;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setStatus('here, quietly');
    return;
  }

  editor.onSelect(userSelected);

  let edits = 0;
  store.onChange(() => {
    edits++;
    if (edits === 3 && !remixQuip) {
      remixQuip = true;
      const el = editor.selectedEl() ?? store.getEl('heading');
      if (el) queue.push({ id: '', el, status: 'assessing the damage', bubble: 'redecorating? bold.', flash: false });
    }
  });

  requestAnimationFrame(tick);
  window.setTimeout(() => say('hi, don’t mind me'), 1800);
}
