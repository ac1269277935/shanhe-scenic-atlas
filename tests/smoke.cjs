const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');

const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const output = path.resolve(__dirname, '../test-results');
const ready = page => page.locator('#china-five-a-map[data-ready=true]').waitFor();
const settled = page => page.waitForFunction(() => document.querySelector('#china-five-a-map').dataset.camera === 'idle');
const count = page => page.locator('#c5a-place option').count();

(async () => {
  await fs.mkdir(output, { recursive: true });
  const options = { headless: true, downloadsPath: output };
  if (process.env.BROWSER_EXECUTABLE) options.executablePath = process.env.BROWSER_EXECUTABLE;
  const browser = await chromium.launch(options);
  try {
    const context = await browser.newContext({ offline: true, acceptDownloads: true, viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await ready(page);
    await page.waitForFunction(() => document.querySelector('#china-five-a-map').dataset.intro === 'false');
    assert.equal(await count(page), 358);
    assert.equal(await page.locator('path.mark').count(), 358);
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });

    await page.locator('#c5a-place').selectOption('009');
    await page.locator('#c5a-toggle-mark').click();
    await page.locator('[data-mark-scope=marked]').click();
    assert.equal(await count(page), 1);
    await page.locator('#c5a-undo').click();
    assert.equal(await count(page), 0);
    await page.locator('#c5a-empty-clear').click();
    await settled(page);
    await page.locator('#c5a-place').selectOption('009');
    await page.locator('#c5a-toggle-mark').click();
    await page.reload(); await ready(page);
    await page.locator('[data-mark-scope=marked]').click();
    assert.equal(await count(page), 1);
    assert.equal(await page.locator('#c5a-place').inputValue(), '009');

    await page.getByText('标记保存与备份', { exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page.locator('#c5a-export-marks').click();
    const download = await downloading;
    const backup = path.join(output, 'marks-backup.json');
    await download.saveAs(backup);
    assert.equal(JSON.parse(await fs.readFile(backup, 'utf8')).marked[0].id, '009');
    await page.locator('#c5a-toggle-mark').click();
    await page.locator('#c5a-import-file').setInputFiles(backup);
    await page.waitForFunction(() => document.querySelector('#c5a-mark-feedback').textContent.startsWith('导入完成'));
    assert.equal(await count(page), 1);
    await page.locator('#c5a-clear-filters').click(); await settled(page);

    await page.locator('#c5a-province').selectOption('江苏'); await settled(page);
    assert.equal(await count(page), 26);
    await page.locator('button.legend-item[data-type="1"]').click();
    assert.ok(await count(page) < 26);
    await page.locator('#c5a-clear-filters').click(); await settled(page);
    await page.locator('#c5a-search').fill('黄山');
    await page.locator('#c5a-search').press('ArrowDown');
    await page.locator('#c5a-search').press('Enter'); await settled(page);
    assert.match(await page.locator('.detail-heading h3').textContent(), /黄山/);
    assert.ok(await page.locator('#c5a-svg').evaluate(svg => svg.__zoom.k >= 5));

    await page.locator('#c5a-motion').click();
    assert.equal(await page.locator('#china-five-a-map').getAttribute('data-motion'), 'off');
    await page.reload(); await ready(page);
    assert.equal(await page.locator('#china-five-a-map').getAttribute('data-motion'), 'off');
    for (const width of [930, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      await page.waitForFunction(() => Math.abs(document.querySelector('#c5a-svg').viewBox.baseVal.width - document.querySelector('.map-stage').clientWidth) < 2);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await page.locator('#c5a-province').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(32, 42, 37)');
    assert.deepEqual(errors, []);
    console.log('PASS: offline map, bookmarks/undo/persistence, backup round-trip, combined filters, search, motion preference, responsive layouts and dark theme.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
