// ui-sell.mjs <name fragment> <price dollars> — the seller lists an item through the real UI.
import { openApp, goSale, saleText, noisePng } from './uilib.mjs';
const [frag = 'PURPLE', price = '30'] = process.argv.slice(2);
const { browser, page, errs } = await openApp('seller');
await page.click('.tab[data-tab="crypt"]'); await page.waitForTimeout(3000);
const card = page.locator('.card, [data-id]').filter({ hasText: frag }).first();
console.log('cards with a Sell button:', await page.locator('[data-action="sell-item"]').count());
await card.locator('[data-action="sell-item"]').first().click();
await page.waitForTimeout(2500);
if (await page.locator('#seller-terms-modal:not(.hidden)').count()) { await page.check('#st-check').catch(() => {}); await page.click('#st-accept'); await page.waitForTimeout(1500); console.log('accepted terms'); }
console.log('sell modal open:', await page.locator('#market-sell-modal:not(.hidden)').count(), '| item:', await page.locator('#ms-name').innerText().catch(() => '?'));
await page.fill('#ms-price', price);
await page.selectOption('#ms-parcel', 'small').catch(async () => { const v = await page.locator('#ms-parcel option').nth(1).getAttribute('value'); await page.selectOption('#ms-parcel', v); });
await page.fill('#ms-weight-lb', '0'); await page.fill('#ms-weight-oz', '14');
for (const cb of await page.locator('#ms-services input[type=checkbox]').all()) { if (!(await cb.isChecked())) await cb.check(); }
await page.setInputFiles('#ms-photo-input', await noisePng('real-photo.png'));
await page.waitForTimeout(6000);
console.log('fees preview:', (await page.locator('#ms-fees').innerText()).replace(/\n/g, ' | '));
console.log('photos:', await page.locator('#ms-photos img').count(), '| ship-from:', (await page.locator('#ms-shipfrom').innerText()).replace(/\n/g, ' ').slice(0, 90));
await page.screenshot({ path: 'ui-sell-modal.png' });
await page.click('#ms-save');
await page.waitForFunction(() => document.getElementById('market-sell-modal').classList.contains('hidden') || !document.getElementById('ms-error').classList.contains('hidden'), null, { timeout: 30000 }).catch(() => {});
console.log('modal closed:', await page.locator('#market-sell-modal.hidden').count() === 1, '| error:', await page.locator('#ms-error').innerText().catch(() => ''));
await goSale(page, 'mine');
console.log((await saleText(page)).slice(0, 900));
await page.screenshot({ path: 'ui-sell-listings.png' });
console.log('errors', JSON.stringify(errs));
await browser.close();
