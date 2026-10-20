/**
 * <quad-form> contract pins, for what the element promises its hosts.
 *
 * The behaviour that matters — the DSEF's rows, the [+] picker, the
 * vocabulary drops — is tested by nooviz's e2e (198, 199, 186) against
 * the bundle this source is compiled into; gate.sh runs that suite when
 * src/ here changes. These pin the element on its own: the pick-list
 * rules the README states, the three-state paint of an input face, and
 * the one attribute a host uses to say a field is required while empty.
 */
import { test, expect } from '@playwright/test';
import { gotoFormPage, inForm, validityOf, shapeOf } from './testpage.js';

const AMBER = 'rgb(255, 248, 225)';   // well-formed, not on offer
const GREEN = 'rgb(232, 245, 233)';   // well-formed, on offer
const RED = 'rgb(255, 235, 238)';     // malformed

test.describe('<quad-form>', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFormPage(page);
  });

  test('options are sorted by LABEL, whatever order they arrive in', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('qf').predicateOptions = [
        { value: 'foaf:name', label: 'name' },
        { value: 'dc:title', label: 'title' },
        { value: 'foaf:knows', label: 'knows' },
      ];
    });
    // by value the order would begin dc:title; by label it is knows, name, title
    expect(await shapeOf(page, 'predicate')).toEqual(['foaf:knows', 'foaf:name', 'dc:title']);
  });

  test('a group keeps its place, sorts within, and follows the ungrouped run', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('qf').objectOptions = [
        { value: 'ex:z', label: 'z', group: 'afforded' },
        { value: 'ex:b', label: 'b' },
        { value: 'ex:m', label: 'm', group: 'other' },
        { value: 'ex:a', label: 'a', group: 'afforded' },
        { value: 'ex:c', label: 'c' },
      ];
    });
    expect(await shapeOf(page, 'object'))
      .toEqual(['ex:b', 'ex:c', 'afforded:[ex:a,ex:z]', 'other:[ex:m]']);
  });

  test('the same options complete the input face through a datalist', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('qf').subjectOptions = ['ex:bob', 'ex:Alice', 'ex:carol'];
    });
    await expect(inForm(page, '#subject-input')).toHaveAttribute('list', 'subject-list');
    const completions = await page.evaluate(() => [...document.getElementById('qf')
      .shadowRoot.querySelectorAll('#subject-list option')].map((o) => o.value));
    expect(completions).toEqual(['ex:Alice', 'ex:bob', 'ex:carol']);
  });

  test('a well-formed term the vocabulary does not offer paints amber — a hint, not a gate', async ({ page }) => {
    await page.evaluate(() => {
      const qf = document.getElementById('qf');
      qf.subjectOptions = ['ex:alice', 'ex:bob'];
      qf.vocabularyFields = ['subject'];
    });
    const input = inForm(page, '#subject-input');

    await input.fill('ex:carol');
    await expect(input).toHaveAttribute('data-unknown', '');
    await expect(input).toHaveCSS('background-color', AMBER);
    await expect(input).toHaveAttribute('title', /not one of the 2 terms on offer/);
    expect(await validityOf(page, 'subject')).toBe(true);   // untouched: still valid

    await input.fill('ex:alice');
    await expect(input).not.toHaveAttribute('data-unknown');
    await expect(input).toHaveCSS('background-color', GREEN);

    await input.fill('carol');   // no prefix: malformed, and that is red, not amber
    await expect(input).not.toHaveAttribute('data-unknown');
    await expect(input).toHaveCSS('background-color', RED);
    expect(await validityOf(page, 'subject')).toBe(false);
  });

  test('a field outside vocabularyFields gets no hint for an unknown term', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('qf').subjectOptions = ['ex:alice', 'ex:bob'];
    });
    const input = inForm(page, '#subject-input');
    await input.fill('ex:carol');
    await expect(input).not.toHaveAttribute('data-unknown');
    await expect(input).toHaveCSS('background-color', GREEN);
  });

  test('host-invalid lets the host red-rim a field that is still empty', async ({ page }) => {
    const input = inForm(page, '#subject-input');
    const before = await input.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, border: cs.borderColor };
    });
    expect(before.background).not.toBe('rgb(251, 238, 238)');

    await page.evaluate(() => document.getElementById('qf').setAttribute('host-invalid', ''));
    await expect(input).toHaveCSS('background-color', 'rgb(251, 238, 238)');
    await expect(input).toHaveCSS('border-color', 'rgb(208, 128, 128)');

    await page.evaluate(() => document.getElementById('qf').removeAttribute('host-invalid'));
    await expect(input).toHaveCSS('background-color', before.background);
    await expect(input).toHaveCSS('border-color', before.border);
  });
});

