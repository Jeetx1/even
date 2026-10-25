/* =====================================================================
   STATEMENTS (interface rebuilt on the Design Lab kit, 25.10.2026)
   Balance sheet, Income statement and Cash flow on the statements engine (FSKern, built by fsDaten from the bookings);
   Twelve months and Years on the books engine (E.monatsbericht, E.jahresvergleich). Which rows a statement has is the
   app's rule (abZeilen, gfZeilen, gfIndirekt); how they look: one statement sheet on the kit, with groups that open to
   their accounts, the change against the comparison, the check line, and a click from an account to its Ledger.
   ===================================================================== */

/* ---------------------------------------------------------------- report and comparison (as the app chooses them) */
const ST = { jahr: null, p: null, c: null, nullen: { bilanz: false, erfolg: false }, aenderung: true };
function stKern(){
  const K = fsDaten(state, ix, E, { jahr: state.jahr, p: ST.p, c: ST.c, zerosBS: ST.nullen.bilanz, zerosIS: ST.nullen.erfolg });
  const per = K.periods();
  if (ST.jahr !== state.jahr || per.indexOf(ST.p) < 0 || per.indexOf(ST.c) < 0){
    const d = fsStandard(state, state.jahr, heute());
    ST.jahr = state.jahr; ST.p = per.indexOf(d.p) >= 0 ? d.p : per[per.length - 1]; ST.c = per.indexOf(d.c) >= 0 ? d.c : per[0];
  }
  K.S.activePeriod = ST.p; K.S.comparePeriod = ST.c;
  state.ui.fs = { jahr: ST.jahr, p: ST.p, c: ST.c };                    // the file remembers the reports chosen
  /* the engine writes 1'234.00; the interface writes 1’234.00 everywhere */
  const fmt = K.fmt; K.fmt = (v, f) => fmt(v, f).replace(/'/g, '’');
  return K;
}
/* the two pickers: every report of the file, newest year first */
function stPicker(K){
  const per = K.periods(), jahre = {};
  per.forEach(p => { (jahre[p.slice(0, 4)] = jahre[p.slice(0, 4)] || []).push(p); });
  [['#st-p', ST.p], ['#st-c', ST.c]].forEach(([sel, wert]) => {
    const s = $(sel); s.innerHTML = '';
    Object.keys(jahre).sort().reverse().forEach(j => {
      const g = h('optgroup', { label: j });
      jahre[j].slice().reverse().forEach(p => g.appendChild(h('option', { value: p, selected: p === wert ? true : null }, [K.periodLabel(p)])));
      s.appendChild(g);
    });
  });
}

/* ---------------------------------------------------------------- the rows (rules of 62_statements.js) */
function abBereichTitel(l){ const t = String(l).replace(/^total\s+/i, ''); return t.charAt(0).toUpperCase() + t.slice(1); }
/* balance sheet and income statement: the engine's structure, a heading over every block of groups that has its own total */
function abZeilen(K, struct, p, c, nullen){
  const z = [], G = K.GROUPS, bereichVon = {}, gezeigt = {};
  struct.forEach(n => { if (n.k === 's' && n.of.length > 1 && n.of.every(id => G[id] && G[id].k === 'g') &&
    !n.of.some(id => G[id].l.toLowerCase() === abBereichTitel(n.l).toLowerCase())) n.of.forEach(id => { bereichVon[id] = n; }); });
  struct.forEach(n => {
    if (n.k === 'sp'){ z.push({ k: 'luft' }); return; }
    if (n.k === 'sec'){ z.push({ k: 'teil', l: n.l }); return; }
    const a = K.nodeVal(n, p), b = K.nodeVal(n, c);
    if (n.k === 'g'){
      const kids = n.r ? K.accountsIn(n.id).filter(k => nullen || !K.nil(K.accVal(p, k)) || !K.nil(K.accVal(c, k))) : [];
      if (!nullen && K.nil(a) && K.nil(b) && !kids.length) return;
      const s = bereichVon[n.id];
      if (s && !gezeigt[s.id]){ gezeigt[s.id] = true; z.push({ k: 'bereich', l: abBereichTitel(s.l) }); }
      z.push({ k: 'grp', id: n.id, l: n.l, w: [a, b], kids: kids.map(k => ({ nr: k, l: K.nameOf(k), w: [K.accVal(p, k), K.accVal(c, k)] })) });
      return;
    }
    const ueber = n.k === 's' && n.of.some(id => G[id] && G[id].k !== 'g');
    z.push({ k: n.k === 't' ? 'tot' : n.k === 'r' ? 'res' : ueber ? 'sub ueber' : 'sub', l: n.l, w: [a, b], ergebnis: n.k === 'r' || (n.k === 't' && !!n.sign) });
  });
  /* new: without zero lines, a subtotal that is zero on both sides goes too (it only totals hidden groups) */
  const y = nullen ? z : z.filter(r => !(r.k.indexOf('sub') === 0 && K.nil(r.w[0]) && K.nil(r.w[1])));
  return y.filter((r, i) => !(r.k === 'luft' && (i === 0 || (y[i + 1] && (y[i + 1].k === 'teil' || y[i + 1].k === 'luft')))));
}
/* cash flow, direct method: what went in and out of cash, by statement group, accounts as drilldown */
function gfZeilen(K, cf){
  const z = []; let n = 0;
  const gruppen = linien => linien.forEach(l => z.push({ k: 'grp', id: 'cf' + (++n), l: l.l, w: [l.v], kids: l.konten.map(o => ({ nr: o.a, l: K.nameOf(o.a), w: [o.v] })) }));
  const teil = (titel, linien, summe, sl) => {
    z.push({ k: 'teil', l: titel });
    if (linien.length) gruppen(linien); else z.push({ k: 'grp', id: '', l: 'No cash movements', w: [0], kids: [] });
    z.push({ k: 'res', l: sl, w: [summe], ergebnis: true });
  };
  teil('Operating activities', cf.bereiche.op, cf.operating, 'Cash flow from operating activities');
  teil('Investing activities', cf.bereiche.inv, cf.investing, 'Cash flow from investing activities');
  teil('Financing activities', cf.bereiche.fin, cf.financing, 'Cash flow from financing activities');
  z.push({ k: 'luft' });
  if (!K.nil(cf.fx)){
    z.push({ k: 'sub', l: 'Net cash flow', w: [cf.net] });
    const fx = cf.bereiche.fx.reduce((a, l) => a.concat(l.konten), []);
    z.push({ k: 'grp', id: 'cf' + (++n), l: 'Effect of exchange rate changes on cash', w: [cf.fx], kids: fx.map(o => ({ nr: o.a, l: K.nameOf(o.a), w: [o.v] })) });
  }
  z.push({ k: 'tot', l: 'Net change in cash' + (cf.mitSchulden ? ' less credit card debt' : ' and cash equivalents'), w: [cf.change], ergebnis: true });
  z.push({ k: 'bereich', l: 'Reconciliation' });
  const fonds = cf.mitSchulden ? 'Cash less credit card debt' : 'Cash and cash equivalents';
  z.push({ k: 'grp', id: '', l: fonds + ' at ' + dateLong(cf.vonDatum), w: [cf.cashOpen], kids: [] });
  z.push({ k: 'grp', id: '', l: fonds + ' at ' + dateLong(cf.bisDatum), w: [cf.cashClose], kids: [] });
  return z;
}
/* the bridge from the result to the operating cash flow (indirect method, FER 4 / IAS 7), tied to the direct figure */
function gfIndirekt(K, cf, p, c){
  let i; const gross = K.S.cfGross;
  try { K.S.cfGross = false; i = K.buildCF(p, c); } catch (e){ return null; } finally { K.S.cfGross = gross; }
  if (!i) return null;
  const r2 = K.r2, diff = r2(cf.operating - i.operating);
  const z = [
    { k: 'grp', l: 'Result for the period', w: [i.earnings] }, { k: 'grp', l: 'Depreciation and amortisation', w: [i.depreciation] },
    { k: 'grp', l: 'Unrealised value changes on investments', w: [i.unrealised] }, { k: 'grp', l: 'Income from restricted assets, not received in cash', w: [i.restricted] },
    { k: 'sub', l: 'Result adjusted for non-cash items', w: [r2(i.earnings + i.NC)] },
    { k: 'grp', l: 'Change in receivables, prepayments and other current assets', w: [r2(-i.dOpAsset)] }, { k: 'grp', l: 'Change in short-term liabilities and accruals', w: [i.dOpLiab] },
    { k: 'res', l: 'Cash flow from operating activities, indirect method', w: [i.operating], ergebnis: true },
    { k: 'res', l: 'Cash flow from operating activities, direct method (above)', w: [cf.operating], ergebnis: true }];
  if (!K.nil(diff)) z.push({ k: 'sub', l: 'Difference: non-cash movements between the sections (see the note)', w: [diff] });
  return { z, gleich: K.nil(diff), diff };
}

/* ---------------------------------------------------------------- the statement sheet */
const stOffen = {};                         // open groups per page: {bilanz:{TA1:true}, …}
function stBlatt(seite, K, spalten, zeilen, mitVar){
  const offen = stOffen[seite] = stOffen[seite] || {};
  const zahl = (v, erg) => h('td', { class: 'num' + (erg && v < -0.005 ? ' neg' : '') + (!erg && K.nil(v) ? ' is-nil' : '') }, [erg ? K.fmt(v, true) : K.fmt(v)]);
  const diff = (a, b) => { const d = K.r2(a - b); return K.nil(d) ? [h('td', { class: 'num chg is-nil' }, ['–']), h('td', { class: 'num chg pct' })]
    : [h('td', { class: 'num chg' }, [(d > 0 ? '+' : '−') + K.fmt(Math.abs(d))]), h('td', { class: 'num chg pct' }, [K.fmtPct(a, b)])]; };
  const zahlen = (w, erg) => w.map(v => zahl(v, erg)).concat(mitVar ? diff(w[0], w[1]) : []);
  const breite = 1 + spalten.length + (mitVar ? 2 : 0), tb = h('tbody');
  zeilen.forEach(r => {
    if (r.k === 'luft'){ tb.appendChild(h('tr', { class: 'is-gap' }, [h('td', { colspan: breite })])); return; }
    if (r.k === 'teil' || r.k === 'bereich'){ tb.appendChild(h('tr', { class: r.k === 'teil' ? 'is-part' : 'is-section' }, [h('td', { colspan: breite }, [r.l])])); return; }
    if (r.k === 'grp'){
      const kinder = r.kids && r.kids.length, auf = kinder && !!offen[r.id];
      const kopf = h('tr', { class: 'is-group' + (kinder ? ' has-kids' : '') + (auf ? ' is-open' : ''), 'aria-expanded': kinder ? String(auf) : null, tabindex: kinder ? '0' : null },
        [h('td', { class: 'lbl' }, [kinder ? h('span', { class: 'chev' }) : null, h('span', {}, [r.l]), kinder ? h('span', { class: 'ev-st__n' }, [String(r.kids.length)]) : null])].concat(zahlen(r.w)));
      tb.appendChild(kopf);
      const blaetter = (r.kids || []).map((k, i) => {
        const tr = h('tr', { class: 'is-leaf', hidden: auf ? null : true, title: ix.km[k.nr] ? 'Open the Ledger of ' + k.nr : null, style: { '--i': Math.min(i, 12) } },
          [h('td', { class: 'lbl' }, [h('span', { class: 'nr' }, [k.nr]), h('span', {}, [k.l])])].concat(zahlen(k.w)));
        if (ix.km[k.nr]){ tr.classList.add('ev-klick'); tr.onclick = () => stZumKonto(K, k.nr); }
        tb.appendChild(tr); return tr;
      });
      if (kinder){
        const klapp = () => { const neu = !kopf.classList.contains('is-open'); offen[r.id] = neu; kopf.classList.toggle('is-open', neu); kopf.setAttribute('aria-expanded', String(neu)); blaetter.forEach(b => { b.hidden = !neu; }); };
        kopf.onclick = klapp; kopf.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); klapp(); } };
      }
      return;
    }
    tb.appendChild(h('tr', { class: 'is-' + r.k.split(' ')[0] + (r.k.indexOf('ueber') >= 0 ? ' is-over' : '') }, [h('td', { class: 'lbl' }, [r.l])].concat(zahlen(r.w, r.ergebnis))));
  });
  const kopf = h('thead', {}, [h('tr', {}, [h('th', { class: 'lbl' }, [h('span', { class: 'th-sort' }, ['Position'])])].concat(
    spalten.map(s => h('th', { class: 'num per' }, [h('span', { class: 'th-sort' }, [h('span', { class: 'ev-st__per' }, [h('b', {}, [s.l]), h('small', {}, [s.d])])])]))).concat(
    mitVar ? [h('th', { class: 'num chg' }, [h('span', { class: 'th-sort' }, ['Change'])]), h('th', { class: 'num chg pct' }, [h('span', { class: 'th-sort' }, ['%'])])] : []))]);
  return h('div', { class: 'ev-scroll' }, [h('table', { class: 'table ev-st' + (mitVar ? '' : ' no-var') }, [kopf, tb])]);
}
function stAlle(seite, auf){ $$('#st-' + seite + ' tr.is-group.has-kids').forEach(tr => { if (tr.classList.contains('is-open') !== auf) tr.click(); }); }
/* an account opens its Ledger in the year of the report */
function stZumKonto(K, nr){
  const j = parseInt(K.S.activePeriod.slice(0, 4), 10);
  if (!E.jahreMitBuchungen(state)[j]){ toast('No bookings in this file for ' + j + '.'); return; }
  if (state.jahr !== j){ P.jahr = state.jahr = j; baueKontrollen(); }
  P.per = 'J'; P.ytd = false; $('#periodSel').value = 'J';
  hbKonto = nr; Object.keys(hbOffen).forEach(x => delete hbOffen[x]);
  zeige('hauptbuch');
}
const stCheck = (ok, gut, schlecht) => h('div', { class: 'ev-check ' + (ok ? 'is-ok' : 'is-fehler') }, [h('span', { class: 'ev-check__i', html: icon(ok ? 'check' : 'alert', 12) }), h('span', {}, [ok ? gut : schlecht])]);
const stHinweis = t => h('div', { class: 'ev-check is-info' }, [h('span', { class: 'ev-check__i', html: icon('info', 12) }), h('span', {}, [t])]);
/* the key figures over a statement: value, comparison, change; better is the success colour, never red */
function stFiguren(box, K, liste){
  box.innerHTML = '';
  liste.forEach(f => {
    const d = K.r2(f.w - f.v), besser = f.besser === 'up' ? d > 0.005 : f.besser === 'down' ? d < -0.005 : false;
    box.appendChild(h('div', { class: 'ev-fig' }, [h('div', { class: 'kpi__label' }, [h('span', {}, [f.l])]),
      h('div', { class: 'ev-fig__v' + (f.w < -0.005 && f.neg ? ' neg' : '') }, [f.pct ? (isFinite(f.w) ? (f.w * 100).toFixed(1) + '%' : '–') : K.fmt(f.w, true)]),
      h('small', {}, [f.pct ? (isFinite(f.v) ? 'vs ' + (f.v * 100).toFixed(1) + '%' : '') : (K.nil(d) ? 'unchanged' : ''),
        !f.pct && !K.nil(d) ? h('span', { class: 'delta ' + (besser ? 'delta--up' : 'delta--flat') }, [(d > 0 ? '+' : '−') + K.fmt(Math.abs(d))]) : null])]));
  });
}
const stSpalten = (K, p, c) => [{ l: K.periodLabel(p), d: dateLong(K.rep(p).asOf) }, { l: K.periodLabel(c), d: dateLong(K.rep(c).asOf) }];
const fvon = (K, id, p) => K.GROUPS[id] ? K.nodeVal(K.GROUPS[id], p) : NaN;

