import * as store from './store';
import * as editor from './editor';
import * as hist from './history';

interface Test {
  name: string;
  run: () => void | Promise<void>;
}

function qs(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

const ok = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const delay = (ms: number): Promise<void> => new Promise(res => window.setTimeout(res, ms));

const TESTS: Test[] = [
  {
    name: 'the document exposes a heading to edit',
    run: () => ok(!!store.getEl('heading'), 'no node with id "heading" found'),
  },
  {
    name: 'clicking an element selects it, with handles',
    run: () => {
      const h = store.getEl('heading');
      ok(!!h, 'heading missing');
      editor.select(h!);
      ok(editor.selectedEl() === h, 'selection did not register');
      ok(qs('#selBox').classList.contains('on'), 'selection box did not appear');
      editor.select(null);
    },
  },
  {
    name: 'the inspector names whatever is selected',
    run: () => {
      const card = store.getEl('work-sourcerie');
      ok(!!card, 'Sourcerie card missing');
      editor.select(card!);
      ok(/Sourcerie/.test(qs('#selName').textContent ?? ''), 'inspector did not update to the selection');
      editor.select(null);
    },
  },
  {
    name: 'the layers panel lists every node on the canvas',
    run: () => {
      const nodes = document.querySelectorAll('#canvasInner [data-node]').length;
      const rows = document.querySelectorAll('#layersList .layer').length;
      ok(nodes > 0 && rows === nodes, `layers (${rows}) do not match canvas nodes (${nodes})`);
    },
  },
  {
    name: 'every project links out or opens a demo',
    run: () => {
      const items = [...document.querySelectorAll<HTMLElement>('.work .item')];
      ok(items.length > 0, 'no project cards found');
      const orphan = items.find(it => {
        const isLink = it.tagName === 'A' && (it as HTMLAnchorElement).href;
        const hasDemo = it.querySelector('a.play[data-demo], a[href]');
        return !isLink && !hasDemo;
      });
      ok(!orphan, `a project card goes nowhere: ${orphan?.dataset.node ?? ''}`);
    },
  },
  {
    name: 'text blocks are editable in place',
    run: () => {
      const texts = [...document.querySelectorAll<HTMLElement>('[data-text]')];
      ok(texts.length >= 10, `expected many editable blocks, found ${texts.length}`);
      ok(texts.every(t => !!t.dataset.id), 'an editable block has no stable id to persist against');
    },
  },
  {
    name: 'Publish encodes a shareable remix link',
    run: () => {
      const link = store.encodeSnapshot({ v: 1, nodes: { heading: { x: 12 } }, added: [] });
      ok(typeof link === 'string' && link.length > 0, 'no link produced');
      ok(!/[+/=]/.test(link), 'link is not URL-safe base64');
    },
  },
  {
    name: 'undo and redo are wired up',
    run: () => {
      ok(typeof hist.undo === 'function' && typeof hist.redo === 'function', 'history API missing');
      ok(!!document.querySelector('#toolUndo'), 'undo control missing from toolbar');
    },
  },
  {
    name: 'deleting the whole page is reversible',
    run: () => {
      ok(!!document.querySelector('#emptyState'), 'the "deleted everything" state is missing');
      ok(!!document.querySelector('#undoAllBtn'), 'the undo-everything escape hatch is missing');
    },
  },
  {
    name: 'there is a phone-friendly reading mode',
    run: () => ok(!!document.querySelector('.mobile-note'), 'no mobile read-mode fallback present'),
  },
  {
    name: 'Jack is on the canvas',
    run: () => ok(!!document.querySelector('#jackCursor'), 'the collaborator cursor is missing'),
  },
  {
    name: 'the contact endpoint is alive (live network call)',
    run: async () => {
      let res: Response;
      try {
        res = await fetch('/api/comment', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
      } catch {
        throw new Error('could not reach /api/comment (offline, or running the dev server without Functions)');
      }
      ok(res.status === 400, `expected the empty payload to be rejected with 400, got ${res.status}`);
    },
  },
];

let hasRun = false;

function rowMarkup(): string {
  return `
    <h3>Tests <span id="testSummary">${TESTS.length} to run</span></h3>
    <p class="test-note">Real assertions, run live against this page in your browser right now. No CI, no green badge to take on faith. This is the Cypress suite, except you can watch it.</p>
    <div id="testRows">${TESTS.map((t, i) => `
      <div class="test-row pending" data-i="${i}">
        <span class="test-dot"></span>
        <span class="test-name">${t.name}</span>
        <span class="test-msg"></span>
      </div>`).join('')}</div>
    <button class="chrome-btn" id="rerunBtn" style="margin:12px">Run again</button>`;
}

async function runAll(view: HTMLElement): Promise<void> {
  if (!hasRun) hasRun = true;
  const rows = [...view.querySelectorAll<HTMLElement>('.test-row')];
  const summary = qs('#testSummary');
  const rerun = view.querySelector<HTMLButtonElement>('#rerunBtn');
  if (rerun) rerun.disabled = true;
  let pass = 0, fail = 0;
  rows.forEach(r => { r.className = 'test-row pending'; r.querySelector('.test-msg')!.textContent = ''; });
  for (let i = 0; i < TESTS.length; i++) {
    const row = rows[i];
    row.classList.remove('pending');
    row.classList.add('running');
    await delay(200);
    try {
      await TESTS[i].run();
      row.className = 'test-row pass';
      pass++;
    } catch (e) {
      row.className = 'test-row fail';
      row.querySelector('.test-msg')!.textContent = e instanceof Error ? e.message : String(e);
      fail++;
    }
    summary.textContent = `${pass} passing${fail ? `, ${fail} failing` : ''}`;
    summary.className = fail ? 'has-fail' : 'all-pass';
  }
  if (rerun) rerun.disabled = false;
}

export function initTests(): void {
  const btn = qs('#toolTests');
  const view = qs('#testsView');
  const inspector = qs('#inspectorView');
  const history = document.getElementById('historyView');
  const historyBtn = document.getElementById('toolHistory');

  btn.addEventListener('click', () => {
    const showing = !view.hidden;
    if (showing) {
      view.hidden = true;
      inspector.hidden = false;
      btn.classList.remove('on');
      return;
    }
    if (history) history.hidden = true;
    historyBtn?.classList.remove('on');
    inspector.hidden = true;
    view.hidden = false;
    btn.classList.add('on');
    if (!view.dataset.built) {
      view.innerHTML = rowMarkup();
      view.dataset.built = '1';
      view.querySelector('#rerunBtn')?.addEventListener('click', () => runAll(view));
    }
    void runAll(view);
  });
}
