/* The interface checks, driven only through the DOM (the app runs inside one closure).
   Shared by tests/test_app.js (jsdom, CI) and a plain browser run, so they can be tried by hand too.
   env: { w, d, sleep(ms), check(cond, msg), openJson(text, name), lastBlob() -> {text, bin} of the last file written } */
'use strict';
async function runChecks(env, fixture){
  const { w, d, sleep, check } = env;
  const $ = s => d.querySelector(s), $$ = s => Array.prototype.slice.call(d.querySelectorAll(s));
  const fire = (el, typ, init) => el.dispatchEvent(typ === 'keydown' ? new w.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init))
                                                                      : new w.Event(typ, { bubbles: true }));
  const tippe = (sel, wert) => { const el = $(sel); el.focus(); el.value = wert; fire(el, 'input'); return el; };
  const tab = async id => { $('#nav button[data-tab="' + id + '"]').click(); await sleep(40); };
  const zeilen = xml => (xml.match(/<row /g) || []).length;
  const teile = b => {   // rows a booking gets in the flat Excel: one per split part, else one
    const soll = b.z.filter(z => (z[1] || 0) > (z[2] || 0)), haben = b.z.filter(z => (z[2] || 0) > (z[1] || 0));
    const einzel = soll.length === 1 && haben.length === 1 && !soll[0][5] && !haben[0][5];
    return einzel ? 1 : (soll.length === 1 ? haben.length : (haben.length === 1 ? soll.length : soll.length + haben.length));
  };

  /* 1. start screen and the neutral template */
  check($('#start').classList.contains('on'), 'start screen is shown');
  check(!!$('#s-oeffnen') && !!$('#s-neu'), 'start offers open and new');
  const V = w.VORLAGE;
  check(V && V.mandant === 'Your name', 'template owner is neutral ("Your name")');
  check(V && V.konten.length > 60, 'template has a chart of accounts');
  const nrn = V ? V.konten.map(k => k[0]) : [];
  check(V && ['ara', 'araJahr', 'pra', 'praJahr', 'gewinnvortrag', 'kursgewinn', 'kursverlust'].every(k => nrn.indexOf(V.einstellungen[k]) >= 0),
    'every account named in the template settings exists');
  check(['1020', '6810', '6815'].every(n => nrn.indexOf(n) >= 0), 'accounts the code falls back to exist (1020, 6810, 6815)');

  /* 2. open the synthetic file */
  await env.openJson(JSON.stringify(fixture), 'fixture.json');
  await sleep(60);
  check($('#shell').classList.contains('on'), 'app opens after loading the JSON');
  check($('#mandant').value === 'Test Person', 'owner from the file');

  /* 3. every page renders (Balance sheet, Income statement and Cash flow share one page) */
  const seiten = $$('#nav button').map(b => b.dataset.tab);
  check(seiten.length >= 15, 'navigation has all pages (' + seiten.length + ')');
  for (const id of seiten){
    await tab(id);
    const p = $('.ev-page.on'), soll = { erfolg: 'bilanz', geldfluss: 'bilanz' }[id] || id;
    check(p && p.dataset.page === soll && $$('.ev-page.on').length === 1 && p.textContent.trim().length > 0 && !p.querySelector('.ev-fehlerblatt'), 'page ' + id + ' renders');
  }

  /* 4. journal: months as groups (January on top), one row per booking, split parts below */
  await tab('journal');
  const im2026 = fixture.buchungen.filter(b => b.datum.slice(0, 4) === '2026');
  const monate = $$('#jo-liste .group[data-monat]');
  check(monate.length === 10, '10 months in the 2026 journal');
  check(monate.length && monate[0].dataset.monat === '2026-01', 'January on top');
  const maerz = $('#jo-liste .group[data-monat="2026-03"]');
  check(maerz && maerz.querySelectorAll('tbody tr:not(.z)').length === im2026.filter(b => b.datum.slice(0, 7) === '2026-03').length, 'March: one row per booking');
  check(maerz && maerz.querySelectorAll('tr.z').length === 2, 'March: the split booking shows its two parts');
  $('#jo-zu').click(); await sleep(10);
  check(!$('#jo-liste .group.is-open'), 'Collapse all closes every month');
  $('#jo-auf').click(); await sleep(10);
  check($$('#jo-liste .group.is-open').length === 10, 'Expand all opens every month');

  /* 5. journal exports: exactly the window of the page head; flat Excel with a filter, landscape PDF */
  check(/2026/.test($('#jo-export').textContent), 'the export names the window (' + $('#jo-export').textContent + ')');
  $('#jo-xlsx').click(); await sleep(30);
  let x = await env.lastBlob();
  check(x.bin.slice(0, 2) === 'PK', 'journal Excel is an xlsx (zip)');
  check(/<autoFilter ref="A1:J\d+"\/>/.test(x.bin), 'journal Excel has a filter on the header');
  check(zeilen(x.bin) === 1 + im2026.reduce((s, b) => s + teile(b), 0), 'journal Excel: header plus one row per booking or split part, no blank or total rows');
  check(/<c r="A2" s="11"><v>\d+<\/v><\/c>/.test(x.bin), 'journal Excel: dates are real dates');
  const per = $('#periodSel'); per.value = 'M03'; fire(per, 'change'); await sleep(30);
  check($('#jo-export').textContent === 'March 2026', 'the period March: the export covers March 2026');
  $('#jo-pdf').click(); await sleep(30);
  const bericht = $('#bericht');
  check(/size:A4 landscape/.test(bericht.innerHTML), 'journal PDF is landscape');
  check(bericht.querySelectorAll('table.linie').length === 1 && /Weekend trip/.test(bericht.textContent), 'journal PDF: March with its bookings');
  per.value = 'J'; fire(per, 'change'); await sleep(30);

  /* 6. ledger exports: the account on screen over the window */
  await tab('hauptbuch');
  check(/1020/.test($('#hb-konto').value) && $('#hb-export').textContent === $('#jo-export').textContent, 'ledger: 1020 over the same window');
  $('#hb-xlsx').click(); await sleep(30);
  x = await env.lastBlob();
  const auf1020 = im2026.reduce((s, b) => s + b.z.filter(z => z[0] === '1020').length, 0);
  check(/<autoFilter ref="A1:I\d+"\/>/.test(x.bin), 'ledger Excel has a filter on the header');
  check(zeilen(x.bin) === 2 + auf1020, 'ledger Excel: header, opening balance and every entry on 1020 (' + auf1020 + ')');
  $('#hb-pdf').click(); await sleep(30);
  check(/Ledger 1020/.test($('#bericht').textContent) && /landscape/.test($('#bericht').innerHTML), 'ledger PDF, landscape');
  check($$('#hb-inhalt .group[data-monat]').length >= 1 && /Opening balance/.test($('#hb-inhalt').textContent) && /Closing balance/.test($('#hb-inhalt').textContent), 'ledger: months as groups between opening and closing');

  /* 7. book: text suggestion, ready state, the booking lands in the latest list */
  await tab('buchen');
  tippe('#bu-datum', '14.10.2026');
  const text = tippe('#bu-text', 'Super');
  fire(text, 'keydown', { key: 'ArrowDown' }); await sleep(10);
  const vorschlag = $('.ev-pick--text');
  check(vorschlag && /Supermarket, groceries/.test(vorschlag.textContent), 'typing proposes earlier booking texts');
  fire(text, 'keydown', { key: 'Enter' }); await sleep(10);
  check(text.value === 'Supermarket, groceries', 'Enter takes the proposed text');
  check(/^\d/.test($('#bu-soll').value) && /^\d/.test($('#bu-haben').value), 'the proposed text brings its debit and credit account');
  $('#bu-reset').click(); await sleep(10);
  tippe('#bu-datum', '14.10.2026');
  tippe('#bu-text', 'Test booking from the tests');
  tippe('#bu-betrag', '123.45');
  fire(tippe('#bu-soll', '4000'), 'keydown', { key: 'Tab' });    // Tab picks the account from the list
  fire(tippe('#bu-haben', '1020'), 'keydown', { key: 'Tab' });
  await sleep(10);
  check(/Balance/.test($('#bu-verlauf-saldo').textContent), 'picking an account shows its balance in the recent panel');
  check(!$('#bu-ok').disabled && $('#bu-ok').classList.contains('is-ready'), 'Book button is active and marked ready');
  $('#bu-ok').click(); await sleep(60);
  const erste = $('#bu-letzte tbody tr');
  check(erste && /Test booking from the tests/.test(erste.textContent), 'new booking is first in Latest bookings');
  check(/Recent on 1020/.test($('#bu-verlauf-titel').textContent) && /Balance/.test($('#bu-verlauf-saldo').textContent), 'after booking, the recent panel stays on the last account with its balance');

  /* 7b. undo and redo from the file menu; the menu opens and closes at its button */
  const anzahl = () => w.__buha.state.buchungen.length, vorher = anzahl();
  $('#fileMenu').click(); await sleep(10);
  check(!$('#dmenu').hidden && $$('#dmenu [data-aktion]:not([data-aktion="diag"])').length === 12, 'the file menu opens with its 12 entries');
  $('#fileMenu').click(); await sleep(10);
  check($('#dmenu').hidden, 'a second click closes it');
  $('#dmenu [data-aktion="undo"]').click(); await sleep(30);
  check(anzahl() === vorher - 1, 'Undo takes the booking back');
  $('#dmenu [data-aktion="redo"]').click(); await sleep(30);
  check(anzahl() === vorher && /Save/.test($('#speichern').textContent), 'Redo brings it again; Save shows the unsaved change');

  /* 7c. the question dialog: deleting asks, Cancel keeps the booking */
  $('#bu-letzte tbody tr').click(); await sleep(30);
  check(!$('#bu-del').hidden && /Edit booking/.test($('#bu-titel').textContent), 'a click in Latest bookings opens it for editing');
  $('#bu-del').click(); await sleep(20);
  const knoepfe = $$('#dlg-frage.on #fr-knoepfe button');
  check(knoepfe.length === 2 && knoepfe[0].textContent === 'Cancel' && /btn--danger/.test(knoepfe[1].className), 'Delete asks: Cancel, then Delete in red');
  knoepfe[0].click(); await sleep(20);
  check(!$('#dlg-frage').classList.contains('on') && anzahl() === vorher, 'Cancel keeps the booking');
  $('#bu-reset').click(); await sleep(10);

  /* 7d. the statements: in balance, the result ties, the cash flow matches */
  for (const id of ['bilanz', 'erfolg', 'geldfluss']){
    await tab(id);
    const c = $('#st-check .ev-check');
    check(c && c.classList.contains('is-ok'), id + ': the check line is clear (' + (c ? c.textContent : 'none') + ')');
  }
  await tab('monate');
  $('#mo-zu').click(); await sleep(10);
  check(!$('[data-page="monate"] tr.is-group.has-kids.is-open'), 'Twelve months: Collapse all');
  $('#mo-auf').click(); await sleep(10);
  check($$('[data-page="monate"] tr.is-group.has-kids').length > 0 && !$('[data-page="monate"] tr.is-group.has-kids:not(.is-open)'), 'Twelve months: Expand all');

  /* 7e. Book: Tab out of the credit field with one side empty opens the split at once (the browser's own Tab would
     first jump to a field far down the page) */
  await tab('buchen');
  $('#bu-reset').click(); await sleep(10);
  tippe('#bu-betrag', '50');
  fire(tippe('#bu-soll', '4000'), 'keydown', { key: 'Tab' }); await sleep(10);
  const haben = $('#bu-haben'); haben.focus();
  const tabEv = new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); haben.dispatchEvent(tabEv); await sleep(10);
  check(tabEv.defaultPrevented && !$('#bu-split').hidden && d.activeElement && d.activeElement.dataset.sp === '0', 'Tab with the credit side empty: the split opens and takes the focus, nothing else');
  $('#bu-reset').click(); await sleep(10);
  /* Tab out of the form's last field goes to Book (Safari skips buttons on Tab and went to the recent bookings far down) */
  const tabAus = sel => { const el = $(sel); el.focus(); const ev = new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev; };
  tippe('#bu-betrag', '50');
  fire(tippe('#bu-soll', '4000'), 'keydown', { key: 'Tab' }); fire(tippe('#bu-haben', '1020'), 'keydown', { key: 'Tab' }); await sleep(10);
  let tabEv2 = tabAus('#bu-haben'); await sleep(10);
  check(tabEv2.defaultPrevented && d.activeElement === $('#bu-ok') && $('#bu-split').hidden, 'Tab from a filled credit field goes to Book, nothing else');
  $('#vt-an').click(); await sleep(10);
  tabEv2 = tabAus('#bu-haben');
  check(!$('#vt-panel').hidden && !tabEv2.defaultPrevented, 'with the spread switched on, Tab from credit moves on to its fields');
  tabEv2 = tabAus('#vt-monate'); await sleep(10);
  check(tabEv2.defaultPrevented && d.activeElement === $('#bu-ok'), 'Tab from the spread’s last field goes to Book');
  /* and on through the card's buttons, round to the first field; Shift+Tab back */
  tabEv2 = tabAus('#bu-ok');
  check(tabEv2.defaultPrevented && d.activeElement === $('#bu-reset'), 'Tab from Book goes to Clear (Copy and Delete are hidden for a new booking)');
  tabEv2 = tabAus('#bu-reset');
  check(tabEv2.defaultPrevented && d.activeElement === $('#bu-datum'), 'Tab from the card’s last button goes round to Date');
  $('#bu-reset').focus(); tabEv2 = new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }); $('#bu-reset').dispatchEvent(tabEv2);
  check(tabEv2.defaultPrevented && d.activeElement === $('#bu-ok'), 'Shift+Tab from Clear goes back to Book');
  $('#bu-reset').click(); await sleep(10);
  $('#bu-letzte tr[data-edit]').click(); await sleep(20);
  const reihe = [];
  for (let n = 0, el = $('#bu-ok'); n < 4 && el; n++){ reihe.push(el.id); tabAus('#' + el.id); el = d.activeElement; if (el === $('#bu-datum')){ reihe.push(el.id); break; } }
  check(reihe.join(' ') === 'bu-ok bu-kopie bu-reset bu-del bu-datum', 'editing a booking: Tab goes Book, Copy, Clear, Delete, then Date (' + reihe.join(' ') + ')');
  $('#bu-reset').click(); await sleep(10);

  /* 7f. the export dialog: the ledger of every account, the statements report with the app icon */
  $('#dmenu [data-aktion="export"]').click(); await sleep(20);
  $('#ex-hb-xlsx').click(); await sleep(40);
  x = await env.lastBlob();
  const st = w.__buha.state, E = w.__buha.E, ixx = E.ctx(st); let erwartet = 1, mitKonto = 0;
  E.konten(st).forEach(k => { const hb = E.hauptbuch(st, ixx, k.nr, st.jahr + '-01-01', st.jahr + '-12-31');
    if (hb.zeilen.length || Math.abs(hb.anfang) >= .005 || Math.abs(hb.ende) >= .005){ mitKonto++; erwartet += 2 + hb.zeilen.length; } });
  check(/<autoFilter ref="A1:M\d+"\/>/.test(x.bin) && zeilen(x.bin) === erwartet, 'ledger of every account as Excel: one table, per account opening, entries, closing (' + mitKonto + ' accounts)');
  $('#dmenu [data-aktion="export"]').click(); await sleep(20);
  $('#ex-hb-pdf').click(); await sleep(40);
  check($$('#bericht .rb-konto table.linie').length === mitKonto && /landscape/.test($('#bericht').innerHTML) && $('#bericht .rb-brand svg'), 'ledger of every account as PDF, landscape, the app icon, one table per account');
  const ohneKopf = () => /@top-left\{content:"\\00a0"\}@top-center\{content:"\\00a0"\}@top-right\{content:"\\00a0"\}/.test($('#bericht').innerHTML);
  check(ohneKopf(), 'ledger PDF: the top margin boxes are filled, so the browser prints no date and title row');
  const seitenRegeln = () => ($('#bericht').innerHTML.match(/@page\s*\{/g) || []).length;
  check(seitenRegeln() === 1 && /@page\{size:A4 landscape/.test($('#bericht').innerHTML), 'ledger of every account: one page rule, landscape (a second one would win)');
  await tab('hauptbuch'); $('#hb-pdf').click(); await sleep(40);
  check(ohneKopf() && $$('#bericht .rb-card').length === 4 && $('#bericht .rb-head svg') && /Ledger/.test($('#bericht .rb-eyebrow').textContent), 'one ledger as PDF in the report look: icon, four figure cards, no browser header');
  await tab('journal'); $('#jo-pdf').click(); await sleep(40);
  check(ohneKopf(), 'journal PDF: no browser header either');
  $('#dmenu [data-aktion="export"]').click(); await sleep(20);
  $('#ex-fs-pdf').click(); await sleep(60);
  check($('#bericht .rb-brand svg') && $$('#bericht .rb-head svg').length >= 3 && $$('#bericht .rb-card').length === 4 && /Financial statements/i.test($('#bericht .rb-eyebrow').textContent),
    'statements PDF: the EVEN icon on the cover and every page head, four figure cards');
  check(ohneKopf() && seitenRegeln() === 1 && /@page\{size:A4 portrait/.test($('#bericht').innerHTML), 'statements PDF: no browser header, one page rule, portrait');

  /* 7g. system accounts are chosen from the chart */
  await tab('konten');
  const sys = $$('#kt-system select');
  check(sys.length === 9 && sys[0].options.length >= E.konten(st).length && sys.every(s => s.value), 'system accounts: 9 dropdowns of the chart of accounts');

  /* 7h. copying an earlier booking brings its text and accounts, never the amount; the amount field takes the focus */
  await tab('buchen');
  $('#bu-reset').click(); await sleep(10);
  const rec = $('#bu-verlauf .ev-recent'); rec.click(); await sleep(30);
  check($('#bu-betrag').value === '' && /^\d/.test($('#bu-soll').value) && /^\d/.test($('#bu-haben').value) && $('#bu-text').value.length > 0,
    'Copy: text and accounts come along, the amount stays empty');
  check(d.activeElement === $('#bu-betrag'), 'Copy: the cursor waits in the amount field');
  $('#bu-reset').click(); await sleep(10);
  check(!!$('#bu-letzte table.ev-buchungen'), 'Latest bookings use the fixed-column booking table (the amount keeps its place)');

  /* 8. save: the file has the new booking and nothing else changed */
  $('#speichern').click(); await sleep(120);
  x = await env.lastBlob();
  let gespeichert = null; try { gespeichert = JSON.parse(x.text); } catch (e) {}
  check(gespeichert && gespeichert.buchungen.length === fixture.buchungen.length + 1, 'saved file has one booking more');
  check(gespeichert && gespeichert.mandant === 'Test Person' && gespeichert.konten.length === fixture.konten.length, 'owner and chart of accounts kept');
  check(gespeichert && gespeichert.buchungen.some(b => b.text === 'Test booking from the tests' && b.datum === '2026-10-14'), 'the new booking is in the file');

  /* 9. spread over months, then open the original booking again and move its first month */
  const spreadText = 'Annual subscription from the tests';
  const spreadZeilen = async () => { await tab('journal'); const s = $('#jo-suche'); s.value = spreadText; fire(s, 'input'); await sleep(250);
    return $$('#jo-liste tr[data-edit]').filter(tr => tr.textContent.indexOf(spreadText) >= 0); };
  await tab('buchen');
  tippe('#bu-datum', '15.03.2026'); tippe('#bu-text', spreadText); tippe('#bu-betrag', '120');
  fire(tippe('#bu-soll', '6620'), 'keydown', { key: 'Tab' }); fire(tippe('#bu-haben', '1020'), 'keydown', { key: 'Tab' });
  const an = $('#vt-an'); an.checked = true; fire(an, 'change');
  tippe('#vt-start', '2026-03'); tippe('#vt-monate', '12'); await sleep(10);
  check(/Book spread \(12 bookings\)/.test($('#bu-ok').textContent), 'spread over 12 months from March: base, 10 releases, carry-over');
  $('#bu-ok').click(); await sleep(60);
  let sz = await spreadZeilen();
  check(sz.length === 12, 'the spread is in the journal (12 bookings, got ' + sz.length + ')');
  const basisZeile = sz.find(tb => /Spread over 12 months/.test(tb.textContent));
  basisZeile.click(); await sleep(60);
  check($('#vt-an').checked && $('#vt-start').value === '2026-03' && $('#vt-monate').value === '12', 'the original booking opens with its spread plan');
  check(/^6620/.test($('#bu-soll').value) && $('#bu-betrag').value === '120.00', 'it opens as entered: expense account and amount, not the accrual account');
  tippe('#vt-start', '2026-05'); await sleep(10);
  check(/Save and spread anew \(10 bookings\)/.test($('#bu-ok').textContent), 'moving the first month to May: base, 8 releases, carry-over');
  $('#bu-ok').click(); await sleep(60);
  sz = await spreadZeilen();
  check(sz.length === 10, 'the old spread is replaced, not added to (10 bookings, got ' + sz.length + ')');
  const uebertrag = sz.find(tb => /carried into 2027/.test(tb.textContent));
  check(uebertrag && /40\.00/.test(uebertrag.textContent), 'four months (40.00) carried into 2027');

  /* 10. a fixed asset (build .4): its depreciation is labelled as depreciation, never as a spread, and editing it with
     an earlier year selected rebooks the later open year instead of emptying it */
  const knopfIm = t => $$('.overlay:not(.is-closing) .modal__actions button').find(b => b.textContent === t);
  await tab('journal'); { const s = $('#jo-suche'); s.value = ''; fire(s, 'input'); await sleep(250); }
  await tab('buchen');
  $('#bu-reset').click(); await sleep(10);
  tippe('#bu-datum', '10.03.2025'); tippe('#bu-text', 'Laptop from the tests'); tippe('#bu-betrag', '2400');
  fire(tippe('#bu-soll', '1500'), 'keydown', { key: 'Tab' }); fire(tippe('#bu-haben', '1020'), 'keydown', { key: 'Tab' }); await sleep(10);
  $('#bu-ok').click(); await sleep(700);
  const registrieren = knopfIm('Register and book');
  check(!!registrieren, 'a purchase on a fixed-asset account opens the register');
  if (registrieren) registrieren.click(); await sleep(80);
  const proJahr = () => w.__buha.state.buchungen.filter(b => b.plan && b.plan.rolle === 'abschreibung')
    .reduce((m, b) => { const j = b.datum.slice(0, 4); m[j] = (m[j] || 0) + 1; return m; }, {});
  check(proJahr()['2025'] === 10 && proJahr()['2026'] === 12, 'the register books the depreciation of 2025 and 2026 (' + JSON.stringify(proJahr()) + ')');
  await tab('journal');
  const abZeilen = () => $$('#jo-liste tr[data-edit]').filter(tr => /Laptop from the tests, depreciation/.test(tr.textContent));
  check(abZeilen().length === 12 && abZeilen().every(tr => /Depreciation \d+\/36/.test(tr.textContent) && !/Spread/.test(tr.textContent)),
    'Journal: depreciation is labelled “Depreciation n/36”, not as a spread');
  await tab('buchen');
  const pl = $$('#bu-plaene .ev-plan');
  check(pl.length === 1 && /Annual subscription from the tests/.test(pl[0].textContent) && !/unde|of 0 months/.test($('#bu-plaene').textContent),
    'Book: the spreads list shows the spread only, no fixed asset as a nameless spread');
  await tab('journal'); abZeilen()[0].click(); await sleep(60);
  check(/^Depreciation of “Laptop from the tests” \(month \d+ of 36\)/.test($('#bu-banner').textContent), 'Book: a depreciation booking says what it is (' + $('#bu-banner').textContent.slice(0, 50) + ' …)');
  $('#bu-del').click(); await sleep(20);
  const frageKnoepfe = $$('#dlg-frage.on #fr-knoepfe button');
  check($('#fr-titel').textContent === 'Delete this depreciation booking?' && frageKnoepfe.length === 2 && frageKnoepfe[0].textContent === 'Cancel',
    'deleting a depreciation booking asks about that one only, never about “the whole spread”');
  if (frageKnoepfe[0]) frageKnoepfe[0].click(); await sleep(20);
  $('#bu-reset').click(); await sleep(10);
  const jahrWahl = $('#yearSel'); jahrWahl.value = '2025'; fire(jahrWahl, 'change'); await sleep(40);
  await tab('sachanlagen');
  const bearbeite = $$('#sa-register button').find(b => b.textContent === 'Edit');
  if (bearbeite) bearbeite.click(); await sleep(60);
  const neuBuchen = knopfIm('Save and rebook');
  if (neuBuchen) neuBuchen.click(); await sleep(80);
  check(!!neuBuchen && proJahr()['2025'] === 10 && proJahr()['2026'] === 12, 'editing the asset with 2025 selected rebooks 2026 too, nothing is lost (' + JSON.stringify(proJahr()) + ')');
  jahrWahl.value = '2026'; fire(jahrWahl, 'change'); await sleep(40);

  /* 11. one save at a time (build .4): a change made while a save is writing stays unsaved; Save twice in a row gives no error */
  $$('#meldungen .toast').forEach(t => t.remove());
  const mandantFeld = $('#mandant'), nenne = t => { mandantFeld.value = t; fire(mandantFeld, 'change'); };
  nenne('Test Person, saved');
  $('#speichern').click(); nenne('Test Person, changed while saving');
  await sleep(400);
  x = await env.lastBlob(); let datei = null; try { datei = JSON.parse(x.text); } catch (e) {}
  check(datei && datei.mandant === 'Test Person, saved' && $('#speichern').textContent.trim() === 'Save', 'a change made while saving is not in the file and stays unsaved (Save keeps blinking)');
  $('#speichern').click(); $('#speichern').click(); await sleep(400);
  x = await env.lastBlob(); datei = null; try { datei = JSON.parse(x.text); } catch (e) {}
  check(datei && datei.mandant === 'Test Person, changed while saving' && $('#speichern').textContent.trim() === 'Saved' && !/Not saved|Could not save/.test($('#meldungen').textContent),
    'the next save puts it in; Save clicked twice in a row gives no error');
}
if (typeof module !== 'undefined') module.exports = runChecks;
