// ui-arrived.mjs — buyer taps "It arrived" in the real UI (phone width); also opens Report-a-problem and checks typed text survives a backdrop tap.
import { openApp, goSale, saleText, toasts } from './uilib.mjs';
const { browser, page, errs } = await openApp('buyer', { w: 390, h: 844 });
await page.locator('[data-tab="trade"]:visible').first().click(); await page.waitForTimeout(3500);
await page.locator('[data-action="mkt-open-sale"]').first().click(); await page.waitForTimeout(1500);
await page.click('#subtab-sale [data-action="mkt-filter"][data-filter="offers"]'); await page.waitForTimeout(1200);
const rp = page.locator('#subtab-sale [data-action="mkt-report-problem"]').first();
if (await rp.count()) {
  await rp.click(); await page.waitForTimeout(800);
  await page.fill('#mpr-note', 'typing something I must not lose');
  await page.mouse.click(5, 5); await page.waitForTimeout(600);   // backdrop tap
  console.log('problem modal still open with text after backdrop tap:', await page.locator('#market-problem-modal:not(.hidden)').count() === 1, '|', await page.inputValue('#mpr-note'));
  await page.screenshot({ path: 'ui-problem-phone.png' });
  await page.fill('#mpr-note', ''); await page.locator('#market-problem-modal button[data-close-mproblem]').first().click(); await page.waitForTimeout(800);
  console.log('problem modal closed:', await page.locator('#market-problem-modal.hidden').count() === 1);
}
const arrived = page.locator('#subtab-sale [data-action="mkt-arrived"]').first();
console.log('"It arrived" buttons:', await page.locator('#subtab-sale [data-action="mkt-arrived"]').count());
if (await arrived.count()) {
  await arrived.click(); await page.waitForTimeout(9000);
  console.log('toasts:', JSON.stringify(await toasts(page)));
  console.log((await saleText(page)).split('\n').filter((l) => /Done|paid|Rabbit/i.test(l)).slice(0, 6).join('\n'));
}
await page.screenshot({ path: 'ui-arrived-phone.png' });
console.log('errors', JSON.stringify(errs));
await browser.close();
