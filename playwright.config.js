/**
 * Playwright Test Configuration — quad-form
 *
 * The spec mounts the real <quad-form> from src/ in a page served by
 * page.route() under a fake origin — no dev server, no build, no dist/.
 *
 * No projects array, so gate.sh's playwright_project field stays blank
 * for this repo (mirrors colortreepicker and sembalance).
 */
export default {
  testDir: './test',
  timeout: 30 * 1000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
};
