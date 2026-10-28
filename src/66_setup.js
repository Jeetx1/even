/* =====================================================================
   SETUP, FILE MENU, IMPORT, EXPORT (interface rebuilt on the Design Lab kit, 25.10.2026)
   Accounts, Structure, Statement settings and Years and closings; the file menu and the export and import dialogs.
   Every change goes through aendere(), so one undo takes it back.
   ===================================================================== */
const BEREICHE = [
  { v: 'A|UV', t: 'Balance sheet: current assets' }, { v: 'A|AV', t: 'Balance sheet: non-current assets' },
  { v: 'P|KFK', t: 'Balance sheet: short-term liabilities' }, { v: 'P|LFK', t: 'Balance sheet: long-term liabilities' },
  { v: 'P|EK', t: 'Balance sheet: equity' }, { v: 'E|-1', t: 'Income statement: income' }, { v: 'E|1', t: 'Income statement: expense' }];
const tagDesJahres = () => heute().slice(0, 4) === String(state.jahr) ? heute() : state.jahr + '-12-31';
const optionen = (liste, wert) => liste.map(o => h('option', { value: o[0], selected: String(o[0]) === String(wert) ? true : null }, [o[1]]));
const zelle = (el, kl) => h('td', { class: kl || null }, [el]);
const kleinInput = (wert, attrs) => h('input', Object.assign({ class: 'input ev-cell', value: wert == null ? '' : wert, autocomplete: 'off' }, attrs));
const kleinSelect = (opts, attrs) => h('span', { class: 'select-wrap' }, [h('select', Object.assign({ class: 'select ev-cell' }, attrs), opts)]);
const karteLeer = (t, s) => h('div', { class: 'empty' }, [h('h3', { class: 'empty__title' }, [t]), s ? h('p', { class: 'empty__text' }, [s]) : null]);
const tabelle = (kopf, zeilen, kl) => h('div', { class: 'ev-scroll' }, [h('table', { class: 'table ev-setup' + (kl ? ' ' + kl : '') }, [
  h('thead', {}, [h('tr', {}, kopf.map(k => h('th', { class: k[1] || null }, [k[0] ? h('span', { class: 'th-sort' }, [k[0]]) : null])))]), h('tbody', {}, zeilen)])]);
function gruppeFuerNummer(nr){ const n = parseFloat(nr); const g = state.gruppen.find(x => (x.r || []).some(r => n >= r[0] && n < r[1])); return g ? g.c : null; }

