import * as store from './store';
import * as editor from './editor';
import { markJackLayer, toast } from './chrome';

interface PlanStep {
  id: string;
  status: string;
  bubble: string | null;
  flash: boolean;
  tidy?: boolean;
  edit?: boolean;
}
interface Action extends PlanStep { el: HTMLElement }

const PLAN: PlanStep[] = [
  { id: 'heading', status: 'admiring the serif', bubble: null, flash: true },
  { id: 'kicker', status: 'tweaking the tagline', bubble: null, flash: true, edit: true },
  { id: 'sticky-cv', status: 'avoiding the CV', bubble: 'I know, I know.', flash: true, edit: true },
  { id: 'work-notes', status: 'polishing Notes', bubble: null, flash: true },
  { id: 'intro', status: 'rewording the intro', bubble: 'nearly there…', flash: true, edit: true },
  { id: 'work-data', status: 'testing the Data demo', bubble: 'ship it soon', flash: true },
  { id: 'sticky-idea', status: 'fiddling with a sticky', bubble: null, flash: true, edit: true },
  { id: 'artboard-v1', status: 'visiting 2019', bubble: 'we don’t talk about v1', flash: true },
  { id: 'signoff', status: 'redrafting the sign-off', bubble: null, flash: true, edit: true },
  { id: 'btn-contact', status: 'hovering over the button', bubble: null, flash: true },
  { id: 'arrow-label', status: 'leaving you a note', bubble: null, flash: true, edit: true },
  { id: 'availability', status: 'refining what he’s after', bubble: null, flash: true, edit: true },
  { id: 'sticky-humility', status: 'straightening a sticky', bubble: 'straighter ✓', flash: true, tidy: true },
];

// A pool of on-brand rewrites per line. Jack picks one he isn't already
// showing, so across a visit the copy keeps shifting without obvious repeats.
// Applied straight to the DOM (never the store): pure theatre, no persistence.
const EDITS: Record<string, string[]> = {
  kicker: [
    'Product engineer · end to end',
    'Full-stack, in the honest sense',
    'Builds the whole thing',
    'Product engineer · schema to shadows',
    'Ships the whole stack',
  ],
  intro: [
    'I build products end to end: the schema, the service, the interface, and increasingly the AI in between. At Sourcerie I lead product engineering for a customer insights platform, and build the internal AI tools that keep a small team fast. This site is an editor: select things, move them about, make it yours.',
    'I build products end to end: schema, service, interface, and increasingly the AI in between. At Sourcerie I lead product engineering on a customer insights platform, and I build the internal AI tools that keep a small team quick. This site is also an editor, so select things, move them about, make it yours.',
    'From the database to the details, I build the whole product. At Sourcerie I lead product engineering for a customer insights platform and build the internal AI tools that keep a small team moving fast. This page is a live editor, by the way: grab anything, move it, make it yours.',
  ],
  signoff: [
    'Let’s build something good.',
    'Let’s make something people enjoy.',
    'Let’s build something worth keeping.',
    'Got a problem worth solving?',
    'Say hello. I don’t bite.',
  ],
  'sticky-cv': [
    'TODO: update CV\n(it still says 2020 lol) ✏️',
    'note to self:\nthe CV can wait,\nthe site says more anyway',
    'who reads CVs\nin 2026 anyway?',
    'CV: pending.\nvibes: immaculate.',
  ],
  'sticky-idea': [
    'idea: the site IS the editor ✓\n\nselect · drag · rotate ·\nbreak it · publish it',
    'idea: the site IS the editor ✓\n\nyes, really. try it.',
    'the gimmick:\nyou’re in my design\nfile right now',
    'note: keep the second\ncursor. people like Jack.',
  ],
  'arrow-label': [
    'start here!!',
    'psst, click things',
    'drag me somewhere',
    'yes, you can edit this',
  ],
  availability: [
    'Senior and lead product engineering roles, fractional or interim product leadership, and the occasional freelance build. The fastest routes are a comment on this file (the ＋ pin) or LinkedIn.',
    'Open to senior and lead product engineering roles, fractional or interim product leadership, and the odd freelance build. Fastest ways to reach me: a comment on this file, or LinkedIn.',
    'Lead and senior product engineering, fractional or interim product leadership, and select freelance builds. Leave a comment on this file (the ＋ pin), or find me on LinkedIn.',
  ],
};

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
let canvasEl: HTMLElement;
let followBtn: HTMLElement;
let following = false;

function setFollow(on: boolean): void {
  following = on;
  followBtn.classList.toggle('following', on);
  toast(on ? 'Following Jack. Scroll or press Esc to stop.' : 'Stopped following Jack.');
}

