const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const siteUrl = pathToFileURL(path.resolve(__dirname, '../index.html')).href;

test.beforeEach(async ({ page }) => {
  await page.goto(siteUrl);
  await page.evaluate(() => document.fonts.ready);
});

test('loads offline with all assets, working anchors, and no runtime errors', async ({ page }) => {
  const failures = [];
  const remoteRequests = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('requestfailed', (request) => failures.push(request.url()));
  page.on('request', (request) => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
  await page.reload();
  await expect(page.locator('h1')).toHaveText('perfonext.');
  await expect(page.locator('.evidence-row')).toHaveCount(4);
  const pageState = await page.evaluate(() => ({
    missingImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src),
    brokenAnchors: [...document.querySelectorAll('a[href^="#"]')].map((link) => link.getAttribute('href')).filter((href) => !document.getElementById(href.slice(1))),
    duplicateIds: [...document.querySelectorAll('[id]')].map((element) => element.id).filter((id, index, all) => all.indexOf(id) !== index),
  }));
  expect(pageState).toEqual({ missingImages: [], brokenAnchors: [], duplicateIds: [] });
  expect(failures).toEqual([]);
  expect(remoteRequests).toEqual([]);
});

test('renders supplied client logos and the code-search brand mark without shifting labels', async ({ page }) => {
  const expectedLogos = ['claudecode-color.svg', 'githubcopilot.svg', 'claude-color.svg', 'cursor.svg'];
  const clientLogos = page.locator('.client-names img');
  await expect(clientLogos).toHaveCount(expectedLogos.length);
  for (const [index, filename] of expectedLogos.entries()) {
    await expect(clientLogos.nth(index)).toHaveAttribute('src', `assets/icons/${filename}`);
  }
  await expect(page.locator('.brand-mark')).toHaveCount(2);
  for (const logo of await page.locator('.brand-mark').all()) {
    await expect(logo).toHaveAttribute('src', 'assets/icons/perfonext.svg');
  }
  const logos = await page.locator('.client-names img, .brand-mark').evaluateAll((images) => images.map((image) => {
    const bounds = image.getBoundingClientRect();
    const label = document.createRange();
    label.selectNodeContents(image.nextElementSibling ?? image.parentElement.lastChild);
    return { loaded: image.complete && image.naturalWidth > 0, square: Math.abs(bounds.width - bounds.height) < 1, separate: bounds.right <= label.getBoundingClientRect().left };
  }));
  expect(logos.every((logo) => logo.loaded && logo.square && logo.separate)).toBe(true);
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', 'assets/icons/perfonext.svg');
});

test('uses GitHub and npm marks only on their destination links', async ({ page }) => {
  await expect(page.locator('.nav-source')).toHaveAttribute('href', '#open-source');
  await expect(page.locator('.nav-source img')).toHaveAttribute('src', 'assets/icons/github.svg');
  const packages = page.locator('.package-link');
  await expect(packages).toHaveCount(3);
  for (const link of await packages.all()) {
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.npmjs\.com\/package\/@perfonext\//);
    await expect(link.locator('img')).toHaveAttribute('src', 'assets/icons/npm-svgrepo-com.svg');
    const layout = await link.evaluate((element) => {
      const image = element.querySelector('img');
      const text = document.createRange();
      text.selectNodeContents(element.firstChild);
      return { loaded: image.complete && image.naturalWidth > 0, separate: text.getBoundingClientRect().right <= image.getBoundingClientRect().left, contained: element.scrollWidth <= element.clientWidth };
    });
    expect(layout).toEqual({ loaded: true, separate: true, contained: true });
  }
  await expect(page.locator('.tool-bottom > span img[src="assets/icons/tool.svg"]')).toHaveCount(3);
  await expect(page.locator('.tool-bottom > span')).toHaveText(['9 TOOLS', '10 TOOLS', '11 TOOLS']);
});