/* ================================================================ ACCOUNTS */
const ktOffen = {};
let ktSuche = '', ktNurBenutzt = false;
function renderKontenSeite(){
  const bis = tagDesJahres(), salden = E.saldoPer(state, bis), benutzt = {}, sonst = {};
  state.buchungen.forEach(b => b.z.forEach(z => { benutzt[z[0]] = (benutzt[z[0]] || 0) + 1; }));
  /* an account can only be deleted when nothing uses it: no booking line, no imported closing, no fixed asset, no system account */
  const nenne = (nr, was) => { if (!nr) return; const l = sonst[nr] = sonst[nr] || []; if (l.indexOf(was) < 0) l.push(was); };
  (state.vergleichsjahre || []).forEach(v => Object.keys(v.salden || {}).forEach(nr => nenne(nr, 'imported closing ' + v.jahr)));
  (state.anlagen || []).forEach(a => [a.konto, a.wb, a.aufwand, a.abgang && a.abgang.konto].forEach(nr => nenne(nr, 'fixed asset “' + a.text + '”')));
  Object.keys(state.einstellungen || {}).forEach(k => nenne(state.einstellungen[k], 'system account'));
  const alle = kontenSortiert(), q = norm(ktSuche.trim()), wl = Object.keys(state.kurse || {});
  $('#eyebrow').textContent = alle.length + ' accounts in ' + state.gruppen.length + ' groups · balances at ' + dateLong(bis);
  const grpSel = $('#kt-grp'), sig = state.gruppen.map(g => g.c + ':' + g.t).join('|');          // the file's groups (another file, a new group)
  if (grpSel.dataset.sig !== sig){ const war = grpSel.value; grpSel.innerHTML = ''; state.gruppen.forEach(g => grpSel.appendChild(h('option', { value: g.c }, [g.t]))); grpSel.dataset.sig = sig; if (war && ix.gm[war]) grpSel.value = war; }
  const box = $('#kt-liste'); box.innerHTML = '';
  let gezeigt = 0;
  state.gruppen.forEach(g => {
    const konten = alle.filter(k => k.grp === g.c && (!ktNurBenutzt || benutzt[k.nr] || Math.abs(salden[k.nr] || 0) > .005)
      && (!q || k.nr.indexOf(ktSuche.trim()) === 0 || norm(k.name).indexOf(q) >= 0 || norm(g.t).indexOf(q) >= 0));
    if (!konten.length) return;
    gezeigt += konten.length;
    const vz = g.s === 'P' || (g.s === 'E' && g.vz < 0) ? -1 : 1, summe = E.r2(konten.reduce((s, k) => s + vz * (salden[k.nr] || 0), 0));
    const zeilen = konten.map(k => {
      const wert = E.r2(vz * (salden[k.nr] || 0)), bil = g.s !== 'E';
      const name = kleinInput(k.name, { 'aria-label': 'Name of ' + k.nr, onchange: e => {
        const v = e.target.value.trim(); if (!v){ toast('The name cannot be empty.', { type: 'error' }); e.target.value = k.name; return; }
        if (aendere('Account ' + k.nr + ' renamed', () => { const x = state.konten.find(y => y[0] === k.nr); x[1] = v; })) toast('Account ' + k.nr + ' renamed.', { action: { text: 'Undo', fn: rueckgaengig } }); } });
      const grp = kleinSelect(state.gruppen.map(x => h('option', { value: x.c, selected: x.c === k.grp ? true : null }, [x.t])), { 'aria-label': 'Group of ' + k.nr, onchange: e => {
        if (aendere('Account ' + k.nr + ' moved', () => { const x = state.konten.find(y => y[0] === k.nr); while (x.length <= 2) x.push(null); x[2] = e.target.value; })){
          ktOffen[e.target.value] = true; render(false); toast(k.nr + ' moved to ' + (ix.gm[e.target.value] || {}).t + '.', { action: { text: 'Undo', fn: rueckgaengig } }); } } });
      const wkz = bil ? kleinSelect(optionen([['', state.waehrung]].concat(wl.map(w => [w, w])), k.wkz || ''), { 'aria-label': 'Currency of ' + k.nr, onchange: e => {
        aendere('Currency of ' + k.nr + ' changed', () => { const x = state.konten.find(y => y[0] === k.nr); while (x.length <= 4) x.push(null); x[4] = e.target.value || null; }); } }) : '';
      const weg = benutzt[k.nr] ? h('span', { class: 'ev-used', title: benutzt[k.nr] + ' booking lines' + (sonst[k.nr] ? '; ' + sonst[k.nr].join(', ') : '') }, [String(benutzt[k.nr])])
        : sonst[k.nr] ? h('span', { class: 'ev-used', title: 'Used by: ' + sonst[k.nr].join(', ') }, [String(sonst[k.nr].length)])
        : h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Delete account ' + k.nr, title: 'Delete (never used)', html: icon('x', 14), onclick: () => {
          if (aendere('Account ' + k.nr + ' deleted', () => { state.konten = state.konten.filter(x => x[0] !== k.nr); })){ render(false); toast('Account ' + k.nr + ' deleted.', { action: { text: 'Undo', fn: rueckgaengig } }); } } });
      return h('tr', {}, [h('td', { class: 'nr' }, [k.nr]), zelle(name, 'ev-w-name'), zelle(grp, 'ev-w-grp'), zelle(wkz || h('span', { class: 'ev-fx' }, ['–']), 'ev-w-cur'),
        h('td', { class: 'num' + (wert < -0.005 ? ' neg' : '') }, [Math.abs(wert) < .005 ? '–' : tsd(wert, 2)]), h('td', { class: 'a' }, [weg])]);
    });
    const sicht = q ? Object.assign({}, ktOffen, { [g.c]: true }) : ktOffen;
    box.appendChild(monatsGruppeFrei(g.c, sicht, ktOffen, g.t, [h('span', { class: 'group__meta' }, [konten.length + (konten.length === 1 ? ' account' : ' accounts') + ' · ' + (BEREICHE.find(b => b.v === g.s + '|' + (g.s === 'E' ? String(g.vz === -1 ? -1 : 1) : g.sek)) || { t: '' }).t.replace(/^.*?: /, '')]),
      h('span', { class: 'group__sum' }, [tsd(summe, 2)])],
      h('div', { class: 'group__body' }, [tabelle([['No.'], ['Name'], ['Group'], ['Currency'], ['Balance', 'num'], ['', 'a']], zeilen, 'ev-accounts')])));
  });
  if (!gezeigt) box.appendChild(h('div', { class: 'card' }, [karteLeer('No account found', ktSuche ? 'No account matches “' + ktSuche + '”.' : 'No account in use yet.')]));
  renderSystemkonten(); renderWaehrungen();
}
/* a group that opens (the Journal's look) with its own title; the open state lives in `merk`, the view may differ (a search opens all) */
function monatsGruppeFrei(key, sicht, merk, titel, kopf, koerper){
  const auf = !!sicht[key], g = h('div', { class: 'group' + (auf ? ' is-open' : ''), 'data-key': key });
  const head = h('button', { type: 'button', class: 'group__head', 'aria-expanded': String(auf) }, [h('span', { class: 'chev' }), h('span', { class: 'group__title' }, [titel])].concat(kopf));
  head.onclick = () => { const neu = !g.classList.contains('is-open'); merk[key] = neu; g.classList.toggle('is-open', neu); head.setAttribute('aria-expanded', String(neu)); };
  g.appendChild(head); g.appendChild(koerper); return g;
}
function renderSystemkonten(){
  const ein = state.einstellungen;
  const sys = [['araJahr', 'Prepaid expenses within the year', 'Spreads of expenses run through here and end the year at zero'], ['ara', 'Prepaid expenses', 'The part of a spread that belongs to next year, moved here on 31.12.'],
    ['praJahr', 'Deferred income within the year', 'Spreads of income run through here and end the year at zero'], ['pra', 'Accrued expenses, deferred income', 'The part of an income spread that belongs to next year'],
    ['gewinnvortrag', 'Equity at the beginning', 'The opening balance takes equity and last year’s result'], ['kursgewinn', 'Currency gains', 'Revaluation'], ['kursverlust', 'Currency losses', 'Revaluation'],
    ['abgangGewinn', 'Gain on disposal', 'Fixed assets sold above book value'], ['abgangVerlust', 'Loss on disposal', 'Fixed assets sold or scrapped below book value']];
  /* each one picks from the chart of accounts; a number that is not in the chart stays visible until it is replaced */
  const konten = kontenSortiert();
  const zeilen = sys.map(x => { const nr = ein[x[0]] || (x[0] === 'abgangGewinn' ? '6815' : x[0] === 'abgangVerlust' ? '6810' : ''), ok = !!ix.km[nr];
    const opts = (ok ? [] : [h('option', { value: nr, selected: true }, [(nr || '–') + ' · not in the chart'])])
      .concat(konten.map(k => h('option', { value: k.nr, selected: k.nr === nr ? true : null }, [k.nr + ' · ' + k.name.slice(0, 60)])));
    return h('tr', {}, [h('td', { class: 'wrap-ok' }, [h('b', {}, [x[1]]), h('small', { class: 'ev-inv-acc' }, [x[2]])]),
      zelle(kleinSelect(opts, { class: 'select ev-cell' + (ok ? '' : ' is-bad'), 'aria-label': x[1], onchange: e => {
        const v = e.target.value;
        if (aendere(x[1] + ' set to ' + v, () => { state.einstellungen[x[0]] = v; })) render(false); } }), 'ev-w-grp'),
      h('td', { class: ok ? 'ev-fx' : 'neg' }, [ok ? '' : 'not in the chart'])]); });
  zeilen.push(h('tr', {}, [h('td', {}, [h('b', {}, ['Base currency'])]), zelle(kleinInput(state.waehrung, { 'aria-label': 'Base currency', style: { width: '92px' }, onchange: e => {
    if (aendere('Base currency changed', () => { state.waehrung = (e.target.value.trim() || 'CHF').toUpperCase(); })) render(false); } })), h('td')]));
  const box = $('#kt-system'); box.innerHTML = ''; box.appendChild(tabelle([['Purpose'], ['Account'], ['']], zeilen));
}
function renderWaehrungen(){
  const bis = tagDesJahres(), nb = E.neubewertung(state, ix, bis, state.kurse), box = $('#wa-liste'); box.innerHTML = '';
  const zeilen = Object.keys(state.kurse).map(w => h('tr', {}, [h('td', { class: 'nr' }, [w]),
    zelle(kleinInput(state.kurse[w], { class: 'input ev-cell num', inputmode: 'decimal', 'aria-label': 'Rate ' + w, style: { width: '110px' }, onchange: e => { const k = E.zahl(e.target.value);
      if (!(k > 0)){ toast('The rate must be a positive number.', { type: 'error' }); e.target.value = state.kurse[w]; return; }
      if (aendere('Rate ' + w + ' changed', () => { state.kurse[w] = k; })) render(false); } })),
    h('td', { class: 'a' }, [h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Remove ' + w, html: icon('x', 14), onclick: () => { if (aendere('Currency ' + w + ' removed', () => { delete state.kurse[w]; })) render(false); } })])]));
  const neu = kleinInput('', { placeholder: 'GBP', 'aria-label': 'New currency', style: { width: '76px' } }), kurs = kleinInput('', { class: 'input ev-cell num', placeholder: '1.12', 'aria-label': 'Its rate', style: { width: '110px' } });
  zeilen.push(h('tr', {}, [zelle(neu), zelle(kurs), h('td', { class: 'a' }, [h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => {
    const w = neu.value.trim().toUpperCase(), k = E.zahl(kurs.value);
    if (!/^[A-Z]{3}$/.test(w) || !(k > 0)){ toast('Enter a three-letter code and a positive rate.', { type: 'error' }); return; }
    if (aendere('Currency ' + w + ' added', () => { state.kurse[w] = k; })) render(false); } }, ['Add'])])]));
  box.appendChild(tabelle([['Currency'], ['Rate in ' + state.waehrung], ['', 'a']], zeilen));
  box.appendChild(h('h3', { class: 'ev-sub' }, ['Revaluation at ' + dateLong(bis)]));
  if (!nb.length){ box.appendChild(h('p', { class: 'note' }, ['No foreign-currency account with a balance.'])); return; }
  box.appendChild(tabelle([['Account'], ['In currency', 'num'], ['Book value', 'num'], ['New', 'num'], ['Difference', 'num']], nb.map(z => h('tr', {}, [
    h('td', {}, [h('span', { class: 'nr' }, [z.nr]), ' ' + z.name]), h('td', { class: 'num' }, [tsd(z.fw, 2) + ' ' + z.wkz]), h('td', { class: 'num' }, [tsd(z.buchwert, 2)]),
    h('td', { class: 'num' }, [tsd(z.neuwert, 2)]), h('td', { class: 'num' + (z.differenz < -0.005 ? ' neg' : '') }, [tsd(z.differenz, 2)])]))));
  const offen = nb.some(z => Math.abs(z.differenz) >= .005);
  box.appendChild(h('div', { class: 'ev-actions' }, [h('button', { type: 'button', class: 'btn btn--secondary btn--sm', disabled: offen ? null : true, onclick: () => {
    const ein = state.einstellungen, z = []; let diff = 0;
    nb.forEach(x => { if (Math.abs(x.differenz) < .005) return; diff = E.r2(diff + x.differenz);
      z.push({ k: x.nr, s: x.differenz > 0 ? zahlFmt(x.differenz) : '', h: x.differenz < 0 ? zahlFmt(-x.differenz) : '', t: '', fw: '', kurs: '' }); });
    z.push({ k: diff > 0 ? ein.kursgewinn : ein.kursverlust, s: diff < 0 ? zahlFmt(-diff) : '', h: diff > 0 ? zahlFmt(diff) : '', t: '', fw: '', kurs: '' });
    neuerEntwurf(); entwurf.modus = 'zeilen'; entwurf.datum = bis; entwurf.text = 'Revaluation of foreign currencies at ' + dateLong(bis); entwurf.z = z;
    zeige('buchen'); toast('Revaluation prepared in Book. Nothing is booked until you confirm.');
  } }, ['Prepare revaluation booking']), h('span', { class: 'note' }, [offen ? 'Opens in Book as lines; nothing is booked until you confirm.' : 'Nothing to revalue.'])]));
}

/* ================================================================ STRUCTURE */
function renderAufbauSeite(){
  $('#eyebrow').textContent = 'Groups, subtotals and labels of the statements';
  const anz = {}; E.konten(state).forEach(k => { anz[k.grp] = (anz[k.grp] || 0) + 1; });
  const aendereGruppe = (c, was, fn) => { if (aendere('Group ' + was, () => fn(state.gruppen.find(x => x.c === c)))) render(false); };
  const ordnung = c => h('span', { class: 'ev-order' }, [
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move up', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>', onclick: () => verschiebe(c, -1) }),
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move down', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>', onclick: () => verschiebe(c, 1) })]);
  const weg = c => anz[c] ? h('span', { class: 'ev-used', title: anz[c] + ' accounts' }, [String(anz[c])])
    : h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Delete group', html: icon('x', 14), onclick: () => { if (aendere('Group deleted', () => { state.gruppen = state.gruppen.filter(g => g.c !== c); })) render(false); } });
  const name = g => kleinInput(g.t, { 'aria-label': 'Name', onchange: e => { const v = e.target.value.trim(); if (!v){ toast('The name cannot be empty.', { type: 'error' }); e.target.value = g.t; return; } aendereGruppe(g.c, 'renamed', x => { x.t = v; }); } });
  const bil = state.gruppen.filter(g => g.s !== 'E').map(g => h('tr', {}, [zelle(ordnung(g.c)), zelle(name(g), 'ev-w-name'),
    zelle(kleinSelect(optionen(BEREICHE.filter(b => b.v.charAt(0) !== 'E').map(b => { const t = b.t.replace('Balance sheet: ', ''); return [b.v, t.charAt(0).toUpperCase() + t.slice(1)]; }), g.s + '|' + g.sek), { 'aria-label': 'Section', onchange: e => aendereGruppe(g.c, 'moved', x => { const t = e.target.value.split('|'); x.s = t[0]; x.sek = t[1]; }) }), 'ev-w-grp'),
    zelle(kleinSelect(optionen([['auto', 'automatic'], ['immer', 'always'], ['nie', 'never']], g.st || 'auto'), { 'aria-label': 'Show total', onchange: e => aendereGruppe(g.c, 'changed', x => { x.st = e.target.value; }) })),
    zelle(g.s === 'A' ? h('label', { class: 'switch switch--sm', title: 'Purchases on these accounts go to the fixed-asset register' }, [h('input', { type: 'checkbox', checked: g.anlage ? true : null, 'aria-label': 'Fixed assets',
      onchange: e => aendereGruppe(g.c, 'changed', x => { x.anlage = e.target.checked; }) })]) : ''), h('td', { class: 'a' }, [weg(g.c)])]));
  const erf = state.gruppen.filter(g => g.s === 'E').map(g => h('tr', {}, [zelle(ordnung(g.c)), zelle(name(g), 'ev-w-name'),
    zelle(kleinSelect(optionen([[-1, 'Income'], [1, 'Expense']], g.vz === -1 ? -1 : 1), { 'aria-label': 'Kind', onchange: e => aendereGruppe(g.c, 'changed', x => { x.vz = parseInt(e.target.value, 10); }) })),
    zelle(kleinInput(g.zwBlock || '', { placeholder: 'none', 'aria-label': 'Block total after', onchange: e => aendereGruppe(g.c, 'changed', x => { x.zwBlock = e.target.value.trim(); }) })),
    zelle(kleinInput(g.zw || '', { placeholder: 'none', 'aria-label': 'Running subtotal after', onchange: e => aendereGruppe(g.c, 'changed', x => { x.zw = e.target.value.trim(); }) })),
    h('td', { class: 'a' }, [weg(g.c)])]));
  const b = $('#gr-bilanz'), e = $('#gr-erfolg'); b.innerHTML = ''; e.innerHTML = '';
  b.appendChild(tabelle([['', 'ev-w-ord'], ['Name'], ['Section'], ['Show total'], ['Fixed assets'], ['', 'a']], bil));
  e.appendChild(tabelle([['', 'ev-w-ord'], ['Name'], ['Kind'], ['Block total after'], ['Running subtotal after'], ['', 'a']], erf));
  const sek = $('#gr-sek'); if (!sek.options.length) BEREICHE.forEach(x => sek.appendChild(h('option', { value: x.v }, [x.t])));
  const t = $('#gr-titel'); t.innerHTML = '';
  t.appendChild(tabelle([['Label'], ['Text']], Object.keys(state.sektionen).map(k => h('tr', {}, [h('td', { class: 'ev-fx' }, ['Section ' + k]), zelle(kleinInput(state.sektionen[k], { 'aria-label': 'Section ' + k,
    onchange: ev => { if (aendere('Label changed', () => { state.sektionen[k] = ev.target.value; })) render(false); } }), 'ev-w-name')]))
    .concat([['aktiven', 'Assets side'], ['passiven', 'Liabilities side'], ['ergebnis', 'Result line']].map(o => h('tr', {}, [h('td', { class: 'ev-fx' }, [o[1]]), zelle(kleinInput(state.titel[o[0]] || '', { 'aria-label': o[1],
      onchange: ev => { if (aendere('Label changed', () => { state.titel[o[0]] = ev.target.value; })) render(false); } }), 'ev-w-name')])))));
}
/* up or down within its own kind: income statement groups among themselves, balance sheet groups within their section */
function verschiebe(c, r){
  if (!aendere('Order changed', () => {
    const i = state.gruppen.findIndex(g => g.c === c), g = state.gruppen[i], passt = x => g.s === 'E' ? x.s === 'E' : (x.s !== 'E' && x.sek === g.sek);
    let j = i + r; while (j >= 0 && j < state.gruppen.length && !passt(state.gruppen[j])) j += r;
    if (j < 0 || j >= state.gruppen.length) return;
    state.gruppen.splice(i, 1); state.gruppen.splice(j, 0, g);
  })) return;
  render(false);
}