// THE OBJECT FOLLOWS THE PREDICATE (iss:quadform-domain-range, 2026-10-14):
// a host that knows the vocabulary hands in objectGuide, and the object
// control is reshaped ahead of the person whenever the predicate changes —
// but never over a value already given, nor over a type chosen by hand.
test.describe('<quad-form> objectGuide', () => {
  const FOAF = 'http://xmlns.com/foaf/0.1/';

  test.beforeEach(async ({ page }) => {
    await gotoFormPage(page);
    await page.evaluate((FOAF) => {
      const qf = document.getElementById('qf');
      window.asked = [];
      window.guided = [];
      qf.addEventListener('object-guided', (e) => window.guided.push(e.detail));
      qf.objectGuide = async (p) => {
        window.asked.push(p);
        if (p === `${FOAF}birthday`) return { type: 'xsd:date', decided: true };
        if (p === `${FOAF}knows`) {
          return { type: 'qname', decided: true, entity: true, options: [{ value: 'ex:alice' }, { value: 'ex:bob' }] };
        }
        return null;                                   // nothing decided
      };
    }, FOAF);
  });

  const objectType = (page) => page.evaluate(() => document.getElementById('qf').fieldTypes.object);
  const lastGuided = (page) => page.evaluate(() => window.guided.at(-1) ?? null);

  test('a predicate set by the host shapes the object at once: a date range, a date control', async ({ page }) => {
    await page.evaluate((FOAF) => document.getElementById('qf').setField('predicate', `${FOAF}birthday`), FOAF);
    await expect.poll(() => lastGuided(page)).toEqual({ predicate: `${FOAF}birthday`, type: 'xsd:date', applied: true });
    expect(await objectType(page)).toBe('xsd:date');
    await expect(inForm(page, '#object-input')).toHaveAttribute('type', 'date');
  });

  test('a class range: an entity slot, and its candidates on offer', async ({ page }) => {
    await page.evaluate((FOAF) => document.getElementById('qf').setField('predicate', `${FOAF}birthday`), FOAF);
    await expect.poll(() => objectType(page)).toBe('xsd:date');
    await page.evaluate((FOAF) => document.getElementById('qf').setField('predicate', `${FOAF}knows`), FOAF);
    await expect.poll(() => objectType(page)).toBe('qname');
    expect(await page.evaluate(() => document.getElementById('qf').objectOptions.map((o) => o.value)))
      .toEqual(['ex:alice', 'ex:bob']);
  });

  test('a TYPED predicate is asked about once the typing pauses, not per keystroke', async ({ page }) => {
    // the predicate opens on its picker face; typing is the input face's
    await inForm(page, '.control-toggle[data-field="predicate"]').click();
    await expect(inForm(page, '#predicate-input')).toBeVisible();
    await inForm(page, '#predicate-input').pressSequentially('foaf:birthday', { delay: 20 });
    await expect.poll(() => page.evaluate(() => window.asked)).toEqual([`${FOAF}birthday`]);
    await expect.poll(() => objectType(page)).toBe('xsd:date');
  });

  test('nothing decided leaves the object as it was', async ({ page }) => {
    await page.evaluate(() => document.getElementById('qf').setField('predicate', 'ex:unheardOf'));
    await expect.poll(() => lastGuided(page)).toMatchObject({ type: null, applied: false });
    expect(await objectType(page)).toBe('qname');
  });

  test('a value already given is not reshaped under the person', async ({ page }) => {
    await page.evaluate((FOAF) => {
      const qf = document.getElementById('qf');
      qf.setField('object', 'ex:alice');
      qf.setField('predicate', `${FOAF}birthday`);
    }, FOAF);
    await expect.poll(() => lastGuided(page)).toMatchObject({ type: 'xsd:date', applied: false });
    expect(await objectType(page)).toBe('qname');
    expect(await page.evaluate(() => document.getElementById('qf').getField('object'))).toBe('ex:alice');
  });

  test('a type chosen by hand while the guide is asked is not overridden', async ({ page }) => {
    await page.evaluate((FOAF) => {
      const qf = document.getElementById('qf');
      let release;
      qf.objectGuide = (p) => new Promise((r) => { release = () => r({ type: 'xsd:date', decided: true }); });
      qf.setField('predicate', `${FOAF}birthday`);
      const sel = qf.shadowRoot.getElementById('object-type-select');
      sel.value = 'xsd:string';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      release();
    }, FOAF);
    await expect.poll(() => lastGuided(page)).toMatchObject({ type: 'xsd:date', applied: false });
    expect(await objectType(page)).toBe('xsd:string');
  });
});