/* ---------------------------------------------------------------- Balance sheet */
function renderBilanzSeite(){
  const K = stKern(), p = ST.p, c = ST.c, G = K.GROUPS; stPicker(K);
  $('#eyebrow').textContent = 'As at ' + dateLong(K.rep(p).asOf) + ', compared with ' + K.periodLabel(c) + ' · ' + K.CUR();
  const ta = fvon(K, 'TA', p), tl = fvon(K, 'TL', p), eq = fvon(K, 'EQ', p);
  stFiguren($('#st-figs'), K, [{ l: 'Total assets', w: ta, v: fvon(K, 'TA', c), besser: 'up' }, { l: 'Liabilities', w: isFinite(tl) ? tl : 0, v: isFinite(fvon(K, 'TL', c)) ? fvon(K, 'TL', c) : 0, besser: 'down' },
    { l: 'Equity (net worth)', w: eq, v: fvon(K, 'EQ', c), besser: 'up', neg: true }, { l: 'Equity ratio', pct: true, w: ta ? eq / ta : NaN, v: fvon(K, 'TA', c) ? fvon(K, 'EQ', c) / fvon(K, 'TA', c) : NaN }]);
  const box = $('#st-bilanz'); box.innerHTML = '';
  box.appendChild(stBlatt('bilanz', K, stSpalten(K, p, c), abZeilen(K, K.BS, p, c, ST.nullen.bilanz), ST.aenderung));
  const diff = K.r2(fvon(K, 'TA', p) - fvon(K, 'TLE', p));
  const ch = $('#st-check'); ch.innerHTML = ''; ch.appendChild(stCheck(K.nil(diff), 'Assets equal liabilities and equity.', 'Assets and liabilities differ by ' + K.fmt(diff) + '.'));
}
/* ---------------------------------------------------------------- Income statement */
function renderErfolgSeite(){
  const K = stKern(), p = ST.p, c = ST.c; stPicker(K);
  const R = K.rep(p), m = K.monthsOf(p), mc = K.monthsOf(c);
  $('#eyebrow').textContent = (R.basis === 'YTD' ? 'Year to date, ' + m + ' month' + (m === 1 ? '' : 's') + ' to ' : 'Full year to ') + dateLong(R.asOf) + ', compared with ' + K.periodLabel(c) + ' · ' + K.CUR();
  const ti = fvon(K, 'TI', p), np = fvon(K, 'NP', p), tiC = fvon(K, 'TI', c), npC = fvon(K, 'NP', c);
  stFiguren($('#st-figs'), K, [{ l: 'Income', w: ti, v: tiC, besser: 'up' }, { l: 'Expenses', w: K.r2(ti - np), v: K.r2(tiC - npC), besser: 'down' },
    { l: 'Result', w: np, v: npC, besser: 'up', neg: true }, { l: 'Savings rate', pct: true, w: ti ? np / ti : NaN, v: tiC ? npC / tiC : NaN }]);
  const box = $('#st-erfolg'); box.innerHTML = '';
  box.appendChild(stBlatt('erfolg', K, stSpalten(K, p, c), abZeilen(K, K.IS, p, c, ST.nullen.erfolg), ST.aenderung));
  const diff = K.r2(np - K.profitOf(p)), ch = $('#st-check'); ch.innerHTML = '';
  ch.appendChild(stCheck(K.nil(diff), 'The result ties to the balance sheet.', 'The result differs from the balance sheet by ' + K.fmt(diff) + '.'));
  if (m !== mc) ch.appendChild(stHinweis(m + ' months compared with ' + mc + ': not like for like.'));
}
/* ---------------------------------------------------------------- Cash flow */
function renderGeldflussSeite(){
  const K = stKern(), p = ST.p, c = ST.c; stPicker(K);
  const box = $('#st-geldfluss'), ch = $('#st-check'), notiz = $('#st-notiz'); box.innerHTML = ''; ch.innerHTML = ''; notiz.innerHTML = '';
  if (p === c){ $('#st-figs').innerHTML = ''; $('#eyebrow').textContent = K.CUR();
    box.appendChild(h('div', { class: 'empty' }, [h('h3', { class: 'empty__title' }, ['Pick two different reports']), h('p', { class: 'empty__text' }, ['The cash flow is the movement between the report and its comparison.'])])); return; }
  const cf = cfDirektZwischen(K, state, p, c), [frueh, spaet] = cf.rueckwaerts ? [p, c] : [c, p];
  cf.vonDatum = K.rep(frueh).asOf; cf.bisDatum = K.rep(spaet).asOf;
  $('#eyebrow').textContent = 'Cash in and out from ' + dateLong(cf.von) + ' to ' + dateLong(cf.bis) + ', ' + cf.buchungen + ' bookings · ' + K.CUR();
  stFiguren($('#st-figs'), K, [{ l: 'Operating', w: cf.operating, v: 0, neg: true }, { l: 'Investing', w: cf.investing, v: 0, neg: true },
    { l: 'Financing', w: cf.financing, v: 0, neg: true }, { l: 'Net change in cash', w: cf.change, v: 0, neg: true }]);
  $$('#st-figs small').forEach(s => { s.textContent = ''; });
  box.appendChild(stBlatt('geldfluss', K, [{ l: K.periodLabel(frueh) + ' → ' + K.periodLabel(spaet), d: dateLong(cf.von) + ' – ' + dateLong(cf.bis) }], gfZeilen(K, cf), false));
  ch.appendChild(stCheck(K.nil(cf.check), 'The cash flow matches the change in cash on the balance sheet.', 'The cash flow differs from the change in cash by ' + K.fmt(cf.check) + '.'));
  if (cf.rueckwaerts) ch.appendChild(stHinweis('The comparison lies after the report, so the cash flow runs from ' + K.periodLabel(frueh) + ' to ' + K.periodLabel(spaet) + '.'));
  if (cf.ohneBuchungen.length) ch.appendChild(stHinweis('No bookings in ' + cf.ohneBuchungen.join(', ') + ': the cash flow only covers what was booked.'));
  if (cf.offen.length) ch.appendChild(stHinweis(cf.offen.length + ' booking' + (cf.offen.length === 1 ? '' : 's') + ' on cash without a counter-account: ' + cf.offen.slice(0, 3).map(o => dateLong(o.datum) + ' ' + o.text).join('; ') + '.'));
  /* the notes: non-cash transactions, and the bridge to the indirect method, each a group that opens */
  const gruppe = (titel, sub, inhalt) => { const g = h('div', { class: 'group' }), kopf = h('button', { type: 'button', class: 'group__head', 'aria-expanded': 'false' },
    [h('span', { class: 'chev' }), h('span', { class: 'group__title' }, [titel]), h('span', { class: 'group__meta' }, [sub])]);
    kopf.onclick = () => { const auf = !g.classList.contains('is-open'); g.classList.toggle('is-open', auf); kopf.setAttribute('aria-expanded', String(auf)); };
    g.appendChild(kopf); g.appendChild(h('div', { class: 'group__body' }, inhalt)); return g; };
  if (cf.nichtGeld.length) notiz.appendChild(gruppe('Non-cash transactions', 'not in the cash flow: no cash changed hands · from ' + K.CUR() + ' 500', [stBlatt('nc', K, [{ l: 'Amount', d: '' }],
    cf.nichtGeld.map(o => ({ k: 'grp', id: '', l: o.l + (o.konten.length ? ' · ' + o.konten.join(' · ') : ''), w: [o.betrag], kids: [] })), false)]));
  const ind = gfIndirekt(K, cf, spaet, frueh);
  if (ind) notiz.appendChild(gruppe('Reconciliation to the indirect method', 'as Swiss GAAP FER 4 presents operating activities', [stBlatt('ind', K, [{ l: 'Amount', d: '' }], ind.z, false),
    h('div', { class: 'ev-st__foot' }, [ind.gleich ? stCheck(true, 'The indirect method gives the same operating cash flow.', '')
      : stHinweis('The two methods differ by ' + K.fmt(ind.diff) + ': the indirect method follows balance sheet movements, so a non-cash reclassification between operating and investing or financing shifts the figure between the sections. Both reconcile to the same change in cash.')])]));
}

