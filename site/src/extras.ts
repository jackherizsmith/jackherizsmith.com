import { toast } from './chrome';

function qs(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

/* ── Present overlay ─────────────────────── */

const DEMO_NAMES: Record<string, string> = {
  data: 'Data', notes: 'Notes', pulse: 'Pulse', roe: 'Read Only Everything',
};

function initPresent(): void {
  const overlay = qs('#present');
  const frame = qs('#presentFrame') as HTMLIFrameElement;
  const title = qs('#presentTitle');
  const openTab = qs('#presentOpen') as HTMLAnchorElement;

  const close = (): void => {
    overlay.classList.remove('on');
    frame.src = 'about:blank';
  };

  const open = (demo: string, href: string): void => {
    frame.src = href;
    title.textContent = `▶ Presenting · ${DEMO_NAMES[demo] ?? demo}`;
    openTab.href = href;
    overlay.classList.add('on');
    (qs('#presentClose') as HTMLButtonElement).focus();
  };

  document.querySelectorAll<HTMLAnchorElement>('a.play[data-demo]').forEach(a => {
    a.addEventListener('pointerdown', e => e.stopPropagation());
    a.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      open(a.dataset.demo ?? '', a.getAttribute('href') ?? 'about:blank');
    });
  });

  qs('#presentClose').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('on')) {
      e.stopPropagation();
      close();
    }
  }, true);
}

/* ── Browser windows (client sites) ──────── */

// Render each client site at a fixed desktop width, then scale it to fit the
// window. Computing the scale from the live container size (not CSS %) is what
// keeps it filling the frame after the window is resized on the canvas.
const DESKTOP_W = 1200;

function fitFrame(body: HTMLElement, iframe: HTMLIFrameElement): void {
  const w = body.clientWidth;
  const h = body.clientHeight;
  if (!w || !h) return;
  const scale = w / DESKTOP_W;
  iframe.style.width = `${DESKTOP_W}px`;
  iframe.style.height = `${Math.ceil(h / scale)}px`;
  iframe.style.transform = `scale(${scale})`;
}

function initWindows(): void {
  document.querySelectorAll<HTMLElement>('.bwin-body[data-site]').forEach(body => {
    const btn = body.querySelector<HTMLButtonElement>('.win-load');
    if (!btn) return;
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const iframe = document.createElement('iframe');
      iframe.src = body.dataset.site ?? '';
      iframe.loading = 'lazy';
      iframe.title = body.dataset.site ?? 'client site';
      body.textContent = '';
      body.classList.add('loaded');
      body.append(iframe);
      fitFrame(body, iframe);
      new ResizeObserver(() => fitFrame(body, iframe)).observe(body);
    });
  });
}

/* ── Comment pins ────────────────────────── */

interface Pin { x: number; y: number; quote: string }

const PINS: Pin[] = [
  { x: 372, y: 138, quote: 'Jack has been a pleasure to work with. Our task was quite a difficult one as we were building an MVP whilst user research was still ongoing but Jack acted with patience and professionalism throughout.' },
  { x: 1118, y: 320, quote: 'Jack made the process of designing and creating my website smooth and stress-free. He listened carefully to my brief and has created a site which not only looks brilliant, but works seamlessly too.' },
  { x: 372, y: 700, quote: 'Full of ideas, enthusiasm and positive spirit… which makes working with him super fun and rewarding. In our project team he was open to building on everyone’s ideas together.' },
  { x: 1118, y: 860, quote: 'One thing for sure is that you’ll learn something new by working with him. Jack is an absolute joy to work with. One of his greatest strengths is his resourcefulness and he will always challenge the status quo to find new ways to solve a problem.' },
  { x: 750, y: 1150, quote: 'Oh my goodness Jack! This is beyond beautiful! I absolutely love your style guide… The team couldn’t have asked for a better UX lead, nice one!' },
];

let openPop: HTMLElement | null = null;

function closePop(): void {
  openPop?.remove();
  openPop = null;
}

function popover(x: number, y: number, html: string): HTMLElement {
  closePop();
  const pop = document.createElement('div');
  pop.className = 'comment-pop';
  pop.innerHTML = html;
  pop.style.left = `${Math.min(x + 26, 1290)}px`;
  pop.style.top = `${Math.max(y - 10, 60)}px`;
  pop.addEventListener('pointerdown', e => e.stopPropagation());
  pop.addEventListener('click', e => e.stopPropagation());
  qs('#canvasInner').append(pop);
  openPop = pop;
  pop.querySelector('.pop-close')?.addEventListener('click', closePop);
  return pop;
}

function initPins(): void {
  const canvasInner = qs('#canvasInner');

  PINS.forEach((p, i) => {
    const pin = document.createElement('button');
    pin.className = 'pin';
    pin.type = 'button';
    pin.textContent = String(i + 1);
    pin.title = 'Comment';
    pin.style.left = `${p.x}px`;
    pin.style.top = `${p.y}px`;
    pin.addEventListener('pointerdown', e => e.stopPropagation());
    pin.addEventListener('click', e => {
      e.stopPropagation();
      popover(p.x, p.y, `
        <div class="pop-head"><b>Comment · ${i + 1} of ${PINS.length}</b><button class="pop-close" type="button">✕</button></div>
        <p class="pop-quote">${p.quote}</p>
        <p class="pop-meta">Carried over from the v1 guestbook</p>`);
    });
    canvasInner.append(pin);
  });

  const composer = document.createElement('button');
  composer.className = 'pin new';
  composer.type = 'button';
  composer.textContent = '＋';
  composer.title = 'Leave a comment';
  composer.style.left = '1118px';
  composer.style.top = '1080px';
  composer.addEventListener('pointerdown', e => e.stopPropagation());
  composer.addEventListener('click', e => {
    e.stopPropagation();
    openComposer(1118, 1080);
  });
  canvasInner.append(composer);

  canvasInner.addEventListener('pointerdown', closePop);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
}

