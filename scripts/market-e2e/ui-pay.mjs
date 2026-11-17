// ui-pay.mjs [stop|card number] — buyer checks out through the real UI: address → live rates → Stripe (sandbox) → back in the app → "It arrived".
// "stop" halts on Stripe's page and saves ui-stripe.png (use it to re-derive the click positions if Stripe changes its layout).
import { openApp, goSale, saleText, toasts } from './uilib.mjs';
const arg = process.argv[2] || '4242424242424242';
const { browser, page, errs } = await openApp('buyer', { w: 1100, h: 1400 });
await goSale(page, 'offers');
await page.locator('#subtab-sale [data-action="mkt-pay"]').first().click(); await page.waitForTimeout(1200);
// A bad address first: the error must show in place.
await page.fill('#mp-name', 'Test Buyer'); await page.fill('#mp-street1', '99999 Nowhere Rd'); await page.fill('#mp-city', 'Faketown'); await page.fill('#mp-state', 'ma'); await page.fill('#mp-zip', '01970');
await page.click('#mp-rates');
await page.waitForFunction(() => !document.getElementById('mp-error').classList.contains('hidden') || document.querySelectorAll('#mp-options input').length, null, { timeout: 30000 }).catch(() => {});
console.log('bad address →', await page.locator('#mp-error').innerText());
await page.fill('#mp-street1', '1 Salem Green'); await page.fill('#mp-city', 'Salem');
await page.click('#mp-rates');
await page.waitForFunction(() => document.querySelectorAll('#mp-options input').length > 0, null, { timeout: 30000 });
console.log('rates →', (await page.locator('#mp-options').innerText()).replace(/\n+/g, ' | '));
await page.locator('#mp-options input').first().check();
await page.waitForTimeout(600);
console.log('total →', (await page.locator('#mp-total').innerText()).replace(/\n+/g, ' | '));
await page.screenshot({ path: 'ui-pay-modal.png' });
await page.click('#mp-pay');
await page.waitForURL(/checkout\.stripe\.com/, { timeout: 40000 });
await page.waitForTimeout(10000);
await page.screenshot({ path: 'ui-stripe.png' });
if (arg === 'stop') { console.log('stopped on Stripe:', page.url().slice(0, 60)); await browser.close(); process.exit(0); }
// Stripe Checkout at 1100x1400: open the Card row, then fill by position.
const click = async (x, y, ms = 500) => { await page.mouse.click(x, y); await page.waitForTimeout(ms); };
const type = async (t) => { await page.keyboard.type(t, { delay: 45 }); await page.waitForTimeout(500); };
const P = JSON.parse(process.env.STRIPE_XY || '{"card":[722,371],"num":[800,435],"exp":[700,474],"cvc":[870,474],"name":[800,540],"zip":[800,647],"save":[654,693]}');
await click(...P.card, 3000);
await click(...P.num); await type(arg); await page.waitForTimeout(800);
await click(...P.exp); await page.keyboard.press('Control+A'); await type('1234');
await click(...P.cvc); await page.keyboard.press('Control+A'); await type('123');
await click(...P.name); await page.keyboard.press('Control+A'); await type('Test Buyer');
await click(...P.zip); await page.keyboard.press('Control+A'); await type('01970');
await click(...P.save, 1200);   // don't save the card to Link
await click(...P.zip);
await page.screenshot({ path: 'ui-stripe-filled.png' });
await page.keyboard.press('Enter');
await page.waitForURL(/localhost:8799/, { timeout: 45000 }).catch(() => console.log('NO RETURN from Stripe — see ui-stripe-filled.png'));
await page.waitForFunction(() => window.currentUser && !document.getElementById('boot-splash'), null, { timeout: 40000 }).catch(() => {});
await page.waitForTimeout(7000);
console.log('back in app:', page.url(), '| toasts:', JSON.stringify(await toasts(page)));
console.log((await saleText(page)).split('\n').slice(0, 22).join('\n'));
await page.screenshot({ path: 'ui-after-pay.png' });
console.log('errors', JSON.stringify(errs));
await browser.close();
