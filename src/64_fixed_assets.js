/* =====================================================================
   OVERVIEW (YEARS), INVESTMENTS, FIXED ASSETS (interface rebuilt on the Design Lab kit, 25.10.2026)
   The figures are the engines': the statements engine over every month end (yearSeries, worthSeries, investments,
   buildSeries, investedAt) and the books engine's register (E.anlage*). The charts are drawn on the kit; the rules of
   the register and of the asset and disposal dialogs are the app's.
   ===================================================================== */

/* ---------------------------------------------------------------- the statements engine over every month end (fsVerlauf) */
function verlaufK(){
  const t = heute(), vor = t.slice(5, 7) === '01' ? (+t.slice(0, 4) - 1) + '-12' : t.slice(0, 4) + '-' + String(+t.slice(5, 7) - 1).padStart(2, '0');
  const jahre = Object.keys(E.jahreMitBuchungen(state)).map(Number), letztes = jahre.length ? Math.max.apply(null, jahre) : state.jahr;
  const bis = String(letztes) < vor.slice(0, 4) ? letztes + '-12' : vor, j = +bis.slice(0, 4);
  const K = fsDaten(state, ix, E, { jahr: j, alleMonate: true, ohneEroeffnung: true, bis });
  const per = K.periods(), p = per.indexOf(bis) >= 0 ? bis : per[per.length - 1];
  const c = per.indexOf((j - 1) + '-12') >= 0 && p !== (j - 1) + '-12' ? (j - 1) + '-12' : per[Math.max(0, per.indexOf(p) - 1)];
  K.S.activePeriod = p; K.S.comparePeriod = c;
  const fmt = K.fmt; K.fmt = (v, f) => fmt(v, f).replace(/'/g, '’');
  return K;
}
/* what the reader sets on Investments is a file setting (state.auswertung), as in the app: one change with undo */
let INV_JAHRE = null;                                // the horizon while the slider moves, before it is let go
function invMerken(K){
  const neu = { investments: JSON.parse(JSON.stringify(K.S.investments || [])), forecast: Object.assign({}, K.S.forecast), invView: K.S.invView };
  INV_JAHRE = null;
  return aendere('Investment settings changed', () => { state.auswertung = Object.assign({}, state.auswertung || {}, neu); });
}
const DONUT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => 'var(--ev-d' + i + ')');
/* the kit's donut: a ring of segments, the total in the middle, the list beside it; hovering one lights its pair */
function donut(box, teile, mitte, leer){
  box.innerHTML = '';
  if (!teile.length){ box.appendChild(h('p', { class: 'note' }, [leer])); return; }
  const total = teile.reduce((s, x) => s + x.wert, 0) || 1, r = 40, C = 2 * Math.PI * r, gap = teile.length > 1 ? 1.2 : 0;
  /* the ring turns slowly (a CSS animation on its own group, paused under the pointer, off with reduced motion) */
  let off = 0, svg = '<svg viewBox="0 0 100 100" aria-hidden="true"><g class="ev-spin"><g transform="rotate(-90 50 50)"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--chart-grid)" stroke-width="14"/>';
  teile.forEach((x, i) => { const len = x.wert / total * C;
    svg += '<circle class="seg" data-i="' + i + '" cx="50" cy="50" r="40" stroke="' + DONUT[i % DONUT.length] + '" stroke-width="14" stroke-dasharray="' + Math.max(0, len - gap).toFixed(2) + ' ' + (C - len + gap).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"/>';
    off += len; });
  const ring = h('div', { class: 'donut__ring', html: svg + '</g></g></svg>' }), list = h('div', { class: 'donut__list' });
  ring.appendChild(h('div', { class: 'donut__mid' }, [h('b', {}, [mitte.v]), h('small', {}, [mitte.l])]));
  teile.forEach((x, i) => list.appendChild(h('div', { 'data-i': i, title: x.tip || null }, [h('i', { style: { background: DONUT[i % DONUT.length] } }), h('span', {}, [x.label]), h('b', {}, [x.zahl])])));
  const segs = $$('.seg', ring), rows = $$('div', list);
  const hell = i => { ring.classList.toggle('is-hover', i !== null); segs.forEach(s => s.classList.toggle('on', s.dataset.i === String(i))); rows.forEach(z => z.classList.toggle('on', z.dataset.i === String(i))); };
  segs.concat(rows).forEach(el => { el.addEventListener('pointerenter', () => hell(el.dataset.i)); el.addEventListener('pointerleave', () => hell(null)); });
  box.appendChild(h('div', { class: 'donut ev-donut' }, [ring, list]));
}
/* the axis of a chart: four steps from a round number, labels in thousands */
function achse(lo, hi){
  const roh = (hi - lo) / 4 || 1, p = Math.pow(10, Math.floor(Math.log10(roh))), s = [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= roh) || roh;
  const a = Math.floor(lo / s) * s, b = Math.ceil(hi / s) * s, out = []; for (let v = a; v <= b + s / 2; v += s) out.push(v);
  return { lo: a, hi: b, ticks: out };
}
const kTxt = v => Math.abs(v) >= 1e6 ? tsd(v / 1e6, 1) + 'm' : Math.abs(v) >= 1000 ? tsd(v / 1000, Math.abs(v) < 1e4 ? 1 : 0) + 'k' : tsd(v);
/* the drawing has the size of its box, so a point in the svg is a pixel on screen (the hover relies on it) */
function svgKasten(box, H){
  const W = Math.max(280, Math.round(box.getBoundingClientRect().width || 600)); H = Math.round(box.getBoundingClientRect().height) || H || 240;
  return { W, H, svg: h('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' }) };
}
function gitter(svg, A, y, ml, W, mr){
  A.ticks.forEach(v => { svg.appendChild(h('line', { class: 'gridline', x1: ml, x2: W - mr, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }));
    svg.appendChild(h('text', { class: 'axis', x: ml - 8, y: (y(v) + 4).toFixed(1), 'text-anchor': 'end' }, [kTxt(v)])); });
  if (A.lo < 0) svg.appendChild(h('line', { class: 'zero', x1: ml, x2: W - mr, y1: y(0).toFixed(1), y2: y(0).toFixed(1) }));
}