/* ================================================================ STATEMENT SETTINGS */
const CF_KLASSEN = [['cash', 'Cash'], ['opAsset', 'Operating (assets)'], ['opLiab', 'Operating (liabilities)'], ['invest', 'Investing'], ['finLiab', 'Financing (debt)'], ['equity', 'Financing (equity)']];
let cfAlle = false;
function renderFsSeite(){
  const K = stKern(), p = ST.p, c = ST.c, ov = Object.assign({}, (state.auswertung || {}).cfOverrides || {});
  K.S.cfOverrides = Object.assign({}, ov);
  $('#eyebrow').textContent = 'Cash flow between ' + K.periodLabel(c) + ' and ' + K.periodLabel(p) + ' (the reports chosen on the statement pages)';
  const cf = p !== c ? cfDirektZwischen(K, state, p, c) : null, fluss = {};
  if (cf) ['op', 'inv', 'fin', 'fx'].forEach(k => cf.bereiche[k].forEach(l => l.konten.forEach(o => { fluss[o.a] = o.v; })));
  const auto = a => { const o = K.S.cfOverrides[a]; delete K.S.cfOverrides[a]; const k = K.cfClassOf(a); if (o !== undefined) K.S.cfOverrides[a] = o; return k; };
  const zeile = (state.auswertung || {}).cfZeile || {}, isGruppen = K.IS.filter(n => n.k === 'g');
  const liste = K.allAccounts().filter(a => +a < 3000 && (cfAlle || ov[a] || zeile[a] || fluss[a] !== undefined));
  const setzeAw = (was, fn) => { if (aendere(was, () => { state.auswertung = state.auswertung || {}; fn(state.auswertung); })) render(false); };
  const zeilen = liste.map(a => {
    const k = K.cfClassOf(a), d = auto(a), eigen = ov[a] && ov[a] !== d;
    return h('tr', {}, [h('td', { class: 'nr' }, [a]), h('td', { class: 'wrap-ok' }, [K.nameOf(a)]),
      h('td', { class: 'num' }, [fluss[a] !== undefined ? K.fmt(fluss[a]) : k === 'cash' ? h('span', { class: 'ev-fx' }, ['cash']) : '–']),
      h('td', {}, [kleinSelect(CF_KLASSEN.map(([v, l]) => h('option', { value: v, selected: v === k ? true : null }, [l + (v === d && eigen ? ' (default)' : '')])), { 'aria-label': 'Cash flow section of ' + a,
        onchange: e => setzeAw('Cash flow class of ' + a + ' changed', aw => { aw.cfOverrides = Object.assign({}, aw.cfOverrides || {}); if (e.target.value === d) delete aw.cfOverrides[a]; else aw.cfOverrides[a] = e.target.value; }) }),
        eigen ? h('span', { class: 'chip ev-chip-sm' }, ['set']) : null]),
      h('td', {}, [k === 'opAsset' || k === 'opLiab' ? kleinSelect([h('option', { value: '' }, ['its own group'])].concat(isGruppen.map(g => h('option', { value: g.id, selected: zeile[a] === g.id ? true : null }, [g.l]))), { 'aria-label': 'Shown under',
        onchange: e => setzeAw('Cash flow: ' + a + ' shown under ' + (e.target.value ? (K.GROUPS[e.target.value] || {}).l : 'its own group'), aw => { aw.cfZeile = Object.assign({}, aw.cfZeile || {}); if (e.target.value) aw.cfZeile[a] = e.target.value; else delete aw.cfZeile[a]; }) }) : ''])]);
  });
  const box = $('#fs-cf'); box.innerHTML = '';
  box.appendChild(liste.length ? tabelle([['Acct'], ['Name'], ['Cash flow', 'num'], ['Section'], ['Shown under']], zeilen) : karteLeer('No account with a cash flow', 'Switch on “Show every account” to set a class in advance.'));
  /* the investments: which pay-in and value accounts make up each one, and which go on the charts */
  const inv = K.investments(), cands = K.S.invKandidaten || [], ib = $('#fs-inv'); ib.innerHTML = '';
  const merke = (was, fn) => { const neu = JSON.parse(JSON.stringify(inv)); fn(neu); setzeAw(was, aw => { aw.investments = neu; }); };
  ib.appendChild(inv.length ? tabelle([['On charts'], ['Name'], ['Pay-in accounts'], ['Value adjustment']], inv.map((i, n) => h('tr', {}, [
    zelle(h('label', { class: 'check' }, [h('input', { type: 'checkbox', checked: i.include ? true : null, 'aria-label': 'On the charts: ' + i.label, onchange: e => merke(i.label + (e.target.checked ? ' on' : ' off') + ' the charts', x => { x[n].include = e.target.checked; }) })])),
    zelle(kleinInput(i.label, { 'aria-label': 'Name', onchange: e => merke('Investment renamed', x => { x[n].label = e.target.value.trim() || i.label; }) }), 'ev-w-name'),
    h('td', { class: 'nr' }, [i.pay.join(', ')]),
    zelle(kleinSelect([h('option', { value: '' }, ['— none, the balance is paid in —'])].concat(cands.map(a => h('option', { value: a, selected: i.adj.indexOf(a) >= 0 ? true : null }, [a + ' · ' + K.nameOf(a)]))), { 'aria-label': 'Value adjustment of ' + i.label,
      onchange: e => merke('Value account of ' + i.label + ' changed', x => { x[n].adj = e.target.value ? [e.target.value] : []; }) }), 'ev-w-grp')]))) : karteLeer('No investment account yet'));
}

