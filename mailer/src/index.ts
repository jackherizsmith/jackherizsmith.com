interface EmailMessage {
  to: string;
  from: { email: string; name?: string };
  subject: string;
  text: string;
}

interface Env {
  EMAIL: { send(msg: EmailMessage): Promise<unknown> };
  MAILER_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (request.headers.get('x-mailer-secret') !== env.MAILER_SECRET) {
      return new Response('Unauthorised', { status: 401 });
    }

    let body: { name?: unknown; message?: unknown };
    try {
      body = await request.json();
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    if (!message) return new Response('Empty message', { status: 400 });

    const at = new Date().toISOString();
    try {
      await env.EMAIL.send({
        to: 'jackherizsmith@gmail.com',
        from: { email: 'hello@jackherizsmith.com', name: 'jackherizsmith.com' },
        subject: `New comment on jackherizsmith.com${name ? ` from ${name}` : ''}`,
        text: `${message}\n\nFrom: ${name || 'anonymous'}\nAt: ${at}`,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      return new Response(JSON.stringify({ ok: false, error: detail }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
};
