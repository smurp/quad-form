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