/* ================================================================ OVERVIEW (YEARS) */
function renderUeberJahreSeite(animate){
  const K = verlaufK(), p = K.S.activePeriod, G = K.GROUPS, ys = K.yearSeries(), ws = K.worthSeries();
  $('#eyebrow').textContent = 'Every year of this file, up to ' + K.periodLabel(p) + ' (' + dateLong(K.rep(p).asOf) + ') · ' + K.CUR();
  const erst = ws[0], letzt = ws[ws.length - 1] || { worth: 0, assets: 0 }, jetzt = ys[ys.length - 1];
  const fig = (l, v, sub, d, besser) => h('div', { class: 'ev-fig' }, [h('div', { class: 'kpi__label' }, [h('span', {}, [l])]), h('div', { class: 'ev-fig__v' }, [v]),
    h('small', {}, [d !== null && d !== undefined && !K.nil(d) ? h('span', { class: 'delta ' + (besser ? 'delta--up' : 'delta--flat') }, [(d > 0 ? '+' : '−') + K.fmt(Math.abs(d))]) : null, sub])]);
  const box = $('#oj-figs'); box.innerHTML = '';
  const dW = erst ? K.r2(letzt.worth - erst.worth) : 0;
  box.appendChild(fig('Net worth', K.fmt(letzt.worth, true), erst ? ' since ' + dateLong(erst.t) : '', dW, dW > 0));
  box.appendChild(fig('Total assets', K.fmt(letzt.assets, true), 'at ' + dateLong(K.rep(p).asOf)));
  box.appendChild(fig('Cash and investments', K.fmt(K.nodeVal(G.FONDS, p) + K.investedAt(p), true), 'invested ' + K.fmt(K.investedAt(p), true)));
  box.appendChild(fig('Savings rate ' + (jetzt ? jetzt.y : ''), jetzt && jetzt.income ? (jetzt.result / jetzt.income * 100).toFixed(1) + '%' : '–', jetzt && jetzt.part ? jetzt.months + ' months' : 'full year'));
  ojBalken(ys, animate); ojLinie(ws, animate);
  /* the investments ticked under Statement settings, by value */
  const summe = accs => K.r2(accs.reduce((s, a) => s + K.accVal(p, a), 0));
  const teile = K.investments().filter(i => i.include).map(i => ({ label: i.label, wert: K.r2(summe(i.pay) + summe(i.adj)), bezahlt: summe(i.pay) })).filter(x => x.wert > .005).sort((a, b) => b.wert - a.wert);
  const total = K.r2(teile.reduce((s, x) => s + x.wert, 0));
  $('#oj-donut-sub').textContent = 'At ' + dateLong(K.rep(p).asOf) + ', ' + K.CUR();
  donut($('#oj-donut'), teile.map(x => ({ label: x.label, wert: x.wert, zahl: K.fmt(x.wert), tip: 'Paid in ' + K.fmt(x.bezahlt) + ' · ' + (x.wert / total * 100).toFixed(1) + '%' })),
    { v: kTxt(total), l: 'invested' }, 'No investment ticked yet. Tick them under Setup, Statement settings.');
}
/* income and expenses as bars per year, the result as a line; a year still running is hatched */
function ojBalken(ys, animate){
  const box = $('#oj-balken'), { W, H, svg } = svgKasten(box, 260), ml = 48, mr = 8, mt = 10, mb = 26, iw = W - ml - mr, ih = H - mt - mb;
  if (!ys.length){ box.innerHTML = ''; return; }
  const A = achse(Math.min(0, ...ys.map(d => d.result)), Math.max(1, ...ys.map(d => Math.max(d.income, d.expense)))), y = v => mt + (A.hi - v) / (A.hi - A.lo) * ih;
  svg.appendChild(h('defs', {}, [])).innerHTML = '<pattern id="ojHatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--ev-hatch)" stroke-width="2"/></pattern>';
  gitter(svg, A, y, ml, W, mr);
  const band = iw / ys.length, bw = Math.min(44, band * .28), pts = [];
  ys.forEach((d, i) => {
    const cx = ml + band * (i + .5);
    [['inc', d.income, -bw - 3], ['exp', d.expense, 3]].forEach(([c, v, dx], k) => {
      const top = y(Math.max(0, v)), hh = Math.max(1, Math.abs(y(0) - y(v))), att = { x: (cx + dx).toFixed(1), y: top.toFixed(1), width: bw.toFixed(1), height: hh.toFixed(1), rx: Math.min(5, bw / 3) };
      svg.appendChild(h('rect', Object.assign({ class: 'bar ' + c, style: animate && !REDUCED ? { animationDelay: (i * 80 + k * 40) + 'ms' } : { animation: 'none' } }, att), [h('title', {}, [d.label + ': ' + (c === 'inc' ? 'income ' : 'expenses ') + tsd(v, 2)])]));
      if (d.part) svg.appendChild(h('rect', Object.assign({ fill: 'url(#ojHatch)', 'pointer-events': 'none' }, att)));
    });
    svg.appendChild(h('text', { class: 'axis', x: cx.toFixed(1), y: H - 6, 'text-anchor': 'middle' }, [d.y + (d.part ? ' · ' + d.months + 'm' : '')]));
    pts.push([cx, y(d.result), d]);
  });
  if (pts.length > 1) svg.appendChild(h('path', { class: 'series series--dash res' + (animate && !REDUCED ? ' reveal' : ''), d: smooth(pts.map(q => [q[0], q[1]])) }));
  pts.forEach(q => svg.appendChild(h('circle', { class: 'ev-dot', cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 4 })));
  box.innerHTML = ''; box.appendChild(svg);
  chartHover(box, svg, pts.map(q => { const d = q[2];
    return { x: q[0], y: q[1], titel: d.y + (d.part ? ' · ' + d.months + ' months' : ''),
      zeilen: [['Income', tsd(d.income)], ['Expenses', tsd(d.expense)], ['Result', tsd(d.result) + (d.income ? ' · ' + (d.result / d.income * 100).toFixed(1) + '%' : '')]] }; }), mt, H - mb);
}
/* net worth at every month end, total assets dashed behind it */
function ojLinie(ws, animate){
  const box = $('#oj-linie'), { W, H, svg } = svgKasten(box, 240), ml = 48, mr = 10, mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
  if (ws.length < 2){ box.innerHTML = ''; box.appendChild(h('p', { class: 'note' }, ['One report so far: the line starts with the second month.'])); return; }
  const t = s => Date.parse(s + 'T00:00:00Z'), t0 = t(ws[0].t), t1 = t(ws[ws.length - 1].t), x = d => ml + (t(d.t) - t0) / Math.max(1, t1 - t0) * iw;
  const A = achse(Math.min(0, ...ws.map(d => d.worth)), Math.max(1, ...ws.map(d => Math.max(d.assets, d.worth)))), y = v => mt + (A.hi - v) / (A.hi - A.lo) * ih;
  gitter(svg, A, y, ml, W, mr);
  const pfad = k => ws.map((d, i) => (i ? 'L' : 'M') + x(d).toFixed(1) + ',' + y(d[k]).toFixed(1)).join('');
  svg.appendChild(h('path', { class: 'ev-area', d: pfad('worth') + 'L' + x(ws[ws.length - 1]).toFixed(1) + ',' + y(Math.max(0, A.lo)).toFixed(1) + 'L' + x(ws[0]).toFixed(1) + ',' + y(Math.max(0, A.lo)).toFixed(1) + 'Z' }));
  svg.appendChild(h('path', { class: 'series series--dash ev-assets-line', d: pfad('assets') }));
  svg.appendChild(h('path', { class: 'series ev-worth-line' + (animate && !REDUCED ? ' reveal' : ''), d: pfad('worth') }));
  const n = Math.min(6, ws.length); for (let k = 0; k < n; k++){ const d = ws[Math.round(k * (ws.length - 1) / Math.max(1, n - 1))];
    svg.appendChild(h('text', { class: 'axis', x: x(d).toFixed(1), y: H - 5, 'text-anchor': k === 0 ? 'start' : k === n - 1 ? 'end' : 'middle' }, [MONATE[+d.t.slice(5, 7) - 1].slice(0, 3) + ' ' + d.t.slice(2, 4)])); }
  ws.forEach((d, i) => { if (i === ws.length - 1 || ws.length <= 24) svg.appendChild(h('circle', { class: 'ev-dot ev-dot--worth', cx: x(d).toFixed(1), cy: y(d.worth).toFixed(1), r: i === ws.length - 1 ? 4 : 2.6 })); });
  box.innerHTML = ''; box.appendChild(svg);
  chartHover(box, svg, ws.map((d, i) => { const vor = ws[i - 1], dd = vor ? E.r2(d.worth - vor.worth) : null;
    return { x: x(d), y: y(d.worth), titel: dateLong(d.t), zeilen: [['Net worth', tsd(d.worth)]].concat(vor ? [['vs month before', (dd >= 0 ? '+' : '−') + tsd(Math.abs(dd))]] : []) }; }), mt, H - mb);
  const g = K_letzt(ws); $('#oj-worth-chip').textContent = g;
}
const K_letzt = ws => { const d = E.r2(ws[ws.length - 1].worth - ws[0].worth); return (d >= 0 ? '+' : '−') + tsd(Math.abs(d), 2) + ' since ' + dateLong(ws[0].t); };