/* ================================================================ YEARS AND CLOSINGS */
function renderVergleichSeite(){
  $('#eyebrow').textContent = 'Years in this file, imported closings and comparison files';
  const js = Object.keys(E.jahreMitBuchungen(state)).map(Number).sort((a, b) => b - a), box = $('#vg-jahre'); box.innerHTML = '';
  box.appendChild(js.length ? tabelle([['Year'], ['Bookings', 'num'], ['Opening'], ['Total assets', 'num'], ['Result', 'num'], ['Check'], ['Status'], ['', 'a']], js.map(j => {
    const b = E.bilanz(state, ix, j + '-01-01', j + '-12-31'), er = E.erfolg(state, ix, j + '-01-01', j + '-12-31'), eb = E.eroeffnung(state, j);
    const echt = state.buchungen.some(x => x.eb && String(x.datum).slice(0, 4) === String(j)), ok = Math.abs(b.differenz) < .005, zu = istGeschlossen(j);
    return h('tr', {}, [h('td', {}, [h('b', {}, [String(j)])]), h('td', { class: 'num' }, [String(state.buchungen.filter(x => String(x.datum).slice(0, 4) === String(j)).length)]),
      h('td', { class: 'ev-fx' }, [echt ? 'booked' : (eb ? 'from the ' + eb.quelle : 'none')]), h('td', { class: 'num' }, [tsd(b.aktiven.summe, 2)]),
      h('td', { class: 'num' + (er.ergebnis < -0.005 ? ' neg' : '') }, [tsd(er.ergebnis, 2)]),
      h('td', {}, [h('span', { class: 'chip ev-chip-sm ' + (ok ? 'is-ok' : 'is-bad') }, [ok ? 'balances' : 'off by ' + tsd(b.differenz, 2)])]),
      h('td', {}, [h('span', { class: 'chip ev-chip-sm ' + (zu ? '' : 'is-warn') }, [zu ? 'closed' : 'open'])]),
      h('td', { class: 'a' }, [zu ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => jahrOeffnen(j) }, ['Reopen'])
        : h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: () => jahrSchliessen(j) }, ['Close year'])])]);
  })) : karteLeer('No bookings yet'));
  /* Save to folder: which folders this browser remembers (Chrome or Edge on a computer) */
  const ord = $('#vg-ordner'); ord.innerHTML = '';
  if (!(FSA && Kit.folder.can)) ord.appendChild(h('div', { class: 'ev-offer ev-offer--info' }, [h('span', {}, ['Saving to folders needs Chrome or Edge on a computer. Here, use “Save dated copy” in the file menu now and then.'])]));
  else {
    const name = h('b', { id: 'vg-bname' }, ['checking …']);
    ord.appendChild(h('div', { class: 'ev-offer ev-offer--info' }, [h('span', {}, ['Save to folder: ', name]),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', id: 'vg-bwahl', onclick: ordnerDialog }, ['Folders …'])]));
    (async () => { const a = await Kit.folder.get(), b = await Kit.folder.backup();
      name.textContent = a ? '“' + a.name + '”' + (b ? ', the replaced files go to “' + b.name + '”' : ', no backup folder yet') : 'not set up (Save writes back into the opened file)'; })();
  }
  /* the comparison file: another accounting file, only read */
  const vb = $('#vg-vgl'); vb.innerHTML = '';
  if (vgl) vb.appendChild(h('div', { class: 'ev-offer ev-offer--info' }, [h('span', {}, ['Loaded: ', h('b', {}, [vgl.name]), ', financial year ' + vgl.state.jahr + ', ' + vgl.state.buchungen.length + ' bookings. The Years page shows it beside this file.']),
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm', id: 'vg-weg', onclick: () => { vgl = null; render(false); } }, ['Remove'])]));
  $('#vg-datei').textContent = vgl ? 'Open another comparison file' : 'Open comparison file';
  const vj = (state.vergleichsjahre || []).slice().sort((a, b) => b.jahr - a.jahr), li = $('#vg-liste'); li.innerHTML = '';
  li.appendChild(vj.length ? tabelle([['Year'], ['Source'], ['Imported'], ['Accounts', 'num'], ['Total assets', 'num'], ['Result', 'num'], ['Check'], ['', 'a']], vj.map(v => {
    const pr = E.pruefeSalden(v.salden, ix), ok = Math.abs(pr.differenz) < .005, oeb = E.jahreMitBuchungen(state)[v.jahr + 1] && !E.jahreMitBuchungen(state)[v.jahr];
    return h('tr', {}, [h('td', {}, [h('b', {}, [String(v.jahr)])]), h('td', { class: 'wrap-ok' }, [v.quelle]), h('td', { class: 'd' }, [dateLong(v.importiert)]), h('td', { class: 'num' }, [String(Object.keys(v.salden).length)]),
      h('td', { class: 'num' }, [tsd(pr.aktiven, 2)]), h('td', { class: 'num' }, [pr.mitErfolg ? tsd(pr.ergebnis, 2) : '–']),
      h('td', {}, [h('span', { class: 'chip ev-chip-sm ' + (ok ? 'is-ok' : 'is-bad') }, [ok ? 'balances' : 'off by ' + tsd(pr.differenz, 2)]), oeb ? h('span', { class: 'chip ev-chip-sm' }, ['opening ' + (v.jahr + 1)]) : null]),
      h('td', { class: 'a' }, [h('button', { type: 'button', class: 'btn btn--quiet-danger btn--sm', onclick: async () => {
        if (!await frage('Remove the closing ' + v.jahr + '?', 'The imported balances are removed from this file. Undo brings them back.', [{ text: 'Cancel', wert: false, art: 'leicht' }, { text: 'Remove', wert: true, art: 'gefahr' }])) return;
        if (aendere('Closing ' + v.jahr + ' removed', () => { state.vergleichsjahre = state.vergleichsjahre.filter(x => x.jahr !== v.jahr); })){ render(false); toast('Closing ' + v.jahr + ' removed.', { action: { text: 'Undo', fn: rueckgaengig } }); } } }, ['Remove'])])]);
  })) : karteLeer('No closing imported yet', 'Closing balance lists from Banana, Abacus, Excel or EVEN, for years without bookings in this file.'));
}
/* years close in order, the earliest first, and reopen the other way round: a closed year opens from the years before
   it, so none of those may still change */
async function jahrSchliessen(j){
  const davor = Object.keys(E.jahreMitBuchungen(state)).map(Number).filter(y => y < j && !istGeschlossen(y)).sort((a, c) => a - c);
  if (davor.length){ toast('Close ' + davor.join(', ') + ' first: ' + j + ' opens from ' + (davor.length > 1 ? 'those years' : 'that year') + ', so ' + (davor.length > 1 ? 'they have' : 'it has') + ' to be closed before it.', { type: 'error' }); return; }
  const b = E.bilanz(state, ix, j + '-01-01', j + '-12-31');
  const schief = E.kontrolle(state, ix).schief.filter(id => { const x = state.buchungen.find(y => y.id === id); return x && String(x.datum).slice(0, 4) === String(j); });
  if (Math.abs(b.differenz) >= .005 || schief.length){ toast('Year ' + j + ' cannot be closed: ' + (schief.length ? schief.length + ' faulty booking(s).' : 'the balance sheet is off by ' + tsd(b.differenz, 2) + '.'), { type: 'error' }); return; }
  const checks = E.abschlussPruefung(state, ix, j), esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const liste = checks.length ? '<p class="ev-close-h"><b>Closing checklist, ' + checks.length + ' point' + (checks.length > 1 ? 's' : '') + ' to look at:</b></p><ul class="ev-close-list">' + checks.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><p class="note">You can close anyway and reopen the year later.</p>'
    : '<p class="ev-close-h"><span class="chip ev-chip-sm is-ok">Checklist clear</span> clearing accounts, in-year accruals, foreign currencies, spreads and balance signs are in order.</p>';
  const ok = await frage('Close the year ' + j + '?', 'Its bookings can then no longer be added, changed or deleted. The closing stays the opening of ' + (j + 1) + '. You can reopen the year here at any time.' + liste,
    [{ text: 'Cancel', wert: false, art: 'leicht' }, { text: checks.length ? 'Close anyway' : 'Close the year', wert: true, art: checks.length ? 'gefahr' : '' }]);
  if (!ok) return;
  if (aendere('Year ' + j + ' closed', () => { state.abgeschlossen = (state.abgeschlossen || []).filter(x => x !== j).concat([j]).sort((a, c) => a - c); }, { jahreFrei: true })){
    baueKontrollen(); render(false); toast('Year ' + j + ' closed.', { type: 'success', action: { text: 'Undo', fn: rueckgaengig } }); }
}
async function jahrOeffnen(j){
  const danach = (state.abgeschlossen || []).filter(y => y > j).sort((a, c) => c - a);
  if (danach.length){ toast('Reopen ' + danach.join(', ') + ' first: ' + (danach.length > 1 ? 'they open' : 'it opens') + ' from ' + j + ', so a change in ' + j + ' would change a closed year.', { type: 'error' }); return; }
  if (!await frage('Reopen the year ' + j + '?', 'Its bookings become changeable again. Every change also changes the opening balances of the following years.', [{ text: 'Cancel', wert: false, art: 'leicht' }, { text: 'Reopen', wert: true, art: 'gefahr' }])) return;
  if (aendere('Year ' + j + ' reopened', () => { state.abgeschlossen = (state.abgeschlossen || []).filter(x => x !== j); }, { jahreFrei: true })){ baueKontrollen(); render(false); toast('Year ' + j + ' reopened.', { action: { text: 'Undo', fn: rueckgaengig } }); }
}

/* ================================================================ IMPORT OF CLOSING BALANCES (rules in 22_engine_plus: saldenAusImport) */
function importDialog(){
  const imp = { zeilen: null, blaetter: null, quelle: '', analyse: null, zuordnung: {} };
  const text = h('textarea', { class: 'textarea', id: 'im-text', placeholder: 'Account\tName\tBalance\tPrior year\n1020\tBank account CHF\t2\'500.00\t1\'800.00', rows: 5 });
  const datei = h('input', { type: 'file', accept: '.xlsx,.csv,.txt,.tsv,text/csv,text/plain', hidden: true });
  const dateiname = h('small', { class: 'ev-fx' }), blatt = h('select', { class: 'select', id: 'im-blatt' }), blattBox = h('div', { class: 'field', hidden: true }, [h('label', { class: 'field__label', for: 'im-blatt' }, ['Sheet']), umschlag(blatt)]);
  const analyse = h('div', { class: 'ev-imp' }), ok = h('button', { type: 'button', class: 'btn btn--primary', disabled: true }, ['Import']);
  const inhalt = h('div', { class: 'ev-an' }, [h('div', { class: 'ev-an__grid ev-an__grid--2' }, [
    h('div', { class: 'field span2-phone' }, [h('label', { class: 'field__label', for: 'im-text' }, ['Cells copied from Excel']), text]),
    h('div', { class: 'field' }, [h('span', { class: 'field__label' }, ['Or a file']), h('button', { type: 'button', class: 'btn btn--secondary btn--sm ev-self-start', onclick: () => datei.click() }, ['Choose file (xlsx, csv, txt)']), dateiname, blattBox, datei])]), analyse]);
  const dlg = formular({ titel: 'Import closing balances', text: 'Paste a balance list or choose a file. Nothing is stored until the check passes and you confirm. The file never leaves this computer.', breit: true, inhalt,
    knoepfe: [h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => dlg.zu() }, ['Cancel']), 'spacer', ok] });
  const zuordnung = () => { const zu = {}; Object.keys(imp.zuordnung).forEach(nr => { const g = ix.gm[imp.zuordnung[nr]]; if (g) zu[nr] = { natur: (g.s === 'A' || (g.s === 'E' && g.vz !== -1)) ? 'soll' : 'haben', aktiv: g.s === 'A' }; }); return zu; };
  const berechne = spalte => { const extra = {}; Object.keys(imp.zuordnung).forEach(nr => { const g = ix.gm[imp.zuordnung[nr]]; if (g) extra[nr] = g; });
    const r = E.saldenAusImport(imp.analyse, spalte, imp.modus, ix, zuordnung()); r.pruefung = E.pruefeSalden(r.salden, ix, extra); return r; };
  function auswerten(){
    if (!imp.zeilen){ analyse.innerHTML = ''; ok.disabled = true; return; }
    const a = imp.analyse = E.analysiereSalden(imp.zeilen, ix);
    if (!a.ok){ analyse.innerHTML = ''; analyse.appendChild(h('div', { class: 'ev-check is-fehler' }, [h('span', { class: 'ev-check__i', html: icon('x', 12) }), h('span', {}, [a.fehler])])); ok.disabled = true; return; }
    if (imp.saldo === undefined || !a.zahlSpalten.some(s => s.idx === imp.saldo)) imp.saldo = a.vorschlagSaldo;
    if (imp.vorjahr === undefined) imp.vorjahr = a.vorschlagVorjahr;
    if (!imp.jahrManuell){ const t = (a.zahlSpalten.find(s => s.idx === imp.saldo) || {}).titel || '', m1 = /(\d{4})-\d{2}-\d{2}/.exec(t) || /\d{1,2}\.\d{1,2}\.(\d{4})/.exec(t), m2 = /(20\d{2})/.exec(imp.quelle || '');
      imp.jahr = m1 ? +m1[1] : (m2 ? +m2[1] : state.jahr - 1); }
    if (!imp.modus) imp.modus = E.besterModus(a, imp.saldo, ix, zuordnung());
    darstellen();
  }
  function darstellen(){
    const a = imp.analyse, haupt = berechne(imp.saldo), vj = imp.vorjahr >= 0 ? berechne(imp.vorjahr) : null;
    const unbekannt = haupt.unbekannt.concat(vj ? vj.unbekannt.filter(u => !haupt.unbekannt.some(x => x.nr === u.nr)) : []);
    const okH = Math.abs(haupt.pruefung.differenz) < .005, okV = !vj || Math.abs(vj.pruefung.differenz) < .005, hinweise = [];
    if (a.ignoriert.length) hinweise.push(a.ignoriert.length + ' group or total row(s) skipped (' + a.ignoriert.slice(0, 4).map(x => x.nr + (x.text ? ' ' + x.text : '')).join(', ') + (a.ignoriert.length > 4 ? ' …' : '') + ').');
    if (a.doppelt.length) hinweise.push('Listed twice and added up: ' + a.doppelt.join(', ') + '.');
    if (haupt.mehrStellen) hinweise.push(haupt.mehrStellen + ' amount(s) with more than two decimals. Check the number format.');
    const da = (state.vergleichsjahre || []).filter(v => v.jahr === imp.jahr || (vj && v.jahr === imp.jahr - 1)).map(v => v.jahr);
    if (da.length) hinweise.push('Replaces the imported closing ' + da.join(' and ') + '.');
    if (imp.jahr === state.jahr) hinweise.push('That is the current financial year of this file.');
    if (imp.jahr === state.jahr - 1 || (vj && imp.jahr - 1 === state.jahr - 1)) hinweise.push('The closing ' + (state.jahr - 1) + ' becomes the opening balance ' + state.jahr + ' of this file. Nothing is booked.');
    if (!haupt.pruefung.mitErfolg) hinweise.push('The list has no income statement accounts. The balance sheet difference counts as the result.');
    const spalten = sel => a.zahlSpalten.map(s => h('option', { value: s.idx, selected: s.idx === sel ? true : null }, [s.titel]));
    const sp = h('select', { class: 'select', id: 'im-sp', onchange: e => { imp.saldo = +e.target.value; imp.modus = E.besterModus(a, imp.saldo, ix, zuordnung()); auswerten(); } }, spalten(imp.saldo));
    const jahr = h('input', { class: 'input num', type: 'number', id: 'im-jahr', value: imp.jahr, onchange: e => { const j = parseInt(e.target.value, 10); if (j > 1900 && j < 2200){ imp.jahr = j; imp.jahrManuell = true; } darstellen(); } });
    const vjs = h('select', { class: 'select', id: 'im-vj', onchange: e => { imp.vorjahr = +e.target.value; darstellen(); } }, [h('option', { value: -1 }, ['none'])].concat(spalten(imp.vorjahr)));
    const modus = h('select', { class: 'select', id: 'im-modus', onchange: e => { imp.modus = e.target.value; darstellen(); } },
      optionen([['darstellung', 'As in the statements (assets +, others reversed)'], ['soll', 'Debit positive, credit negative'], ['betrag', 'All amounts positive'], ['haben', 'Credit positive, debit negative']], imp.modus));
    const pz = (j, r) => { const p = r.pruefung, gut = Math.abs(p.differenz) < .005;
      return h('tr', {}, [h('td', {}, [h('b', {}, [String(j)])]), h('td', { class: 'num' }, [tsd(p.aktiven, 2)]), h('td', { class: 'num' }, [tsd(p.passiven, 2)]), h('td', { class: 'num' }, [p.mitErfolg ? tsd(p.ergebnis, 2) : 'not included']),
        h('td', {}, [h('span', { class: 'chip ev-chip-sm ' + (gut ? 'is-ok' : 'is-bad') }, [gut ? 'balances' : 'off by ' + tsd(p.differenz, 2)])])]); };
    analyse.innerHTML = '';
    analyse.appendChild(h('h3', { class: 'ev-sub' }, ['Found ' + a.konten.length + ' accounts']));
    analyse.appendChild(h('div', { class: 'ev-an__grid' }, [feld('Closing balance', umschlag(sp)), feld('of the year', jahr), feld('Prior-year column', umschlag(vjs)), feld('Signs', umschlag(modus))]));
    analyse.appendChild(h('div', { class: 'ev-scroll ev-an-years' }, [h('table', { class: 'table' }, [h('thead', {}, [h('tr', {}, ['Year', 'Assets', 'Liabilities and equity', 'Result', ''].map((t, k) => h('th', { class: k && k < 4 ? 'num' : '' }, [h('span', { class: 'th-sort' }, [t])])))]),
      h('tbody', {}, [pz(imp.jahr, haupt)].concat(vj ? [pz(imp.jahr - 1, vj)] : []))])]));
    hinweise.forEach(t => analyse.appendChild(h('div', { class: 'ev-check is-info' }, [h('span', { class: 'ev-check__i', html: icon('info', 12) }), h('span', {}, [t])])));
    if (!okH || !okV) analyse.appendChild(h('label', { class: 'check' }, [h('input', { type: 'checkbox', checked: imp.trotzdem ? true : null, onchange: e => { imp.trotzdem = e.target.checked; darstellen(); } }), ' Import despite the difference (usually the sign setting is wrong or accounts are missing)']));
    if (unbekannt.length){
      analyse.appendChild(h('h3', { class: 'ev-sub' }, [unbekannt.length + ' account(s) not in the chart']));
      analyse.appendChild(h('div', { class: 'ev-scroll ev-an-years' }, [h('table', { class: 'table' }, [h('tbody', {}, unbekannt.map(u => h('tr', {}, [h('td', { class: 'nr' }, [u.nr]), h('td', {}, [u.name || '']), h('td', { class: 'num' }, [tsd(u.saldo, 2)]),
        zelle(kleinSelect([h('option', { value: '' }, ['do not import'])].concat(state.gruppen.map(g => h('option', { value: g.c, selected: imp.zuordnung[u.nr] === g.c ? true : null }, [g.t]))), { onchange: e => { if (e.target.value) imp.zuordnung[u.nr] = e.target.value; else delete imp.zuordnung[u.nr]; darstellen(); } }))])))])]));
      analyse.appendChild(h('p', { class: 'note' }, ['Choosing a group adds the account to the chart.']));
    }
    ok.disabled = !Object.keys(haupt.salden).length || !((okH && okV) || imp.trotzdem);
    ok.textContent = vj ? 'Import the closings ' + imp.jahr + ' and ' + (imp.jahr - 1) : 'Import the closing ' + imp.jahr;
    imp.ergebnis = { haupt, vj };
  }
  let timer = null;
  text.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { imp.zeilen = text.value.trim() ? E.leseTabelleText(text.value) : null; imp.quelle = 'Pasted list'; imp.saldo = imp.vorjahr = undefined; imp.modus = null; dateiname.textContent = ''; blattBox.hidden = true; auswerten(); }, 250); });
  datei.addEventListener('change', async () => {
    const file = datei.files[0]; if (!file) return;
    dateiname.textContent = file.name; imp.quelle = file.name; imp.saldo = imp.vorjahr = undefined; imp.modus = null;
    try {
      if (/\.xlsx$/i.test(file.name)){
        const bl = imp.blaetter = await E.leseXlsx(new Uint8Array(await file.arrayBuffer()));
        let best = 0, bestT = -1; bl.forEach((b, i) => { const x = E.analysiereSalden(b.zeilen, ix), t = x.ok ? x.konten.length : 0; if (t > bestT){ bestT = t; best = i; } });
        blatt.innerHTML = ''; bl.forEach((b, i) => blatt.appendChild(h('option', { value: i, selected: i === best ? true : null }, [b.name]))); blattBox.hidden = bl.length < 2; imp.zeilen = bl[best].zeilen;
      } else { imp.zeilen = E.leseTabelleText(await file.text()); blattBox.hidden = true; }
      text.value = ''; auswerten();
    } catch (err){ analyse.innerHTML = ''; analyse.appendChild(h('div', { class: 'ev-check is-fehler' }, [h('span', { class: 'ev-check__i', html: icon('x', 12) }), h('span', {}, [err.message])])); }
  });
  blatt.addEventListener('change', e => { imp.zeilen = imp.blaetter[+e.target.value].zeilen; imp.saldo = imp.vorjahr = undefined; imp.modus = null; auswerten(); });
  ok.onclick = () => {
    const r = imp.ergebnis, j = imp.jahr, quelle = imp.quelle || 'Pasted list';
    const neueKonten = Object.keys(imp.zuordnung).map(nr => { const k = imp.analyse.konten.find(x => x.nr === nr); return [nr, (k && k.name) || 'Account ' + nr, imp.zuordnung[nr], null, null]; });
    if (!aendere('Closing ' + j + ' imported', () => {
      neueKonten.forEach(k => { if (!state.konten.some(x => x[0] === k[0])) state.konten.push(k); });
      const setze = (jahr, salden) => { state.vergleichsjahre = (state.vergleichsjahre || []).filter(v => v.jahr !== jahr); state.vergleichsjahre.push({ jahr, quelle, importiert: heute(), salden }); };
      setze(j, r.haupt.salden); if (r.vj) setze(j - 1, r.vj.salden);
    })) return;
    dlg.zu(); render(false);
    toast('Closing ' + j + (r.vj ? ' and ' + (j - 1) : '') + ' imported and available as comparison.', { type: 'success', action: { text: 'Undo', fn: rueckgaengig } });
  };
  setTimeout(() => text.focus(), 40);
}