let jx = 900, jy = 640, tx = 900, ty = 640;
let action: Action | null = null;
let dwellUntil = 0;
let planIdx = 0;
let tidied = false;
let reactIdx = 0;
let lastReact = 0;
let remixQuip = false;
let jackEditing = false;
const shownText = new Map<string, string>();
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

function frameOn(el: HTMLElement): void {
  const r = editor.visualRect(el);
  flashBox.style.left = `${r.x}px`;
  flashBox.style.top = `${r.y}px`;
  flashBox.style.width = `${r.w}px`;
  flashBox.style.height = `${r.h}px`;
  flashBox.classList.add('on');
}

function pickVariant(id: string): string | null {
  const variants = EDITS[id];
  if (!variants || !variants.length) return null;
  const current = shownText.get(id) ?? store.getEl(id)?.innerText ?? '';
  const pool = variants.filter(v => v !== current);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

// Type a fresh variant, caret and all, at a human-ish pace. Sometimes he types
// a few words of a different variant first, then backspaces and fixes them.
// Applied straight to the DOM, never the store; bails if the user grabs the node.
function doEdit(el: HTMLElement): void {
  const id = el.dataset.id ?? '';
  const final = pickVariant(id);
  if (!final || editor.selectedEl() === el) {
    dwellUntil = performance.now() + 1400;
    return;
  }
  jackEditing = true;
  frameOn(el);
  markJackLayer(id);

  // Optional self-correction: a false start that shares a prefix with the
  // final line, so he can visibly go back and change the wording.
  const targets: string[] = [];
  if (Math.random() < 0.5) {
    const alts = (EDITS[id] ?? [])
      .filter(v => v !== final)
      .map(v => ({ v, c: commonPrefix(v, final) }))
      .filter(o => o.c >= 8 && o.c < final.length - 2);
    if (alts.length) {
      const pick = alts[Math.floor(Math.random() * alts.length)];
      let cut = Math.min(pick.v.length, pick.c + 6 + Math.floor(Math.random() * 12));
      while (cut < pick.v.length && pick.v[cut] !== ' ') cut++;
      targets.push(pick.v.slice(0, cut));
    }
  }
  targets.push(final);

  let cur = '';
  let ti = 0;

  const finish = (): void => {
    el.textContent = final;
    shownText.set(id, final);
    flashBox.classList.remove('on');
    markJackLayer(null);
    jackEditing = false;
    dwellUntil = performance.now() + 2800 + Math.random() * 3000;
  };

  const step = (): void => {
    if (editor.selectedEl() === el && editor.isBusy()) { finish(); return; }
    const tgt = targets[ti];
    const common = commonPrefix(cur, tgt);
    let delay: number;
    if (cur.length > common) {
      cur = cur.slice(0, -1);                                  // backspace
      delay = 32 + Math.random() * 22;
    } else if (cur.length < tgt.length) {
      cur = tgt.slice(0, cur.length + 1);                      // type forward
      const per = Math.max(28, Math.min(62, Math.round(2600 / tgt.length)));
      delay = per + Math.random() * 45;                        // human jitter
    } else {
      ti++;
      if (ti >= targets.length) { finish(); return; }
      el.textContent = cur + '▍';
      frameOn(el);
      window.setTimeout(step, 520 + Math.random() * 320);      // "hmm, no" beat
      return;
    }
    el.textContent = cur + '▍';
    frameOn(el);
    window.setTimeout(step, delay);
  };

  window.setTimeout(step, 380);
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
  if (a.edit) {
    if (a.bubble) say(a.bubble);
    doEdit(a.el);
    return;
  }
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
  if (editor.isBusy() || jackEditing) return;
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
  if (following) {
    canvasEl.scrollLeft = jx - canvasEl.clientWidth / 2;
    canvasEl.scrollTop = jy - canvasEl.clientHeight / 2;
  }
}

export function initJack(): void {
  cursor = qs('#jackCursor');
  bubble = qs('#jackBubble');
  flashBox = qs('#jackSel');
  statusEl = qs('#jackStatus');
  canvasEl = qs('#canvas');
  followBtn = qs('#followJack');
  cursor.style.transform = `translate(${jx}px, ${jy}px)`;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setStatus('here, quietly');
    return;
  }

  followBtn.addEventListener('click', () => setFollow(!following));
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && following) setFollow(false);
  });
  canvasEl.addEventListener('wheel', () => {
    if (following) setFollow(false);
  }, { passive: true });

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
