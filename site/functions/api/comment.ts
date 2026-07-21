interface KVNamespaceLite {
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  COMMENTS?: KVNamespaceLite;
  MAILER_SECRET?: string;
}

interface Ctx {
  request: Request;
  env: Env;
}

// Pages Functions can't send email, so notifications go through the jhs-mailer
// Worker (see /mailer), called with a shared secret.
const MAILER_URL = 'https://jhs-mailer.default-85b.workers.dev';

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }
  const o = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const message = typeof o.message === 'string' ? o.message.trim().slice(0, 2000) : '';
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 120) : '';
  const honeypot = typeof o.website === 'string' ? o.website : 'x';
  if (!message || honeypot !== '') return json({ ok: false }, 400);
  if (!env.COMMENTS) return json({ ok: false, error: 'not configured' }, 503);
  const key = `c:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
  await env.COMMENTS.put(key, JSON.stringify({ name, message, at: new Date().toISOString() }));
  if (env.MAILER_SECRET) {
    try {
      await fetch(MAILER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mailer-secret': env.MAILER_SECRET },
        body: JSON.stringify({ name, message }),
      });
    } catch {
      // Email is best-effort: the comment is already safe in KV, so a mailer
      // failure must never turn into a 500 for the visitor.
    }
  }
  return json({ ok: true }, 200);
};