/* ================================================================ EXPORT */
function exportDialog(){
  const status = h('select', { class: 'select', id: 'ex-status' }, optionen([['entwurf', 'Draft'], ['definitiv', 'Final']], 'entwurf'));
  /* each button closes the dialog first, so the print dialog or the download stands alone */
  const k = (t, art, id, fn) => h('button', { type: 'button', class: 'btn btn--sm ' + art, id, onclick: () => { const s = status.value; dlg.zu(); fn(s); } }, [t]);
  const block = (titel, text, knoepfe) => h('div', { class: 'ev-ex' }, [h('h3', { class: 'ev-sub' }, [titel]), h('p', { class: 'note' }, [text]), h('div', { class: 'ev-actions' }, knoepfe)]);
  const K = stKern();
  const inhalt = h('div', { class: 'ev-an' }, [feld('Status of the PDF reports', umschlag(status), { cls: 'ev-ex-status' }),
    block('Financial statements', 'Key figures, balance sheet, income statement, cash flow and investments: ' + K.periodLabel(ST.p) + ' compared with ' + K.periodLabel(ST.c) + '. Change the report on the statement pages.',
      [k('PDF detailed', 'btn--primary', 'ex-fs-pdf', s => fsBericht(false, s)), k('PDF summarized', 'btn--secondary', 'ex-fs-sum', s => fsBericht(true, s)), k('Excel', 'btn--secondary', 'ex-fs-xlsx', () => fsExcelExport())]),
    block('Twelve months', 'Income statement per month and balance sheet at each month end, January to December ' + state.jahr + '.',
      [k('Excel', 'btn--secondary', 'ex-mo-xlsx', () => monateExcel()), k('PDF', 'btn--secondary', 'ex-mo-pdf', s => monatePdf(s))]),
    block('Ledger, every account', 'The full year ' + state.jahr + ': every account with a balance or a movement, each with its opening balance, every entry with its contra account and its closing balance. The Excel is one table to filter by account.',
      [k('Excel', 'btn--secondary', 'ex-hb-xlsx', () => alleKontenExcel()), k('PDF', 'btn--secondary', 'ex-hb-pdf', s => alleKontenPdf(s))])]);
  const dlg = formular({ titel: 'Export', inhalt, knoepfe: ['spacer', h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => dlg.zu() }, ['Close'])] });
  dlg.m.closest('.overlay').id = 'dlg-export';
}

