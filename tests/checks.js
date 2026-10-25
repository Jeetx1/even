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
  check(!$('#dmenu').hidden && $$('#dmenu [data-aktion]').length === 12, 'the file menu opens with its 12 entries');
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
}
if (typeof module !== 'undefined') module.exports = runChecks;
