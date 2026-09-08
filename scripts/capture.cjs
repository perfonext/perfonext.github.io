const assert = require('node:assert/strict');
const { mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('@playwright/test');

async function capture() {
  const root = path.resolve(__dirname, '..');
  const screenshots = path.join(root, 'test-results/visuals');
  await mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true });
    for (const [name, selector] of [['brand-header', '.site-header .brand'], ['brand-footer', '.footer-bottom .brand'], ['client-logos', '.clients-band']]) {
      await page.locator(selector).screenshot({ path: path.join(screenshots, `${name}.png`) });
    }
    for (const mode of ['cpu', 'render', 'build']) {
      await page.locator(`#tab-${mode}`).click();
      await page.locator('#evidence').screenshot({ path: path.join(screenshots, `evidence-${mode}.png`) });
    }
    await page.locator('#install').screenshot({ path: path.join(screenshots, 'installation.png') });
    await page.locator('#tab-cpu').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(screenshots, 'mobile.png'), fullPage: true });

    await page.setViewportSize({ width: 1200, height: 900 });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    const style = await page.addStyleTag({ content: '.hero-inner{padding-top:28px}.hero h1{font-size:160px}.hero-figure{margin-top:32px;padding-bottom:18px}' });
    const hero = await page.locator('.hero').boundingBox();
    await page.screenshot({ path: path.join(root, 'assets/social.png'), scale: 'css', clip: { x: 0, y: hero.y, width: 1200, height: 630 } });
    const brand = await page.locator('.site-header .brand-mark').boundingBox();
    await page.screenshot({ path: path.join(root, 'assets/favicon.png'), scale: 'css', clip: { x: Math.floor(brand.x + brand.width / 2 - 16), y: Math.floor(brand.y + brand.height / 2 - 16), width: 32, height: 32 } });
    await style.evaluate((element) => element.remove());
    for (const [file, width, height] of [['social.png', 1200, 630], ['favicon.png', 32, 32]]) {
      const image = await readFile(path.join(root, 'assets', file));
      assert.equal(image.readUInt32BE(16), width);
      assert.equal(image.readUInt32BE(20), height);
    }

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    const motion = await page.evaluate(async () => {
      const canvas = document.querySelector('#profile-canvas');
      const paintedPixels = () => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) painted++;
        return painted;
      };
      const before = paintedPixels();
      for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame);
      return { before, after: paintedPixels() };
    });
    assert.ok(motion.after > motion.before, 'The non-reduced-motion timeline should visibly enter.');
    console.log(JSON.stringify({ screenshots: 'test-results/visuals', social: '1200 x 630', favicon: '32 x 32', motion }, null, 2));
  } finally {
    await browser.close();
  }
}

capture().catch((error) => { console.error(error); process.exitCode = 1; });