// ui-offer.mjs <name fragment> <offer dollars> — buyer offers through the real UI, then the seller accepts through the real UI.
import { openApp, goSale, saleText } from './uilib.mjs';
const [frag = 'PURPLE', amount = '28'] = process.argv.slice(2);
{
  const { browser, page, errs } = await openApp('buyer', { w: 390, h: 844 });   // a phone
  // Discoverability on a phone: Trade → the For Sale doorway on Browse.
  await page.locator('[data-tab="trade"]:visible').first().click(); await page.waitForTimeout(3500);
  const door = page.locator('[data-action="mkt-open-sale"]').first();
  console.log('phone: For Sale doorway on Trade → Browse visible:', await door.isVisible().catch(() => false));
  await door.click(); await page.waitForTimeout(1500);
  await page.click('#subtab-sale [data-action="mkt-filter"][data-filter="shop"]'); await page.waitForTimeout(1200);
  const card = page.locator('#subtab-sale [data-action="mkt-offer"]').first();
  console.log('shop:', (await saleText(page)).split('\n').filter((l) => /Rabbit|\$/.test(l)).slice(0, 4).join(' | '));
  await card.click(); await page.waitForTimeout(1200);
  await page.fill('#mo-amount', amount); await page.click('#mo-send');
  await page.waitForFunction(() => document.getElementById('market-offer-modal').classList.contains('hidden'), null, { timeout: 15000 }).catch(() => console.log('offer modal still open:', document.title));
  await page.waitForTimeout(2500);
  console.log('buyer after offer:', (await saleText(page)).split('\n').filter((l) => /offered|Waiting|turn/i.test(l)).slice(0, 2).join(' | '));
  await page.screenshot({ path: 'ui-offer-phone.png' });
  console.log('buyer errors', JSON.stringify(errs)); await browser.close();
}
{
  const { browser, page, errs } = await openApp('seller');
  await goSale(page, 'offers');
  await page.locator('#subtab-sale [data-action="mkt-accept"]').first().click();
  await page.waitForTimeout(4000);
  console.log('seller after accept:', (await saleText(page)).split('\n').filter((l) => /Accepted|hold|pay/i.test(l)).slice(0, 3).join(' | '));
  console.log('seller errors', JSON.stringify(errs)); await browser.close();
}