/* ================================================================ FILE MENU (the kit menu #dmenu, opened above the ⋯ button) */
function dateiMenu(knopf){
  const menu = $('#dmenu');
  if (!menu.hidden){ pickerZu(); return; }
  pickerZu();
  menu.hidden = false;
  const r = knopf.getBoundingClientRect(), w = 240; menu.style.width = w + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  menu.classList.add('is-up'); menu.style.bottom = (window.innerHeight - r.top + 8) + 'px'; menu.style.top = 'auto'; menu.style.maxHeight = Math.max(200, r.top - 16) + 'px';
  picker = { input: knopf, menu, zu: () => { menu.hidden = true; }, platz: () => pickerZu() };       // a scroll closes it
  const erstes = menu.querySelector('.menu__item'); if (erstes) erstes.focus();
}

/* ================================================================ wiring */
function initSetup(){
  $('#kt-nr').addEventListener('input', e => { const g = gruppeFuerNummer(e.target.value.trim()); if (g) $('#kt-grp').value = g; });
  $('#kt-add').onclick = () => {
    const nr = $('#kt-nr').value.trim(), name = $('#kt-name').value.trim(), grp = $('#kt-grp').value;
    if (!/^\d{3,6}(\.\d{1,3})?$/.test(nr)){ toast('An account number has 3 to 6 digits, optionally with a sub-number like 1020.3.', { type: 'error' }); return; }
    if (!name){ toast('Enter a name.', { type: 'error' }); return; }
    if (ix.km[nr]){ toast('Account ' + nr + ' already exists.', { type: 'error' }); return; }
    if (aendere('Account ' + nr + ' added', () => { state.konten.push([nr, name, grp, null, null]); })){
      $('#kt-nr').value = ''; $('#kt-name').value = ''; ktOffen[grp] = true; render(false); toast('Account ' + nr + ' added.', { type: 'success', action: { text: 'Undo', fn: rueckgaengig } }); }
  };
  let t = null; $('#kt-suche').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { ktSuche = e.target.value; renderKontenSeite(); }, 140); });
  $('#kt-benutzt').onchange = e => { ktNurBenutzt = e.target.checked; renderKontenSeite(); };
  $('#kt-auf').onclick = () => { state.gruppen.forEach(g => { ktOffen[g.c] = true; }); renderKontenSeite(); };
  $('#kt-zu').onclick = () => { Object.keys(ktOffen).forEach(k => delete ktOffen[k]); renderKontenSeite(); };
  $('#gr-add').onclick = () => {
    const name = $('#gr-name').value.trim(); if (!name){ toast('Enter a name.', { type: 'error' }); return; }
    const t2 = $('#gr-sek').value.split('|'), code = 'G' + Date.now().toString(36).toUpperCase();
    if (aendere('Group added', () => { state.gruppen.push(t2[0] === 'E' ? { c: code, t: name, s: 'E', vz: parseInt(t2[1], 10), zw: '' } : { c: code, t: name, s: t2[0], sek: t2[1], st: 'auto' }); })){
      $('#gr-name').value = ''; render(false); toast('Group ' + name + ' added.', { type: 'success', action: { text: 'Undo', fn: rueckgaengig } }); }
  };
  $('#cf-alle').onchange = e => { cfAlle = e.target.checked; renderFsSeite(); };
  $('#fs-neu').onclick = async () => {
    if (!await frage('Detect the investments again?', 'Your labels, the accounts per investment and which go on the charts are reset to what the accounts suggest. Undo brings them back.', [{ text: 'Cancel', wert: false, art: 'leicht' }, { text: 'Detect again', wert: true, art: 'gefahr' }])) return;
    if (aendere('Investments detected again', () => { state.auswertung = Object.assign({}, state.auswertung || {}); delete state.auswertung.investments; })){ render(false); toast('Investments detected again from the accounts.', { action: { text: 'Undo', fn: rueckgaengig } }); }
  };
  $('#vg-import').onclick = importDialog;
  $('#vg-datei').onclick = async () => { if (await vergleichsdateiLaden()) render(false); };
  $('#fileMenu').onclick = e => { e.stopPropagation(); dateiMenu($('#fileMenu')); };
  $('#mandant').addEventListener('change', e => { const v = e.target.value.trim() || 'Untitled'; if (aendere('Name changed', () => { state.mandant = v; })) render(false); });
}
/* the line under the file name: are the books in balance (the app's check strip, in one line) */
function renderStatus(){
  const k = E.kontrolle(state, ix), b = E.bilanz(state, ix, state.jahr + '-01-01', state.jahr + '-12-31'), ok = Math.abs(k.diff) < .005 && !k.schief.length && Math.abs(b.differenz) < .005;
  const el = $('#pruefstreifen'); el.className = 'ev-status ' + (ok ? 'is-ok' : 'is-bad');
  el.textContent = ok ? 'Books in balance' : 'Please check: ' + (k.schief.length ? k.schief.length + ' faulty booking(s)' : 'difference ' + tsd(b.differenz || k.diff, 2));
  el.title = 'Debit = credit ' + tsd(k.soll, 2) + ' · balance sheet difference ' + tsd(b.differenz, 2) + ' · ' + state.jahr + (istGeschlossen(state.jahr) ? ' closed' : ' open');
  const m = $('#mandant'); if (document.activeElement !== m) m.value = state.mandant || '';
}
