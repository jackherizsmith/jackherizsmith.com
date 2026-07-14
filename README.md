# jackherizsmith.com

A portfolio that is also a WYSIWYG editor. The document underneath is semantic HTML; the editor chrome on top (select, drag with smart guides, resize, rotate, inline text editing, undo, publishable remix links) is hand-rolled TypeScript on Vite, roughly 13 KB gzipped. A second cursor called Jack wanders the canvas and has opinions.

- `site/`: the live site. `npm install`, then `npm run dev` to develop and `npm run build` to build.
- `mockups/`: the five concept directions plus the chosen hybrid, as plain self-contained HTML.

Both deploy to Cloudflare Pages:

```sh
cd site && npm run build && npx wrangler pages deploy dist --project-name=jackherizsmith-v2 --branch=main
npx wrangler pages deploy mockups --project-name=jackherizsmith-mockups --branch=main
```