/* ---------------------------------------------------------------- Twelve months and Years: one even sheet each */
const breitOffen = { monate: {}, jahre: {} };
function breitBlatt(seite, zeilen, kopf, wert){
  const offen = breitOffen[seite], tb = h('tbody'), breite = kopf.length + 1;
  let gruppe = null;                          // the open group the indented accounts below belong to
  const schliesse = () => { gruppe = null; };
  zeilen.forEach((z, zi) => {
    if (z.typ === 'seite' || z.typ === 'teil' || z.typ === 'bereich'){ schliesse(); tb.appendChild(h('tr', { class: z.typ === 'bereich' ? 'is-section' : 'is-part' }, [h('td', { colspan: breite }, [z.text])])); return; }
    const zellen = wert(z).map(c => h('td', { class: 'num' + (c.kl ? ' ' + c.kl : '') + (c.v < -0.005 ? ' neg' : '') + (Math.abs(c.v) < .005 && !c.fett ? ' is-nil' : ''), title: c.title || null }, [c.t]));
    if (z.typ === 'gruppe'){
      const key = zi + '|' + z.text, auf = offen[key] !== false, meine = [];
      const tr = h('tr', { class: 'is-group has-kids' + (auf ? ' is-open' : ''), tabindex: '0', 'aria-expanded': String(auf) }, [h('td', { class: 'lbl' }, [h('span', { class: 'chev' }), h('span', {}, [z.text])])].concat(zellen));
      const klapp = () => { const neu = !tr.classList.contains('is-open'); offen[key] = neu; tr.classList.toggle('is-open', neu); tr.setAttribute('aria-expanded', String(neu)); meine.forEach(x => { x.hidden = !neu; }); };
      tr.onclick = klapp; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); klapp(); } };
      tb.appendChild(tr); gruppe = { auf, meine }; return;
    }
    const kl = z.typ === 'konto' ? (z.einzug ? 'is-leaf' : 'is-group') : z.typ === 'total' ? 'is-tot' : 'is-sub';
    const tr = h('tr', { class: kl, hidden: z.einzug && gruppe && !gruppe.auf ? true : null }, [h('td', { class: 'lbl', title: (z.nr ? z.nr + ' ' : '') + z.text }, [z.nr ? h('span', { class: 'nr' }, [z.nr]) : null, h('span', {}, [z.text])])].concat(zellen));
    if (z.nr && ix.km[z.nr]){ tr.classList.add('ev-klick'); tr.onclick = () => { hbKonto = z.nr; Object.keys(hbOffen).forEach(x => delete hbOffen[x]); P.per = 'J'; P.ytd = false; $('#periodSel').value = 'J'; zeige('hauptbuch'); }; }
    if (z.einzug && gruppe) gruppe.meine.push(tr); else if (!z.einzug) schliesse();
    tb.appendChild(tr);
  });
  return h('div', { class: 'ev-scroll ev-wide' }, [h('table', { class: 'table ev-st ev-st--wide' + (seite === 'monate' ? ' ev-st--fit' : '') }, [h('thead', {}, [h('tr', {}, [h('th', { class: 'lbl' }, [h('span', { class: 'th-sort' }, [''])])].concat(kopf.map(k => h('th', { class: 'num' + (k.kl ? ' ' + k.kl : '') }, [h('span', { class: 'th-sort' }, [k.t])]))))]), tb])]);
}
function breitAlle(seite, auf){ $$('[data-page="' + seite + '"] tr.is-group.has-kids').forEach(tr => { if (tr.classList.contains('is-open') !== auf) tr.click(); }); }
const f2 = v => Math.abs(v) < .005 ? '–' : tsd(v, 2);
function renderMonateSeite(){
  const mb = E.monatsbericht(state, ix);
  $('#eyebrow').textContent = 'Financial year ' + state.jahr + ', January to December · ' + state.waehrung;
  const kopfE = mb.monate.map(m => ({ t: m.kurz })).concat([{ t: 'Year', kl: 'is-year' }]), kopfB = mb.monate.map(m => ({ t: m.kurz }));
  const e = $('#mo-erfolg'), b = $('#mo-bilanz'); e.innerHTML = ''; b.innerHTML = '';
  /* whole francs, so twelve months and the year fit on a computer; the exact amount on hover */
  const f0 = v => ({ v, t: Math.abs(v) < .5 ? '–' : tsd(v, 0), title: Math.abs(v) < .005 ? null : tsd(v, 2) });
  e.appendChild(breitBlatt('monate', mb.erfolg, kopfE, z => z.werte.map(f0).concat([Object.assign(f0(z.total || 0), { kl: 'is-year', fett: true })])));
  b.appendChild(breitBlatt('monate', mb.bilanz, kopfB, z => z.werte.map(f0)));
}
function renderJahreSeite(){
  const jv = E.jahresvergleich({ state, ix, datei: vgl }), delta = $('#ja-delta').checked, sp = jv.spalten;
  $('#eyebrow').textContent = sp.length > 1 ? 'Full years ' + sp.map(s => s.label).join(', ') + ' · ' + state.waehrung : 'Only this file so far · import earlier closings under Years and closings';
  const kopf = []; sp.forEach((s, i) => { if (delta && i > 0) kopf.push({ t: 'Change', kl: 'chg' }); kopf.push({ t: s.label + (s.importiert ? ' (imported)' : '') }); });
  const wert = z => { const out = []; z.werte.forEach((v, i) => { if (delta && i > 0){ const d = E.r2(v - z.werte[i - 1]); out.push({ v: 0, t: Math.abs(d) < .005 ? '–' : (d > 0 ? '+' : '−') + tsd(Math.abs(d), 2), kl: 'chg' }); } out.push({ v, t: f2(v) }); }); return out; };
  const e = $('#ja-erfolg'), b = $('#ja-bilanz'); e.innerHTML = ''; b.innerHTML = '';
  e.appendChild(breitBlatt('jahre', jv.erfolg, kopf, wert)); b.appendChild(breitBlatt('jahre', jv.bilanz, kopf, wert));
}