function openComposer(x: number, y: number): void {
  const pop = popover(x, y, `
    <div class="pop-head"><b>New comment</b><button class="pop-close" type="button">✕</button></div>
    <textarea class="pop-text" rows="4" placeholder="Say hello, pitch a project, report a bug in this very editor…"></textarea>
    <input class="pop-name" placeholder="Your name or email (optional)">
    <input class="pop-web" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="pop-foot"><span>Lands in Jack’s inbox, not on the page.</span><button class="pop-send" type="button">Send to Jack</button></div>`);

  const send = pop.querySelector<HTMLButtonElement>('.pop-send');
  send?.addEventListener('click', async () => {
    const message = pop.querySelector<HTMLTextAreaElement>('.pop-text')?.value.trim() ?? '';
    const name = pop.querySelector<HTMLInputElement>('.pop-name')?.value.trim() ?? '';
    const website = pop.querySelector<HTMLInputElement>('.pop-web')?.value ?? '';
    if (!message) { toast('An empty comment. Minimalist, but say something.'); return; }
    send.disabled = true;
    send.textContent = 'Sending…';
    try {
      const res = await fetch('/api/comment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, name, website }),
      });
      if (!res.ok) throw new Error(String(res.status));
      closePop();
      toast('Comment sent. Jack actually reads these.');
    } catch {
      send.disabled = false;
      send.textContent = 'Send to Jack';
      toast('That didn’t send. LinkedIn or GitHub works too.');
    }
  });
}

export function openContactComposer(): void {
  openComposer(1118, 1080);
}

/* ── Version history ─────────────────────── */

interface Version { v: string; when: string; title: string; org: string; note: string; current?: boolean }

const CAREER: Version[] = [
  { v: 'v2.0', when: 'Sep 2025 · now', title: 'Interim CPO & Tech Lead', org: 'Sourcerie · Lisbon', note: 'Product roadmap, internal AI tooling, and the migration to an AI-first service.', current: true },
  { v: 'v1.5', when: 'May 2022', title: 'Lead Product Engineer', org: 'Sourcerie · London', note: 'Two B2B SaaS products. Postgres with Kysely, React with Next, GCP, Docker, Terraform.' },
  { v: 'v1.1', when: 'Feb 2021', title: 'Frontend Developer', org: 'AllBright', note: 'Built the members area and messaging platform. Next.js and React Native. Managed two apprentices.' },
  { v: 'v1.0', when: 'Oct 2020', title: 'Full-stack Developer', org: 'workerbird · contract', note: 'Career-mapping tool for jobs at risk of automation. GraphQL, Postgres, React, d3.' },
  { v: 'v0.9', when: 'Jul 2020', title: 'Course Facilitator', org: 'Founders and Coders', note: 'Mentored the 20th cohort and wrote the facilitator handbook.' },
  { v: 'v0.8', when: 'May 2020', title: 'Developer', org: 'Criminal Appeals Fund · contract', note: 'Led design and build. React with serverless functions. First shipped client work.' },
  { v: 'v0.5', when: 'Mar 2020', title: 'Breaking change: career pivot', org: 'Founders and Coders', note: 'London’s most selective full-stack bootcamp. Learned testing, then learned testing.' },
  { v: 'v0.2', when: '2015 · 2020', title: 'Partnerships', org: 'Shelter · Great Ormond Street Hospital Charity', note: 'Corporate partnerships and campaigns for two of the UK’s best-known charities.' },
  { v: 'v0.1', when: '2013', title: 'Researcher, then Search Consultant', org: 'Manners Maclean', note: 'Executive search across Sub-Saharan Africa. First job spent living in spreadsheets.' },
];

function initHistory(): void {
  const inspectorView = qs('#inspectorView');
  const historyView = qs('#historyView');
  const btn = qs('#toolHistory');

  historyView.innerHTML = `
    <h3>Version history <span>${CAREER.length} versions · unminified</span></h3>
    ${CAREER.map(c => `
      <div class="ver${c.current ? ' current' : ''}">
        <div class="ver-dot"></div>
        <div class="ver-body">
          <div class="ver-head"><b>${c.v}</b><span>${c.when}</span></div>
          <div class="ver-title">${c.title}</div>
          <div class="ver-org">${c.org}</div>
          <p class="ver-note">${c.note}</p>
        </div>
      </div>`).join('')}
    <p class="ver-foot">Restore points unavailable: this file only moves forward.</p>`;

  const testsView = document.getElementById('testsView');
  const testsBtn = document.getElementById('toolTests');
  btn.addEventListener('click', () => {
    const showing = !historyView.hidden;
    historyView.hidden = showing;
    inspectorView.hidden = !showing;
    btn.classList.toggle('on', !showing);
    if (!showing && testsView) { testsView.hidden = true; testsBtn?.classList.remove('on'); }
  });
}

export function initExtras(): void {
  initPresent();
  initWindows();
  initPins();
  initHistory();
  qs('#toolComment').addEventListener('click', () => openContactComposer());
}
