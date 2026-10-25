// EVEN in Chromium: a sample file built from the app's own template, every look, desktop + phone, the main pages, menus.
// node tests/test_ui.js docs/index.html [screenshot folder] [looks] [pages]   (needs Playwright with Chromium)
const { chromium } = (() => { try { return require('playwright'); } catch (e){ return require('/opt/npm-tools/node_modules/playwright'); } })();
const fs = require('fs');
const FILE = 'file://' + require('path').resolve(process.argv[2]);
const OUT = process.argv[3] || require('path').join(__dirname, 'shots', 'ui');
const THEMES = (process.argv[4] || 'glass,ember,prism').split(',');
const PAGES = (process.argv[5] || 'uebersicht,buchen,journal,hauptbuch,bilanz,geldfluss,monate,ueberjahre,anlagen,sachanlagen,konten,vergleich').split(',');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const errors = [];
  for (const theme of THEMES){
    for (const [vp, touch, tag] of [[{ width: 1440, height: 920 }, false, 'desk'], [{ width: 390, height: 844 }, true, 'phone']]){
      const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: tag === 'desk' ? 1.5 : 2, hasTouch: touch, isMobile: touch });
      await ctx.addInitScript(t => { try { delete window.showOpenFilePicker; localStorage.setItem('dl.theme.accounting', t); } catch (e){} }, theme);
      const p = await ctx.newPage();
      p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(theme + ' ' + tag + ': ' + m.text()); });
      p.on('pageerror', e => errors.push(theme + ' ' + tag + ' PAGEERROR: ' + e.message));
      await p.route('**/fonts.googleapis.com/**', r => r.abort());
      await p.goto(FILE); await p.waitForTimeout(400);
      if (tag === 'desk') await p.screenshot({ path: OUT + '/' + theme + '-start.png' });
      const data = await p.evaluate(() => {
        const K = VORLAGE.konten.map(k => k[0]);
        const pick = re => K.find(k => re.test(k));
        const bank = pick(/^102/) || pick(/^10/), inc = pick(/^3/) || pick(/^6/), rent = pick(/^6/) || pick(/^4/), food = K.filter(k => /^6|^4/.test(k))[3] || rent;
        const cap = pick(/^28/) || pick(/^2/), inv = pick(/^14/) || pick(/^10/);
        const bu = []; let id = 1;
        const add = (d, t, s, hh, a) => bu.push({ id: id++, datum: d, beleg: '', text: t, z: [[s, a, 0], [hh, 0, a]] });
        add('2025-01-01', 'Opening capital', bank, cap, 42000);
        for (const y of [2025, 2026]) for (let m = 1; m <= (y === 2026 ? 10 : 12); m++){
          const mm = String(m).padStart(2, '0');
          add(y + '-' + mm + '-25', 'Salary', bank, inc, 8200 + (m % 3) * 150);
          add(y + '-' + mm + '-01', 'Rent', rent, bank, 1850);
          add(y + '-' + mm + '-12', 'Groceries', food, bank, 640 + m * 13);
          if (m % 4 === 0) add(y + '-' + mm + '-15', 'ETF purchase', inv, bank, 3000);
        }
        return JSON.stringify({ typ: 'buchhaltung', version: 5, mandant: 'Test Person', jahr: 2026, waehrung: 'CHF', kurse: VORLAGE.kurse, konten: VORLAGE.konten, gruppen: VORLAGE.gruppen,
          buckets: VORLAGE.buckets, sektionen: VORLAGE.sektionen, titel: VORLAGE.titel, einstellungen: VORLAGE.einstellungen || {}, buchungen: bu, vergleichsjahre: [], abgeschlossen: [],
          ui: { tab: 'uebersicht', periode: 'J', ytd: false, vergleich: 'start' } });
      });
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#s-oeffnen')]);
      await fc.setFiles({ name: '2026-10-18_EVEN.json', mimeType: 'application/json', buffer: Buffer.from(data) });
      await p.waitForTimeout(1500);
      // a question may come up after opening (spreads); answer the last button
      for (let k = 0; k < 2; k++){ if (await p.$('#dlg-frage.on')){ await p.screenshot({ path: OUT + '/' + theme + '-' + tag + '-frage.png' }); await p.click('#fr-knoepfe button:first-child'); await p.waitForTimeout(400); } }
      for (const pg of (tag === 'desk' ? PAGES : ['uebersicht', 'buchen'])){
        if (tag === 'phone'){ await p.click('#menuknopf'); await p.waitForTimeout(450); if (pg === 'uebersicht') await p.screenshot({ path: OUT + '/' + theme + '-phone-nav.png' }); }
        await p.click('#nav button[data-tab="' + pg + '"]'); await p.waitForTimeout(1100);
        await p.screenshot({ path: OUT + '/' + theme + '-' + tag + '-' + pg + '.png' });
      }
      if (tag === 'desk'){
        await p.click('#look'); await p.waitForTimeout(300);
        await p.screenshot({ path: OUT + '/' + theme + '-desk-look.png' }); await p.keyboard.press('Escape');
        await p.click('#fileMenu'); await p.waitForTimeout(300);
        await p.screenshot({ path: OUT + '/' + theme + '-desk-menu.png' }); await p.keyboard.press('Escape');
        if (!(await p.$eval('#dmenu', m => m.hidden))) errors.push(theme + ' desk: Escape does not close the file menu');
      }
      await ctx.close();
    }
  }
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