/* ---------------------------------------------------------------- wiring */
function initAbschluss(){
  $('#st-p').onchange = e => { ST.p = e.target.value; render(true); };
  $('#st-c').onchange = e => { ST.c = e.target.value; render(true); };
  $('#st-var').onchange = e => { const an = e.target.checked;
    if (aendere('Change column ' + (an ? 'shown' : 'hidden'), () => { state.auswertung = state.auswertung || {}; state.auswertung.showVariance = an; })) render(false); };
  $('#st-null').onchange = e => { ST.nullen[PAGE] = e.target.checked; render(false); };
  $('#st-auf').onclick = () => stAlle(PAGE, true); $('#st-zu').onclick = () => stAlle(PAGE, false);
  $('#mo-auf').onclick = () => breitAlle('monate', true); $('#mo-zu').onclick = () => breitAlle('monate', false);
  $('#ja-auf').onclick = () => breitAlle('jahre', true); $('#ja-zu').onclick = () => breitAlle('jahre', false);
  $('#ja-delta').onchange = () => render(false);
  $('#st-xlsx').onclick = () => fsExcelExport();
  $('#st-pdf').onclick = () => exportDialog();
}
/* the three statements share one page: the sheet changes, the controls stay */
function renderAbschluss(){
  const seite = PAGE;
  $$('[data-st]').forEach(el => { el.hidden = el.dataset.st.split(' ').indexOf(seite) < 0; });
  ST.aenderung = (state.auswertung || {}).showVariance !== false;
  $('#st-null').checked = !!ST.nullen[seite]; $('#st-var').checked = ST.aenderung;
  if (seite === 'bilanz') renderBilanzSeite(); else if (seite === 'erfolg') renderErfolgSeite(); else renderGeldflussSeite();
}
