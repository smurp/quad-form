/**
 * Test-page plumbing for the quad-form spec.
 *
 * Serves the package's src/ into a real page via page.route() under a
 * fake origin — no dev server, no build, no dist/ dependency. The element
 * exists in markup before the module that defines it runs, exercising the
 * same upgrade path example/index.html uses.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ORIGIN = 'http://quad-form.test';

const CONTENT_TYPES = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
};

const PAGE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>quad-form spec page</title></head>
<body>
  <quad-form id="qf"></quad-form>
  <script type="module">
    import '/src/quad-form.js';
    window.formReady = customElements.whenDefined('quad-form');
  </script>
</body>
</html>
`;

export async function gotoFormPage(page) {
  await page.route(`${ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') {
      return route.fulfill({ contentType: 'text/html', body: PAGE_HTML });
    }
    try {
      return route.fulfill({
        contentType: CONTENT_TYPES[path.extname(pathname)] || 'application/octet-stream',
        body: readFileSync(path.join(PKG_ROOT, pathname)),
      });
    } catch {
      return route.fulfill({ status: 404, body: `not found: ${pathname}` });
    }
  });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => window.formReady);
}

/** A locator into the form's shadow root (Playwright's CSS pierces it). */
export const inForm = (page, sel) => page.locator(`#qf ${sel}`);

/** The form's own idea of a field's validity. */
export const validityOf = (page, field) =>
  page.evaluate((f) => document.getElementById('qf').fieldValidity[f], field);

/** A select's contents after its placeholder: values, and groups as
 *  label:[values] — the shape the sorting contract is stated in. */
export const shapeOf = (page, field) => page.evaluate((f) => {
  const select = document.getElementById('qf').shadowRoot.getElementById(`${f}-select`);
  return [...select.children].slice(1).map((el) => el.tagName === 'OPTGROUP'
    ? `${el.label}:[${[...el.children].map((o) => o.value).join(',')}]`
    : el.value);
}, field);