/* ================================================================ INVESTMENTS */
let INV_K = null;
function renderAnlagenSeite(animate){
  const K = INV_K = verlaufK();
  if (INV_JAHRE !== null) K.S.forecast.years = INV_JAHRE;
  const p = K.S.activePeriod, all = K.investments(), jahre = K.S.forecast.years;
  const sel = $('#inv-view'), keep = K.S.invView || 'all';
  sel.innerHTML = ''; sel.appendChild(h('option', { value: 'all' }, ['All investments combined']));
  all.filter(i => i.include).forEach(i => sel.appendChild(h('option', { value: i.id }, [i.label])));
  sel.value = keep; if (sel.value !== keep) sel.value = 'all'; K.S.invView = sel.value;
  const inc = all.filter(i => i.include), set = K.S.invView === 'all' ? inc : inc.filter(i => i.id === K.S.invView);
  const sum = (q, accs) => K.r2(accs.reduce((s, a) => s + K.accVal(q, a), 0));
  const pay = K.r2(set.reduce((s, i) => s + sum(p, i.pay), 0)), adj = K.r2(set.reduce((s, i) => s + sum(p, i.adj), 0)), val = K.r2(pay + adj);
  const pts = K.buildSeries(set, jahre), end = pts[pts.length - 1] || { pay, val, t: K.rep(p).asOf };
  $('#eyebrow').textContent = 'As at ' + dateLong(K.rep(p).asOf) + ' · ' + K.CUR() + ' · rent deposits excluded';
  const box = $('#inv-figs'); box.innerHTML = '';
  const fig = (l, v, sub, ton) => box.appendChild(h('div', { class: 'ev-fig' }, [h('div', { class: 'kpi__label' }, [h('span', {}, [l])]), h('div', { class: 'ev-fig__v' }, [v]),
    h('small', {}, [ton ? h('span', { class: 'delta ' + ton }, [sub]) : sub])]));
  fig('Paid in', K.fmt(pay, true), set.length + ' position' + (set.length === 1 ? '' : 's'));
  fig('Value adjustment', (adj >= 0 ? '+' : '−') + K.fmt(Math.abs(adj), true), pay ? (adj >= 0 ? '+' : '−') + Math.abs(adj / pay * 100).toFixed(1) + '% on paid in' : '–', adj > 0.005 ? 'delta--up' : 'delta--flat');
  fig('Market value', K.fmt(val, true), 'at ' + dateLong(K.rep(p).asOf));
  fig('Projected value', K.fmt(end.val, true), jahre ? 'in ' + jahre + ' years · paid in ' + kTxt(end.pay) : 'no forecast');
  $('#inv-horizont').textContent = jahre === 0 ? 'actuals only' : jahre + ' year' + (jahre === 1 ? '' : 's') + ' → ' + end.t.slice(0, 4);
  const rng = $('#inv-jahre'); rng.value = jahre; rng.style.setProperty('--fill', (jahre / 30 * 100) + '%');
  $('#inv-jahre-l').textContent = jahre + (jahre === 1 ? ' year' : ' years'); $('#inv-bis').textContent = jahre ? 'projected to ' + dateLong(end.t) : 'actuals only';
  invChart(pts, animate);
  invTabelle(K, inc);
}
/* paid in as a filled area, the value as a line; the forecast continues both, dashed, on a hatched band */
function invChart(pts, animate){
  const box = $('#inv-chart'), { W, H, svg } = svgKasten(box, 260), ml = 52, mr = 10, mt = 12, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
  box.innerHTML = '';
  if (pts.length < 2){ box.appendChild(h('p', { class: 'note' }, ['Nothing invested yet in this view.'])); return; }
  const t = s => Date.parse(s + 'T00:00:00Z'), t0 = t(pts[0].t), t1 = t(pts[pts.length - 1].t), x = d => ml + (t(d.t) - t0) / Math.max(1, t1 - t0) * iw;
  const A = achse(Math.min(0, ...pts.map(d => Math.min(d.pay, d.val))), Math.max(1, ...pts.map(d => Math.max(d.pay, d.val)))), y = v => mt + (A.hi - v) / (A.hi - A.lo) * ih;
  svg.appendChild(h('defs', {})).innerHTML = '<pattern id="invHatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--ev-hatch)" stroke-width="2.4"/></pattern>';
  const ist = pts.filter(d => !d.fc), fc = pts.filter(d => d.fc), heuteP = ist[ist.length - 1];
  if (fc.length) svg.appendChild(h('rect', { x: x(heuteP).toFixed(1), y: mt, width: (W - mr - x(heuteP)).toFixed(1), height: ih, fill: 'url(#invHatch)' }));
  gitter(svg, A, y, ml, W, mr);
  const linie = (liste, k) => liste.map((d, i) => (i ? 'L' : 'M') + x(d).toFixed(1) + ',' + y(d[k]).toFixed(1)).join('');
  const flaeche = (liste, k) => linie(liste, k) + 'L' + x(liste[liste.length - 1]).toFixed(1) + ',' + y(Math.max(0, A.lo)).toFixed(1) + 'L' + x(liste[0]).toFixed(1) + ',' + y(Math.max(0, A.lo)).toFixed(1) + 'Z';
  const weiter = fc.length ? [heuteP].concat(fc) : [];
  svg.appendChild(h('path', { class: 'ev-pay-area', d: flaeche(ist, 'pay') }));
  if (weiter.length) svg.appendChild(h('path', { class: 'ev-pay-area is-fc', d: flaeche(weiter, 'pay') }));
  svg.appendChild(h('path', { class: 'series ev-pay-line', d: linie(ist, 'pay') }));
  svg.appendChild(h('path', { class: 'series ev-val-line' + (animate && !REDUCED ? ' reveal' : ''), d: linie(ist, 'val') }));
  if (weiter.length){ svg.appendChild(h('path', { class: 'series series--dash ev-pay-line', d: linie(weiter, 'pay') })); svg.appendChild(h('path', { class: 'series series--dash ev-val-line', d: linie(weiter, 'val') })); }
  svg.appendChild(h('line', { class: 'ev-today', x1: x(heuteP).toFixed(1), x2: x(heuteP).toFixed(1), y1: mt, y2: mt + ih }));
  svg.appendChild(h('circle', { class: 'ev-dot ev-dot--val', cx: x(heuteP).toFixed(1), cy: y(heuteP.val).toFixed(1), r: 4 }, [h('title', {}, [dateLong(heuteP.t) + ': value ' + tsd(heuteP.val, 2) + ', paid in ' + tsd(heuteP.pay, 2)])]));
  const ende = pts[pts.length - 1];
  if (fc.length) svg.appendChild(h('circle', { class: 'ev-dot ev-dot--val', cx: x(ende).toFixed(1), cy: y(ende.val).toFixed(1), r: 3.5 }, [h('title', {}, [dateLong(ende.t) + ': projected ' + tsd(ende.val, 2) + ', paid in ' + tsd(ende.pay, 2)])]));
  const jahreAchse = []; const j0 = +pts[0].t.slice(0, 4), j1 = +ende.t.slice(0, 4), schritt = Math.max(1, Math.ceil((j1 - j0) / 6));
  for (let j = j0; j <= j1; j += schritt) jahreAchse.push(j);
  jahreAchse.forEach(j => { const xx = x({ t: j + '-01-01' }); if (xx >= ml && xx <= W - mr) svg.appendChild(h('text', { class: 'axis', x: xx.toFixed(1), y: H - 5, 'text-anchor': 'middle' }, [String(j)])); });
  box.appendChild(svg);
  chartHover(box, svg, pts.map(d => ({ x: x(d), y: y(d.val), titel: dateLong(d.t) + (d.fc ? ' · forecast' : ''),
    zeilen: [['Value', tsd(d.val)], ['Paid in', tsd(d.pay)]] })), mt, mt + ih);
}
/* the assumptions: monthly pay-in and expected return per investment drive the forecast */
function invTabelle(K, inc){
  const p = K.S.activePeriod, alle = K.investments(), sum = (q, accs) => K.r2(accs.reduce((s, a) => s + K.accVal(q, a), 0)), tb = h('tbody');
  inc.forEach(i => {
    const n = alle.indexOf(i), pay = sum(p, i.pay), adj = sum(p, i.adj), val = K.r2(pay + adj), ret = pay ? adj / pay * 100 : 0;
    const one = K.buildSeries([i], K.S.forecast.years), proj = one.length ? one[one.length - 1].val : val;
    const feld = (f, step, w) => h('input', { class: 'input num ev-cell', type: 'number', step, min: f === 'monthly' ? '0' : null, value: +i[f] || 0, 'aria-label': (f === 'monthly' ? 'Monthly pay-in, ' : 'Return p.a., ') + i.label, style: { width: w },
      onchange: e => { alle[n][f] = parseFloat(e.target.value) || 0; invMerken(K); renderAnlagenSeite(false); } });
    tb.appendChild(h('tr', {}, [h('td', { class: 'wrap-ok' }, [h('b', {}, [i.label]), h('small', { class: 'ev-inv-acc' }, [i.pay.join(', ') + (i.adj.length ? ' ↔ ' + i.adj.join(', ') : ' · no valuation account')])]),
      h('td', { class: 'num' }, [K.fmt(pay)]), h('td', { class: 'num' }, [K.nil(adj) ? '–' : (adj > 0 ? '+' : '−') + K.fmt(Math.abs(adj))]), h('td', { class: 'num' }, [h('b', {}, [K.fmt(val)])]),
      h('td', { class: 'num' }, [K.nil(adj) ? '–' : (ret >= 0 ? '+' : '−') + Math.abs(ret).toFixed(1) + '%']),
      h('td', { class: 'num' }, [feld('monthly', '10', '96px')]), h('td', { class: 'num' }, [feld('ret', '0.25', '80px')]), h('td', { class: 'num' }, [K.fmt(proj)])]));
  });
  const box = $('#inv-tabelle'); box.innerHTML = '';
  if (!inc.length){ box.appendChild(h('div', { class: 'empty' }, [h('h3', { class: 'empty__title' }, ['No investment ticked yet']), h('p', { class: 'empty__text' }, ['Tick them under Setup, Statement settings.'])])); return; }
  box.appendChild(h('div', { class: 'ev-scroll' }, [h('table', { class: 'table ev-inv' }, [h('thead', {}, [h('tr', {}, ['Investment', 'Paid in', 'Value adj.', 'Value', 'Return', 'Monthly pay-in', 'Return p.a. %', 'Projected']
    .map((t, k) => h('th', { class: k ? 'num' : '' }, [h('span', { class: 'th-sort' }, [t])])))]), tb])]));
}