// A NANO EDITOR LEFT EMPTY IS PUT DOWN, AND SAYS SO (smurp 2026-10-16: a
// ponder cell's date editor, opened on an empty cell and clicked away from,
// stayed open — and so did a second, and a third). Blur and Tab submit a
// nano editor; with nothing in it they used to return silently, so its host
// never learned it was done. Now quad-dismissed tells it, with the reason.
test.describe('<quad-form> nano: put down empty', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFormPage(page);
    await page.evaluate(() => {
      const qf = document.getElementById('qf');
      window.events = [];
      for (const name of ['quad-dismissed', 'quad-submitted']) {
        qf.addEventListener(name, (e) => window.events.push([name, e.detail?.reason ?? null]));
      }
      qf.toggleNanoMode();
    });
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('qf').shadowRoot.activeElement?.id ?? null)).toBe('object-input');
  });

  const events = (page) => page.evaluate(() => window.events);

  test('left empty by Tab or by blur, it is dismissed, not submitted', async ({ page }) => {
    const input = inForm(page, '#object-input');
    await input.press('Tab');
    await expect.poll(() => events(page)).toEqual([['quad-dismissed', 'tab']]);
    await input.focus();
    await input.evaluate((el) => el.blur());
    await expect.poll(() => events(page)).toEqual([['quad-dismissed', 'tab'], ['quad-dismissed', 'blur']]);
  });

  test('with something in it, Tab submits it and nothing is dismissed', async ({ page }) => {
    const input = inForm(page, '#object-input');
    await input.fill('ex:alice');
    await input.press('Tab');
    await expect.poll(() => events(page)).toEqual([['quad-submitted', null]]);
  });

  test('a control reshaped under the caret keeps the caret, and is not taken for left', async ({ page }) => {
    await page.evaluate(() => {
      const qf = document.getElementById('qf');
      window.guided = [];
      qf.addEventListener('object-guided', (e) => window.guided.push(e.detail));
      qf.objectGuide = async () => {
        await new Promise((r) => setTimeout(r, 150));      // answered after the caret is in
        return { type: 'xsd:string', decided: true };
      };
      qf.setField('predicate', 'http://example.org/note');
    });
    await expect.poll(() => page.evaluate(() => window.guided.at(-1)?.applied ?? null)).toBe(true);
    expect(await page.evaluate(() => document.getElementById('qf').shadowRoot.activeElement?.id ?? null))
      .toBe('object-textarea');
    expect(await events(page)).toEqual([]);
  });
});

// THE PICKER IS FOR THINGS (iss:quadform-picker-offered-where-a-textarea-
// belongs; smurp 2026-09-09: "for those datatypes deserving a textarea the
// input/picker toggle should be disabled and the picker never offered").
// Toggling on a text object showed the picker UNDER the textarea, and both
// carried the object's value: the form showed one statement and would save
// another. A literal has nothing to pick, so the toggle is offered only when
// the object is a reference.
test.describe('<quad-form> the object picker is for things', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFormPage(page);
  });

  const setType = (page, type) => page.evaluate((type) => {
    const sel = document.getElementById('qf').shadowRoot.getElementById('object-type-select');
    sel.value = type;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, type);
  const toggle = (page) => inForm(page, '.control-toggle[data-field="object"]');

  test('a text object offers no picker, and a toggle pressed anyway shows none', async ({ page }) => {
    await setType(page, 'xsd:string');
    await expect(inForm(page, '#object-textarea')).toBeVisible();
    await expect(toggle(page)).toBeHidden();
    await toggle(page).evaluate((b) => b.click());            // the way a stale handler or a test might
    await expect(inForm(page, '#object-select')).toBeHidden();
    await expect(inForm(page, '#object-textarea')).toBeVisible();
  });

  test('nor does a date; a reference does, and its picker works', async ({ page }) => {
    await setType(page, 'xsd:date');
    await expect(toggle(page)).toBeHidden();
    await setType(page, 'qname');
    await expect(toggle(page)).toBeVisible();
    await toggle(page).click();
    await expect(inForm(page, '#object-select')).toBeVisible();
    await expect(inForm(page, '#object-input')).toBeHidden();
  });
});