test('shows fixture-backed evidence and responds to selection and keyboard focus', async ({ page, isMobile }) => {
  expect(JSON.parse(await page.locator('#response-code').textContent())).toMatchObject({ function: 'JSON.parse', selfTime: '160.0ms', selfPercent: '32.0%' });
  await page.locator('#tab-render').click();
  expect(JSON.parse(await page.locator('#response-code').textContent())).toMatchObject({ componentName: 'ProductList', totalSelfDuration: '21.5ms', renderCount: 3 });
  await page.locator('[data-row="SearchResults"]').focus();
  expect(JSON.parse(await page.locator('#response-code').textContent())).toMatchObject({ componentName: 'SearchResults', totalSelfDuration: '0.9ms', totalActualDuration: '19.0ms' });
  await expect(page.locator('#evidence-quality')).toContainText('HEURISTIC');
  await page.locator('#tab-build').click();
  expect(JSON.parse(await page.locator('#response-code').textContent())).toEqual({ path: '/dashboard', totalBytes: 164500, sharedChunkBytes: 104500, exclusiveChunkBytes: 60000 });
  const barRatios = await page.locator('.evidence-row').evaluateAll((rows) => rows.map((row) => row.querySelector('.row-bar').getBoundingClientRect().width / row.querySelector('.row-bar-track').getBoundingClientRect().width));
  for (const [index, value] of [164500, 162500, 124500, 106500].entries()) expect(barRatios[index]).toBeCloseTo(value / 164500, 2);
  if (isMobile) await page.locator('[data-row="home"]').tap();
  else await page.locator('[data-row="home"]').hover();
  expect(JSON.parse(await page.locator('#response-code').textContent()).path).toBe('/');
  await page.locator('#tab-build').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#tab-cpu')).toBeFocused();
  await expect(page.locator('#tab-cpu')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-render')).toHaveAttribute('aria-selected', 'true');
});

test('generates the right configuration for every client and server selection', async ({ page }) => {
  for (const client of ['copilot', 'claude-desktop', 'cursor']) {
    await page.locator(`#client-${client}`).click();
    const config = JSON.parse(await page.locator('#config-code').textContent());
    const entries = config[client === 'copilot' ? 'servers' : 'mcpServers'];
    expect(Object.keys(entries)).toHaveLength(3);
    expect(entries['perfonext-build'].args).toEqual(['-y', '@perfonext/build-mcp']);
  }
  for (const server of ['profiler', 'render', 'build']) await page.locator(`input[value="${server}"]`).uncheck();
  await expect(page.locator('#copy-config')).toBeDisabled();
  await expect(page.locator('#copy-prompt')).toBeDisabled();
  await page.locator('input[value="build"]').check();
  expect(Object.keys(JSON.parse(await page.locator('#config-code').textContent()).mcpServers)).toEqual(['perfonext-build']);
  await page.locator('#client-claude-code').click();
  await expect(page.locator('#config-code')).toHaveText('claude mcp add perfonext-build -- npx -y @perfonext/build-mcp');
  await expect(page.locator('#starter-prompt')).toContainText('largest routes');
  await page.locator('#client-claude-code').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#client-cursor')).toBeFocused();
  await expect(page.locator('#config-filename')).toHaveText('.cursor/mcp.json');
});

test('copies content and reports clipboard denial honestly', async ({ page }) => {
  await page.evaluate(() => {
    globalThis.clipboardMode = 'native';
    globalThis.copiedText = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value) => {
        if (globalThis.clipboardMode !== 'native') throw new Error('Clipboard permission denied');
        globalThis.copiedText = value;
      },
    } });
    document.execCommand = () => {
      if (globalThis.clipboardMode !== 'fallback') return false;
      globalThis.copiedText = document.activeElement.value;
      return true;
    };
  });
  await page.locator('#copy-config').click();
  await expect(page.locator('#toast')).toHaveText('Copied to clipboard.');
  expect(await page.evaluate(() => globalThis.copiedText)).toContain('@perfonext/profiler-mcp');
  await page.evaluate(() => { globalThis.clipboardMode = 'fallback'; });
  await page.locator('#copy-prompt').click();
  expect(await page.evaluate(() => globalThis.copiedText)).toBe('How do I capture a CPU profile of my Next.js server?');
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.evaluate(() => { globalThis.clipboardMode = 'denied'; });
  await page.locator('#copy-response').click();
  await expect(page.locator('#toast')).toContainText('Clipboard unavailable');
});

test('paints an interactive timeline and respects reduced motion', async ({ page }) => {
  const canvas = page.locator('#profile-canvas');
  const initial = await canvas.evaluate((element) => {
    const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    let painted = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) painted++;
    return painted / (pixels.length / 4);
  });
  expect(initial).toBeGreaterThan(.25);
  await canvas.focus();
  await page.keyboard.press('End');
  await expect(page.locator('#timeline-readout')).toHaveText('490-500 ms / processData');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#timeline-readout')).toHaveText('10-20 ms / JSON.parse');
  expect(await page.locator('h1').evaluate((element) => parseFloat(getComputedStyle(element).animationDuration))).toBeLessThan(.001);
});

test('fits the viewport with a visible next section and no clipped headings', async ({ page }, testInfo) => {
  const viewports = testInfo.project.name === 'desktop'
    ? [{ width: 640, height: 900 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 720 }, { width: 1440, height: 600 }, { width: 1920, height: 1080 }, { width: 667, height: 375 }, { width: 568, height: 320 }]
    : [page.viewportSize()];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    const layout = await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('h1'));
      const title = range.getBoundingClientRect();
      const toolCountsFit = [...document.querySelectorAll('.tool-bottom')].every((row) => row.firstElementChild.getBoundingClientRect().right <= row.lastElementChild.getBoundingClientRect().left && row.lastElementChild.getBoundingClientRect().height <= 24);
      return { width: innerWidth, content: document.documentElement.scrollWidth, titleLeft: title.left, titleRight: title.right, nextSection: document.querySelector('.clients-band').getBoundingClientRect().top, height: innerHeight, toolCountsFit };
    });
    expect(layout.content, JSON.stringify(viewport)).toBeLessThanOrEqual(layout.width);
    expect(layout.titleLeft).toBeGreaterThanOrEqual(0);
    expect(layout.titleRight).toBeLessThanOrEqual(layout.width);
    expect(layout.toolCountsFit, JSON.stringify(viewport)).toBe(true);
    expect(layout.nextSection, JSON.stringify(viewport)).toBeLessThan(layout.height - 4);
  }
});

test('meets automated WCAG AA checks and reveals FAQ content', async ({ page }) => {
  await page.locator('.faq-list summary').last().click();
  await expect(page.locator('.faq-list details').last()).toHaveAttribute('open', '');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
});