/* ================================================================ FIXED ASSETS (rules of 64_fixed_assets.js) */
let saGewaehlt = null;
const saKonten = pred => kontenSortiert().filter(k => pred(k, ix.gm[k.grp]));
const fz2 = v => tsd(v, 2);
/* the accounts for a gain or loss on disposal; created in the depreciation group when missing */
function saAbgangKonten(){
  const ein = state.einstellungen || {}, gewinn = ein.abgangGewinn || '6815', verlust = ein.abgangVerlust || '6810';
  const fehlt = [gewinn, verlust].filter(nr => !ix.km[nr]);
  if (!fehlt.length) return { gewinn, verlust, neu: [] };
  const grp = state.gruppen.find(g => E.istER(g) && /depreciation|abschreib|amortis/i.test(g.t)) || state.gruppen.find(g => E.istER(g) && g.vz !== -1);
  return { gewinn, verlust, neu: fehlt.map(nr => [nr, nr === gewinn ? 'Gain on disposal of fixed assets' : 'Loss on disposal of fixed assets', grp ? grp.c : 'I11', null, null]) };
}
function renderSachanlagenSeite(animate){
  const J = state.jahr, bis = J + '-12-31', jetzt = heute() < bis && heute().slice(0, 4) === String(J) ? E.monatsende(heute().slice(0, 7)) : bis;
  const ue = E.anlagenUebersicht(state, ix, jetzt), reihe = E.anlagenJahresreihe(state, ix, J);
  $('#eyebrow').textContent = 'Register at ' + dateLong(jetzt) + ' · schedule for ' + J + ' · ' + state.waehrung;
  const aktiv = ue.anlagen.filter(x => !x.abgegangen && x.kosten > 0), jahresAufwand = E.r2(reihe.reduce((s, r) => s + r.aufwand, 0));
  const naechstes = E.r2(E.anlagenJahresreihe(state, ix, J + 1).reduce((s, r) => s + r.aufwand, 0));
  const fort = istGeschlossen(J) ? { bookings: [], anlagen: [] } : E.anlagenFortfuehren(state, ix, J);
  /* the head: the donut of net book values beside the key figures */
  const teile = aktiv.filter(x => x.buchwert > .005).sort((a, b) => b.buchwert - a.buchwert);
  donut($('#sa-donut'), teile.map(x => ({ label: x.anlage.text, wert: x.buchwert, zahl: fz2(x.buchwert), tip: 'Cost ' + fz2(x.kosten) + ' · depreciated ' + fz2(x.gebucht) + ' · per month ' + fz2(x.monatlich) })),
    { v: kTxt(ue.total.buchwert), l: 'net book value' }, 'No asset in the register yet.');
  const figs = $('#sa-figs'); figs.innerHTML = '';
  [['Net book value', fz2(ue.total.buchwert), 'at ' + dateLong(jetzt)], ['Cost', fz2(ue.total.kosten), aktiv.length + ' asset' + (aktiv.length === 1 ? '' : 's') + ' in use'],
    ['Accumulated depreciation', fz2(ue.total.gebucht), 'booked so far'], ['Depreciation ' + J, fz2(jahresAufwand), 'per schedule'],
    ['Per month', fz2(E.r2(aktiv.reduce((s, x) => s + x.monatlich, 0))), 'next year ' + fz2(naechstes)],
    ['Booked as planned', Math.abs(ue.total.fehlt) < .005 ? 'in line' : fz2(ue.total.fehlt), Math.abs(ue.total.fehlt) < .005 ? 'up to ' + dateLong(jetzt) : 'missing up to ' + dateLong(jetzt)]]
    .forEach(f => figs.appendChild(h('div', { class: 'ev-fig' }, [h('div', { class: 'kpi__label' }, [h('span', {}, [f[0]])]), h('div', { class: 'ev-fig__v' }, [f[1]]), h('small', {}, [f[2]])])));
  /* what is not booked yet this year: one button books it (the same dialog as Book's) */
  const off = $('#sa-offen'); off.innerHTML = '';
  if (fort.anlagen.length) off.appendChild(h('div', { class: 'ev-offer' }, [h('span', {}, [fort.anlagen.length + ' asset' + (fort.anlagen.length > 1 ? 's' : '') + ' with depreciation not booked yet in ' + J + ': ' + fort.bookings.length + ' booking' + (fort.bookings.length > 1 ? 's' : '') + ', ' + fz2(fort.anlagen.reduce((s, a) => s + a.betrag, 0)) + '.']),
    h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: () => fortfuehren({ plaene: [], bookings: [] }, fort) }, ['Book them'])]));
  saBuchwertChart(reihe, J, animate); saAufwandChart(reihe, J, animate);
  /* the register */
  const liste = ue.anlagen.slice().sort((a, b) => (a.abgegangen - b.abgegangen) || (a.anlage.datum < b.anlage.datum ? -1 : 1)), zu = istGeschlossen(J), tb = h('tbody');
  liste.forEach(x => {
    const a = x.anlage;
    const status = a.abgang ? [h('span', { class: 'chip ev-chip-sm' }, [(a.abgang.erloes > 0 ? 'sold ' : 'scrapped ') + dateLong(a.abgang.datum)])]
      : x.vorStart ? [h('span', { class: 'chip ev-chip-sm' }, ['from ' + a.start])]
      : Math.abs(x.fehlt) < .005 ? [h('span', { class: 'chip ev-chip-sm is-ok' }, ['in line'])] : [h('span', { class: 'chip ev-chip-sm is-warn' }, [x.fehlt > 0 ? 'to book ' + fz2(x.fehlt) : 'over by ' + fz2(-x.fehlt)])];
    const knopf = (t, fn, art) => h('button', { type: 'button', class: 'btn btn--sm ' + (art || 'btn--ghost'), onclick: e => { e.stopPropagation(); fn(); } }, [t]);
    tb.appendChild(h('tr', { class: 'ev-klick' + (saGewaehlt === a.id ? ' is-current' : ''), title: 'Show the schedule', onclick: () => { saGewaehlt = a.id; renderSachanlagenSeite(false); $('#sa-plan-card').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' }); } }, [
      h('td', { class: 'wrap-ok' }, [h('b', {}, [a.text]), h('small', { class: 'ev-inv-acc' }, [a.konto + (a.wb ? ' / ' + a.wb : '') + ' → ' + a.aufwand])]),
      h('td', { class: 'd' }, [dateLong(a.datum)]), h('td', { class: 'num' }, [fz2(a.kosten), a.restwert ? h('small', { class: 'ev-inv-acc' }, ['residual ' + fz2(a.restwert)]) : null]),
      h('td', {}, [a.monate + ' m' + (a.rhythmus === 'jahr' ? ', yearly' : ''), h('small', { class: 'ev-inv-acc' }, [x.ende ? 'to ' + dateLong(x.ende + '-01').slice(3) : ''])]),
      h('td', { class: 'num' }, [fz2(x.abgegangen ? 0 : x.gebucht)]), h('td', { class: 'num' }, [h('b', {}, [fz2(x.buchwert)])]),
      h('td', { class: 'num' }, [x.abgegangen ? '–' : fz2(x.monatlich)]), h('td', {}, status),
      h('td', { class: 'a' }, zu ? [] : [knopf('Edit', () => anlageDialog({ id: a.id })), a.abgang ? null : knopf('Sell', () => abgangDialog(a.id)),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Remove ' + a.text + ' from the register', title: 'Remove from the register', html: icon('x', 14), onclick: e => { e.stopPropagation(); anlageEntfernen(a.id); } })])]));
  });
  if (liste.length) tb.appendChild(h('tr', { class: 'ev-sumrow' }, [h('td', {}, [h('b', {}, ['Total'])]), h('td'), h('td', { class: 'num' }, [h('b', {}, [fz2(ue.total.kosten)])]), h('td'),
    h('td', { class: 'num' }, [h('b', {}, [fz2(ue.total.gebucht)])]), h('td', { class: 'num' }, [h('b', {}, [fz2(ue.total.buchwert)])]), h('td'), h('td'), h('td')]));
  const reg = $('#sa-register'); reg.innerHTML = '';
  if (!liste.length) reg.appendChild(h('div', { class: 'empty' }, [h('h3', { class: 'empty__title' }, ['No asset yet']), h('p', { class: 'empty__text' }, ['Book a purchase onto an asset account and the register asks for the details, or register an asset already on the books.'])]));
  else reg.appendChild(h('div', { class: 'ev-scroll' }, [h('table', { class: 'table ev-reg' }, [h('thead', {}, [h('tr', {}, ['Asset', 'Acquired', 'Cost', 'Life', 'Depreciated', 'Net book value', 'Per month', 'Status', '']
    .map((t, k) => h('th', { class: [2, 4, 5, 6].indexOf(k) >= 0 ? 'num' : (k === 8 ? 'a' : '') }, [t ? h('span', { class: 'th-sort' }, [t]) : null])))]), tb])]));
  saPlan(liste);
}
function saBuchwertChart(reihe, J, animate){
  const box = $('#sa-chart1'), { W, H, svg } = svgKasten(box, 200), ml = 48, mr = 8, mt = 10, mb = 22, iw = W - ml - mr, ih = H - mt - mb;
  const A = achse(0, Math.max(1, ...reihe.map(r => r.buchwert))), y = v => mt + (A.hi - v) / (A.hi - A.lo) * ih, x = i => ml + iw * (i + .5) / 12;
  gitter(svg, A, y, ml, W, mr);
  const pts = reihe.map((r, i) => [x(i), y(r.buchwert), r]);
  svg.appendChild(h('path', { class: 'ev-area', d: 'M' + pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L') + 'L' + pts[11][0].toFixed(1) + ',' + y(0).toFixed(1) + 'L' + pts[0][0].toFixed(1) + ',' + y(0).toFixed(1) + 'Z' }));
  svg.appendChild(h('path', { class: 'series ev-worth-line' + (animate && !REDUCED ? ' reveal' : ''), d: smooth(pts.map(q => [q[0], q[1]])) }));
  pts.forEach(q => { svg.appendChild(h('circle', { class: 'ev-dot ev-dot--worth', cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 2.6 }));
    svg.appendChild(h('text', { class: 'axis', x: q[0].toFixed(1), y: H - 5, 'text-anchor': 'middle' }, [q[2].kurz])); });
  box.innerHTML = ''; box.appendChild(svg);
  chartHover(box, svg, pts.map(q => ({ x: q[0], y: q[1], titel: 'End of ' + q[2].name + ' ' + J, zeilen: [['Net book value', tsd(q[2].buchwert)], ['Depreciation', tsd(q[2].aufwand)]] })), mt, H - mb);
}
function saAufwandChart(reihe, J, animate){
  const box = $('#sa-chart2'), { W, H, svg } = svgKasten(box, 200), ml = 48, mr = 8, mt = 10, mb = 22, iw = W - ml - mr, ih = H - mt - mb;
  const A = achse(0, Math.max(1, ...reihe.map(r => r.aufwand))), y = v => mt + (A.hi - v) / (A.hi - A.lo) * ih, band = iw / 12, bw = Math.min(22, band * .55);
  gitter(svg, A, y, ml, W, mr);
  const heuteM = heute().slice(0, 7);
  reihe.forEach((r, i) => { const cx = ml + band * (i + .5), monat = J + '-' + String(r.m).padStart(2, '0');
    svg.appendChild(h('rect', { class: 'bar ' + (monat > heuteM ? 'exp ev-bar-plan' : 'exp'), x: (cx - bw / 2).toFixed(1), y: y(r.aufwand).toFixed(1), width: bw.toFixed(1), height: Math.max(1, y(0) - y(r.aufwand)).toFixed(1), rx: Math.min(4, bw / 3),
      style: animate && !REDUCED ? { animationDelay: (i * 35) + 'ms' } : { animation: 'none' } }));
    svg.appendChild(h('text', { class: 'axis', x: cx.toFixed(1), y: H - 5, 'text-anchor': 'middle' }, [r.kurz])); });
  box.innerHTML = ''; box.appendChild(svg);
  chartHover(box, svg, reihe.map((r, i) => ({ x: ml + band * (i + .5), y: null, titel: r.name + ' ' + J + (J + '-' + String(r.m).padStart(2, '0') > heuteM ? ' · planned' : ''),
    zeilen: [['Depreciation', tsd(r.aufwand)]] })), mt, H - mb);
}
/* the schedule of the chosen asset: per year, booked or open; every month in a group that opens */
function saPlan(liste){
  const box = $('#sa-plan'), titel = $('#sa-plan-titel'); box.innerHTML = '';
  const gew = liste.find(x => x.anlage.id === saGewaehlt) || liste.find(x => !x.abgegangen) || liste[0];
  if (!gew){ titel.textContent = 'Schedule'; $('#sa-plan-sub').textContent = ''; return; }
  saGewaehlt = gew.anlage.id;
  const a = gew.anlage, jahre = E.anlageJahre(state, a), plan = E.anlagePlan(state, a);
  titel.textContent = 'Schedule · ' + a.text; $('#sa-plan-sub').textContent = 'Straight-line to ' + fz2(a.restwert) + ' over ' + a.monate + ' months from ' + a.start;
  const tb = h('tbody');
  jahre.forEach(j => tb.appendChild(h('tr', {}, [h('td', {}, [j.jahr]), h('td', { class: 'num' }, [fz2(j.anfang)]), h('td', { class: 'num' }, [fz2(j.aufwand)]), h('td', { class: 'num' }, [h('b', {}, [fz2(j.ende)])]),
    h('td', {}, [j.offen === undefined ? h('span', { class: 'chip ev-chip-sm' }, ['by hand']) : j.offen < .005 ? h('span', { class: 'chip ev-chip-sm is-ok' }, ['booked'])
      : h('span', { class: 'chip ev-chip-sm is-warn' }, [j.gebucht > .005 ? tsd(j.offen, 2) + ' open' : 'open'])])])));
  const monate = h('tbody');
  plan.zeilen.forEach(z => monate.appendChild(h('tr', {}, [h('td', { class: 'd' }, [String(z.nr)]), h('td', {}, [z.monat]), h('td', { class: 'num' }, [z.betrag === null ? '–' : fz2(z.betrag)]),
    h('td', { class: 'ev-fx' }, [({ vorher: 'before the register', fest: 'booked, year closed', gebucht: 'booked', offen: 'to book', nach: 'after the disposal' })[z.quelle]])])));
  const g = h('div', { class: 'group' }), kopf = h('button', { type: 'button', class: 'group__head', 'aria-expanded': 'false' }, [h('span', { class: 'chev' }), h('span', { class: 'group__title' }, ['Every month']), h('span', { class: 'group__meta' }, [plan.zeilen.length + ' months'])]);
  kopf.onclick = () => { const auf = !g.classList.contains('is-open'); g.classList.toggle('is-open', auf); kopf.setAttribute('aria-expanded', String(auf)); };
  g.appendChild(kopf); g.appendChild(h('div', { class: 'group__body' }, [h('div', { class: 'ev-scroll ev-months' }, [h('table', { class: 'table' }, [monate])])]));
  box.appendChild(h('div', { class: 'ev-scroll' }, [h('table', { class: 'table' }, [h('thead', {}, [h('tr', {}, ['Year', 'Opening', 'Depreciation', 'Closing', 'Booked'].map((t, k) => h('th', { class: k && k < 4 ? 'num' : '' }, [h('span', { class: 'th-sort' }, [t])])))]), tb])]));
  box.appendChild(h('div', { class: 'groups ev-plan-months' }, [g]));
}

/* ---------------------------------------------------------------- a dialog with a form (the kit's modal) */
function formular(o){
  const vorher = document.activeElement, ov = h('div', { class: 'overlay' }), m = h('div', { class: 'modal' + (o.breit ? ' ev-modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.titel });
  const zu = () => { document.removeEventListener('keydown', taste, true); ov.classList.add('is-closing'); setTimeout(() => ov.remove(), 200);
    document.dispatchEvent(new CustomEvent('dl:overlay', { detail: { open: false } })); try { if (vorher) vorher.focus({ preventScroll: true }); } catch (e){} if (o.zu) o.zu(); };
  const taste = e => { if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); zu(); } };
  m.appendChild(h('div', { class: 'modal__head' }, [h('div', {}, [h('h2', { class: 'modal__title' }, [o.titel]), o.text ? h('p', { class: 'modal__text' }, [o.text]) : null]),
    h('button', { type: 'button', class: 'modal__close', 'aria-label': 'Close', html: icon('x', 16), onclick: zu })]));
  m.appendChild(o.inhalt);
  const act = h('div', { class: 'modal__actions' }); o.knoepfe.forEach(k => { if (k === 'spacer'){ act.appendChild(h('span', { class: 'spacer' })); return; } act.appendChild(k); });
  m.appendChild(act); ov.appendChild(m);
  ov.addEventListener('pointerdown', e => { if (e.target === ov) zu(); });
  document.body.appendChild(ov); document.addEventListener('keydown', taste, true);
  document.dispatchEvent(new CustomEvent('dl:overlay', { detail: { open: true } }));
  return { zu, m };
}
/* a labelled field; for a dropdown the label points at the select inside its wrapper */
const feld = (label, el, o) => h('div', { class: 'field' + (o && o.cls ? ' ' + o.cls : '') }, [h('label', { class: 'field__label', for: el.id || (el.firstChild && el.firstChild.id) || null }, [label].concat(o && o.extra ? [o.extra] : [])), el]);
const auswahl = (id, liste, wert, leer) => { const s = h('select', { class: 'select', id }); if (leer) s.appendChild(h('option', { value: '' }, [leer]));
  liste.forEach(k => s.appendChild(h('option', { value: k.nr, selected: k.nr === wert ? true : null }, [k.nr + ' · ' + k.name.slice(0, 60)]))); return s; };
const umschlag = s => h('span', { class: 'select-wrap' }, [s]);
const miniFiguren = liste => h('div', { class: 'ev-figs ev-figs--mini' }, liste.map(f => h('div', { class: 'ev-fig' }, [h('div', { class: 'kpi__label' }, [h('span', {}, [f[0]])]), h('div', { class: 'ev-fig__v' + (f[2] ? ' ' + f[2] : '') }, [f[1]])])));

/* ---------------------------------------------------------------- the asset dialog: new, already on the books, or edit */
function anlageDialog(o){
  o = o || {};
  const vorhanden = o.id ? (state.anlagen || []).find(a => a.id === o.id) : null;
  const a = vorhanden ? E.anlageNorm(vorhanden) : E.anlageNorm(Object.assign({ id: '', datum: o.datum || heute(), konto: o.konto || '', kosten: o.kosten || 0, text: o.text || '' }, o.vorgabe || {}));
  if (!vorhanden){
    const v = E.anlageVorschlag(state, ix, a.konto); if (!a.wb && !('wb' in (o.vorgabe || {}))) a.wb = v.wb; if (!a.aufwand) a.aufwand = v.aufwand;
    if (!a.start) a.start = a.datum.slice(0, 7);
    a.ab = o.bestehend ? (heute().slice(0, 4) === String(state.jahr) ? heute().slice(0, 7) : state.jahr + '-01') : a.start;
    if (!a.monate) a.monate = /auto|fahrzeug|car|vehicle/i.test(a.text + ' ' + kontoName(a.konto)) ? 48 : 36;
  }
  const mitAb = !!(o.bestehend || vorhanden);
  const I = (id, attrs) => h('input', Object.assign({ class: 'input', id, autocomplete: 'off' }, attrs));
  const f = {
    text: I('an-text', { value: a.text, placeholder: 'Company car' }), datum: I('an-datum', { value: dateLong(a.datum), inputmode: 'numeric', placeholder: 'dd.mm.yyyy' }),
    kosten: I('an-kosten', { class: 'input num', value: a.kosten ? zahlFmt(a.kosten) : '', inputmode: 'decimal', placeholder: '0.00' }),
    konto: auswahl('an-konto', saKonten((k, g) => E.istAnlageGruppe(g) && !/^\s*(abschreibung|wb|wertberichtigung|kumulierte|accumulated)/i.test(k.name)), a.konto, 'Choose …'),
    wb: null, aufwand: null, start: I('an-start', { type: 'month', value: a.start }),
    rhythmus: (() => { const s = h('select', { class: 'select', id: 'an-rhythmus' }, [h('option', { value: 'monat' }, ['monthly, at month end']), h('option', { value: 'jahr' }, ['once a year, at 31.12.'])]); s.value = a.rhythmus; return s; })(),
    monate: I('an-monate', { class: 'input num', type: 'number', min: '1', max: '1200', step: '1', value: a.monate }),
    restwert: I('an-restwert', { class: 'input num', value: a.restwert ? zahlFmt(a.restwert) : '', inputmode: 'decimal', placeholder: '0.00' }),
    ab: I('an-ab', { type: 'month', value: a.ab }), vorher: I('an-vorher', { class: 'input num', value: a.vorher ? zahlFmt(a.vorher) : '', inputmode: 'decimal', placeholder: '0.00' })
  };
  const kontraUndAufwand = () => {
    const k = ix.km[a.konto], grp = k ? k.grp : null;
    const wb = auswahl('an-wb', saKonten(x => x.grp === grp && x.nr !== a.konto), a.wb, '— none, write the asset account down —');
    const auf = auswahl('an-aufwand', saKonten((x, g) => E.istER(g) && g.vz !== -1), a.aufwand, 'Choose …');
    if (f.wb){ f.wb.parentNode.replaceWith(umschlag(wb)); f.aufwand.parentNode.replaceWith(umschlag(auf)); }
    f.wb = wb; f.aufwand = auf; [wb, auf].forEach(s => s.addEventListener('change', vorschau));
  };
  kontraUndAufwand();
  const jahrKnopf = n => h('button', { type: 'button', class: 'ev-link', onclick: () => { f.monate.value = n * 12; vorschau(); } }, [n + ' y']);
  const vorschauBox = h('div', { class: 'ev-an-preview' });
  const inhalt = h('div', { class: 'ev-an' }, [
    h('div', { class: 'ev-an__grid' }, [
      feld('Asset', f.text, { cls: 'span2' }), feld('Acquired on', f.datum), feld('Cost', f.kosten),
      feld('Asset account', umschlag(f.konto), { cls: 'span2' }), feld('Contra account (accumulated depreciation)', umschlag(f.wb), { cls: 'span2' }),
      feld('Depreciation account', umschlag(f.aufwand), { cls: 'span2' }), feld('First month', f.start, { cls: 'ev-month-f' }), feld('Booked', umschlag(f.rhythmus), { cls: 'ev-month-f' }),
      feld('Useful life, months', h('div', { class: 'ev-life' }, [f.monate, h('span', { class: 'ev-links' }, [3, 4, 5, 10].map(jahrKnopf))])), feld('Residual value', f.restwert),
      mitAb ? feld('Register books from', f.ab, { cls: 'ev-month-f' }) : null, mitAb ? feld('Depreciated before that, by hand', f.vorher, { cls: 'ev-month-f' }) : null]),
    vorschauBox]);
  const ok = h('button', { type: 'button', class: 'btn btn--primary' }, [vorhanden ? 'Save and rebook' : 'Register and book']);
  const knoepfe = [h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => dlg.zu() }, ['Cancel'])];
  if (o.ausBuchung) knoepfe.push(h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => dlg.zu() }, ['Not an asset']));
  knoepfe.push('spacer', ok);
  const dlg = formular({ titel: vorhanden ? 'Edit asset' : (o.bestehend ? 'Register an asset already on the books' : 'New asset'), breit: true,
    text: vorhanden ? 'Bookings of closed years stay as they are; the rest of the cost is spread evenly over the remaining months (prospective change of estimate).'
      : o.bestehend ? 'The depreciation booked by hand so far is entered once; the register continues from the month you choose.'
      : o.ausBuchung ? 'This booking went onto an asset account. Register it, and the depreciation is booked month by month.' : 'The register books the depreciation month by month against the contra account and shows the schedule before you confirm.',
    inhalt, knoepfe });
  function lesen(){
    a.text = f.text.value.trim(); a.konto = f.konto.value; a.wb = f.wb.value; a.aufwand = f.aufwand.value;
    a.datum = E.datumAusEingabe(f.datum.value, a.datum) || ''; a.start = f.start.value; a.ab = mitAb ? (f.ab.value || a.start) : a.start;
    a.monate = parseInt(f.monate.value, 10) || 0; a.kosten = E.r2(E.betragAusEingabe(f.kosten.value) || 0); a.restwert = E.r2(E.betragAusEingabe(f.restwert.value) || 0);
    a.vorher = mitAb ? E.r2(E.betragAusEingabe(f.vorher.value) || 0) : 0; a.rhythmus = f.rhythmus.value;
    return E.anlageNorm(a);
  }
  function vorschau(){
    const n = lesen(), fehler = E.anlagePruefen(n, ix);
    vorschauBox.innerHTML = '';
    if (fehler.length){ ok.disabled = true; vorschauBox.appendChild(h('div', { class: 'ev-check is-fehler' }, [h('span', { class: 'ev-check__i', html: icon('x', 12) }), h('span', {}, [fehler[0]])])); return; }
    ok.disabled = false;
    const probe = Object.assign({}, state, { anlagen: (state.anlagen || []).filter(x => x.id !== n.id).concat([n]) });
    const jahre = E.anlageJahre(probe, n), plan = E.anlagePlan(probe, n), dieses = jahre.find(j => j.jahr === String(state.jahr));
    vorschauBox.appendChild(miniFiguren([['Depreciable', fz2(plan.basis)], ['Per month', fz2(plan.monatlich)], [String(state.jahr), fz2(dieses ? dieses.offen + dieses.gebucht : 0)], ['Last month', plan.ende]]));
    const tb = h('tbody'); jahre.forEach(j => tb.appendChild(h('tr', {}, [h('td', {}, [j.jahr]), h('td', { class: 'num' }, [fz2(j.anfang)]), h('td', { class: 'num' }, [fz2(j.aufwand)]), h('td', { class: 'num' }, [h('b', {}, [fz2(j.ende)])])])));
    vorschauBox.appendChild(h('div', { class: 'ev-scroll ev-an-years' }, [h('table', { class: 'table' }, [h('thead', {}, [h('tr', {}, ['Year', 'Opening', 'Charge', 'Closing'].map((t, k) => h('th', { class: k ? 'num' : '' }, [h('span', { class: 'th-sort' }, [t])])))]), tb])]));
  }
  f.konto.addEventListener('change', () => { lesen(); const v = E.anlageVorschlag(state, ix, a.konto); a.wb = v.wb; a.aufwand = v.aufwand || a.aufwand; kontraUndAufwand(); vorschau(); });
  [f.rhythmus, f.start, f.ab].forEach(el => el.addEventListener('change', vorschau));
  [f.text, f.datum, f.monate, f.kosten, f.restwert, f.vorher].forEach(el => el.addEventListener('input', vorschau));
  ok.onclick = () => {
    const n = lesen(), fehler = E.anlagePruefen(n, ix);
    if (fehler.length){ toast(fehler.join(' '), { type: 'error' }); return; }
    if (!vorhanden) n.id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (o.buchung) n.buchung = o.buchung;
    let anz = 0; const nextId = () => naechsteId();
    if (!aendere(vorhanden ? 'Asset changed' : 'Asset registered', () => {
      state.anlagen = (state.anlagen || []).filter(x => x.id !== n.id); state.anlagen.push(n);
      anz = E.anlageNeuBuchen(state, ix, n, state.jahr, nextId);
    })) return;
    dlg.zu(); saGewaehlt = n.id; render(false);
    toast((vorhanden ? 'Saved: ' : 'Registered: ') + n.text + ', ' + anz + ' depreciation booking' + (anz === 1 ? '' : 's') + ' in ' + state.jahr + '.', { type: 'success', action: { text: 'Undo', fn: rueckgaengig } });
  };
  vorschau();
  setTimeout(() => { f.text.focus(); f.text.select(); }, 40);
}
async function anlageEntfernen(id){
  const a = (state.anlagen || []).find(x => x.id === id); if (!a) return;
  const eigene = state.buchungen.filter(b => b.plan && b.plan.id === id && !istGeschlossen(b.datum.slice(0, 4)));
  const wahl = await frage('Remove ' + a.text + ' from the register?', eigene.length ? 'It has ' + eigene.length + ' depreciation booking' + (eigene.length === 1 ? '' : 's') + ' in open years. Keep them as ordinary bookings, or delete them with it?' : 'No bookings of the register are affected.',
    eigene.length ? [{ text: 'Cancel', wert: null, art: 'leicht' }, { text: 'Delete the bookings too', wert: 'loeschen', art: 'gefahr' }, { text: 'Keep the bookings', wert: 'behalten' }]
      : [{ text: 'Cancel', wert: null, art: 'leicht' }, { text: 'Remove', wert: 'behalten', art: 'gefahr' }]);
  if (!wahl) return;
  if (!aendere('Asset removed from the register', () => {
    state.anlagen = state.anlagen.filter(x => x.id !== id);
    if (wahl === 'loeschen') state.buchungen = state.buchungen.filter(b => !(b.plan && b.plan.id === id && !istGeschlossen(b.datum.slice(0, 4))));
    else state.buchungen.forEach(b => { if (b.plan && b.plan.id === id) delete b.plan; });
  })) return;
  render(false); toast(a.text + ' removed from the register.', { action: { text: 'Undo', fn: rueckgaengig } });
}
/* ---------------------------------------------------------------- the disposal: depreciation to the month, then out with gain or loss */
function abgangDialog(id){
  const a = (state.anlagen || []).find(x => x.id === id); if (!a) return;
  const ak = saAbgangKonten();
  const datum = h('input', { class: 'input', id: 'ab-datum', inputmode: 'numeric', autocomplete: 'off', placeholder: 'dd.mm.yyyy', value: dateLong(heute().slice(0, 4) === String(state.jahr) ? heute() : state.jahr + '-12-31') });
  const erloes = h('input', { class: 'input num', id: 'ab-erloes', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00' });
  const konto = auswahl('ab-konto', saKonten((k, g) => g && g.s === 'A' && (E.cfKonto(ix, k) === 'fonds' || /^1[01]/.test(k.nr))), '1020', 'Choose …');
  const box = h('div', { class: 'ev-an-preview' }), ok = h('button', { type: 'button', class: 'btn btn--primary' }, ['Book the disposal']);
  const inhalt = h('div', { class: 'ev-an' }, [h('div', { class: 'ev-an__grid ev-an__grid--2' }, [feld('Disposal date', datum), feld('Proceeds (0 = scrapped)', erloes), feld('Proceeds received on', umschlag(konto), { cls: 'span2' })]),
    h('p', { class: 'note' }, ['Gain to ' + ak.gewinn + ', loss to ' + ak.verlust + (ak.neu.length ? ' (created in the depreciation group on booking)' : '') + '.']), box]);
  const dlg = formular({ titel: 'Sell or scrap: ' + a.text, text: 'Depreciation runs to the month of the disposal; the asset and its accumulated depreciation leave the balance sheet, the difference to the proceeds is the gain or loss.',
    inhalt, knoepfe: [h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => dlg.zu() }, ['Cancel']), 'spacer', ok] });
  const lesen = () => ({ datum: E.datumAusEingabe(datum.value, heute()) || '', erloes: E.r2(E.betragAusEingabe(erloes.value) || 0), konto: konto.value, gewinn: ak.gewinn, verlust: ak.verlust, neu: ak.neu });
  const vorschau = () => {
    const o = lesen(), ixP = o.neu.length ? E.ctx(Object.assign({}, state, { konten: state.konten.concat(o.neu) })) : ix, r = E.anlageAbgang(state, ixP, a, o);
    box.innerHTML = '';
    if (!r.ok){ ok.disabled = true; box.appendChild(h('div', { class: 'ev-check is-fehler' }, [h('span', { class: 'ev-check__i', html: icon('x', 12) }), h('span', {}, [r.fehler[0]])])); return; }
    ok.disabled = false;
    box.appendChild(miniFiguren([['Depreciated to ' + dateLong(o.datum), fz2(r.gebucht)], ['Net book value', fz2(r.buchwert)], ['Proceeds', fz2(r.erloes)], [(r.ergebnis >= 0 ? 'Gain' : 'Loss') + ' on disposal', fz2(r.ergebnis)]]));
    box.appendChild(h('p', { class: 'note' }, [r.abschreibung + ' depreciation booking' + (r.abschreibung === 1 ? '' : 's') + ' added up to the disposal, ' + r.umdatieren.length + ' moved to the disposal date, ' + r.entfernen.length + ' later one' + (r.entfernen.length === 1 ? '' : 's') + ' removed, then: '
      + r.bookings[r.bookings.length - 1].z.map(z => z[0] + ' ' + (z[1] ? 'Dr ' + fz2(z[1]) : 'Cr ' + fz2(z[2]))).join(' · ')]));
  };
  [datum, erloes].forEach(el => el.addEventListener('input', vorschau)); konto.addEventListener('change', vorschau);
  ok.onclick = () => {
    const o = lesen();
    if (!aendere('Asset disposed of', () => {
      if (o.neu.length){ o.neu.forEach(k => state.konten.push(k)); ix = E.ctx(state); }
      const r = E.anlageAbgang(state, ix, a, o); if (!r.ok) throw new Error(r.fehler.join(' '));
      E.anlageAbgangBuchen(state, a, r, () => naechsteId());
    })) return;
    dlg.zu(); render(false); toast('Disposal booked for ' + a.text + '.', { type: 'success', action: { text: 'Undo', fn: rueckgaengig } });
  };
  vorschau(); setTimeout(() => erloes.focus(), 40);
}
/* an asset already on the books: the account with a balance and no register entry yet comes first */
function bestehendeAnlage(){
  const konten = saKonten(k => E.anlageKonto(ix, k.nr)), s = E.saldoPer(state, state.jahr + '-12-31');
  const mit = konten.filter(k => Math.abs(s[k.nr] || 0) > .005 && !(state.anlagen || []).some(a => a.konto === k.nr && a.status !== 'abgegangen'));
  const k = mit[0] || konten[0];
  if (!k){ toast('No fixed-asset account in the chart. Flag the group on the Structure page first.', { type: 'error' }); return; }
  const v = E.anlageVorschlag(state, ix, k.nr), vorMonat = E.monatPlus(heute().slice(0, 7), -1), sVor = E.saldoPer(state, E.monatsende(vorMonat));
  const vorher = v.wb ? E.r2(-(sVor[v.wb] || 0)) : 0;
  anlageDialog({ bestehend: true, konto: k.nr, kosten: E.r2(s[k.nr] || 0), text: kontoName(k.nr).replace(/\s*\(.*$/, ''), datum: state.jahr + '-01-01', vorgabe: { vorher: vorher > 0 ? vorher : 0 } });
}

/* ---------------------------------------------------------------- wiring */
function initAnlagen(){
  $('#inv-view').onchange = e => { if (!INV_K) return; INV_K.S.invView = e.target.value; invMerken(INV_K); renderAnlagenSeite(true); };
  const rng = $('#inv-jahre');
  /* the horizon follows the slider at once; the file setting is marked as changed when the slider is let go */
  rng.addEventListener('input', e => { if (!INV_K) return; const years = INV_JAHRE = +e.target.value;
    e.target.style.setProperty('--fill', (years / 30 * 100) + '%'); renderAnlagenSeite(false); });
  rng.addEventListener('change', () => { if (INV_K) invMerken(INV_K); });
  $('#inv-reset').onclick = async () => {
    if (!INV_K) return;
    if (!await frage('Reset the forecast?', 'Every monthly pay-in and return assumption goes back to the values derived from your reports, and the horizon back to 30 years.',
      [{ text: 'Cancel', wert: false, art: 'leicht' }, { text: 'Reset', wert: true }])) return;
    const K = INV_K, alt = window.confirm; window.confirm = () => true;     // the engine asks with confirm(); the kit dialog above already asked
    try { K.S.touch = () => {}; K.S.toast = () => {}; K.resetForecast(); } finally { window.confirm = alt; }
    invMerken(K); renderAnlagenSeite(true); toast('Forecast back to its starting values.', { type: 'success' });
  };
  $('#sa-neu').onclick = bestehendeAnlage;
}