// THE EMPTY PREFIX (2026-10-20, decided with smurp for the ponder's draft
// row and detail()'s subject: `:Name` is the panel's mental space and a
// `#`). A host binds it with defaultNamespace; unbound, `:Name` is invalid
// as before; `_:` is never a prefix; and it expands, never contracts.
test.describe('<quad-form> the empty prefix', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFormPage(page);
  });

  test('a prefix table cannot bind `:` — a file\'s `@prefix : <http://example.org/>` among them — only defaultNamespace does', async ({ page }) => {
    const seen = await page.evaluate(() => {
      const qf = document.getElementById('qf');
      qf.prefixes = { '': 'http://example.org/', wp: 'https://en.wikipedia.org/wiki/' };
      const unbound = { valid: qf.validateField('object', ':Carol', 'qname'), expanded: qf.expandQName(':Carol') };
      qf.defaultNamespace = 'mntl:open/x/people#';
      return { unbound, bound: qf.expandQName(':Carol'), wp: qf.expandQName('wp:Freedom') };
    });
    expect(seen).toEqual({
      unbound: { valid: false, expanded: ':Carol' },
      bound: 'mntl:open/x/people#Carol',
      wp: 'https://en.wikipedia.org/wiki/Freedom',
    });
  });

  test(':Name is valid and expands only where the host binds `:`; _: never is; nothing contracts to it', async ({ page }) => {
    const seen = await page.evaluate(() => {
      const qf = document.getElementById('qf');
      const valid = (v) => qf.validateField('subject', v, 'qname');
      const unbound = { valid: valid(':Carol'), expanded: qf.expandQName(':Carol') };
      qf.defaultNamespace = 'mntl:open/x/people#';
      return {
        unbound,
        bound: { valid: valid(':Carol'), expanded: qf.expandQName(':Carol') },
        badLocal: valid(':2nd'),
        bare: valid(':'),
        blank: valid('_:carol'),
        others: { curie: qf.expandQName('foaf:name'), iri: qf.expandQName('mntl:open/x/people#Carol') },
        contracted: qf.contractUri('mntl:open/x/people#Carol'),
      };
    });
    expect(seen).toEqual({
      unbound: { valid: false, expanded: ':Carol' },
      bound: { valid: true, expanded: 'mntl:open/x/people#Carol' },
      badLocal: false,
      bare: false,
      blank: false,
      others: { curie: 'http://xmlns.com/foaf/0.1/name', iri: 'mntl:open/x/people#Carol' },
      contracted: 'mntl:open/x/people#Carol',
    });
  });
});

// WORDS ARE NEVER EXPANDED (smurp 2026-10-20: `wp:Freedom` typed into a
// ponder cell was saved as the Wikipedia URL, as words). A name is.
test.describe('<quad-form> words are kept as typed', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFormPage(page);
    await page.evaluate(() => {
      const qf = document.getElementById('qf');
      window.submitted = [];
      qf.addEventListener('quad-submitted', (e) => window.submitted.push(e.detail.o));
      qf.toggleNanoMode();
    });
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('qf').shadowRoot.activeElement?.id ?? null)).toBe('object-input');
  });

  test('a name is expanded; the same characters as words are not', async ({ page }) => {
    const input = inForm(page, '#object-input');
    await input.fill('wp:Freedom');
    await input.press('Tab');
    await expect.poll(() => page.evaluate(() => window.submitted)).toEqual(['https://en.wikipedia.org/wiki/Freedom']);
    // the host says the object is words (a held literal's datatype)
    await page.evaluate(() => { document.getElementById('qf').objectDatatype = 'xsd:string'; });
    await input.focus();
    await input.fill('wp:Freedom');
    await input.press('Tab');
    await expect.poll(() => page.evaluate(() => window.submitted))
      .toEqual(['https://en.wikipedia.org/wiki/Freedom', 'wp:Freedom']);
  });
});
