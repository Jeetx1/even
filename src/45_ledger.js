/* =====================================================================
   LEDGER (interface rebuilt on the Design Lab kit, 25.10.2026)
   One account at a time in the window of the page head: the opening balance, the months as groups like the Journal
   (every movement with its contra account and the running balance), the closing balance; foreign currency when the
   account has one. Above: the four figures and the balance as a line. The figures are the engine's (E.hauptbuch); a
   row opens its booking in Book. The export covers this account over exactly the window.
   ===================================================================== */
let hbKonto = '1020';
function hbStandard(){ return ix.km[hbKonto] ? hbKonto : (ix.km['1020'] ? '1020' : kontenSortiert()[0].nr); }
const hbGegen = nr => nr === 'div.' ? 'Split' : (nr === '—' ? '' : nr);

/* the balance through the window as a step line: flat between bookings, a step on each booking day */
function hbLinie(hb, von, bis, animate){
  const box = $('#hb-linie'), W = Math.max(280, Math.round(box.getBoundingClientRect().width || 600)), H = Math.round(box.getBoundingClientRect().height || 120);
  const t0 = Date.parse(von + 'T00:00:00Z'), t1 = Date.parse(bis + 'T00:00:00Z') || t0 + 1, ml = 56, mr = 8, mt = 8, mb = 20, iw = W - ml - mr, ih = H - mt - mb;
  const punkte = [[von, hb.anfang]].concat(hb.zeilen.map(z => [z.datum, z.saldo])).concat([[bis, hb.ende]]);
  const werte = punkte.map(p => p[1]), hi = Math.max(0, ...werte), lo = Math.min(0, ...werte), span = hi - lo || 1;
  const x = d => ml + (Date.parse(d + 'T00:00:00Z') - t0) / Math.max(1, t1 - t0) * iw, y = v => mt + (hi - v) / span * ih;
  let d = 'M' + x(von).toFixed(1) + ',' + y(hb.anfang).toFixed(1), lauf = hb.anfang;
  hb.zeilen.forEach(z => { d += 'H' + x(z.datum).toFixed(1) + 'V' + y(z.saldo).toFixed(1); lauf = z.saldo; });
  d += 'H' + x(bis).toFixed(1);
  const svg = h('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Balance from ' + dateLong(von) + ' to ' + dateLong(bis) });
  [hi, lo].forEach(v => { svg.appendChild(h('line', { class: 'gridline', x1: ml, x2: W - mr, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }));
    svg.appendChild(h('text', { class: 'axis', x: ml - 8, y: (y(v) + 4).toFixed(1), 'text-anchor': 'end' }, [tsd(v)])); });
  if (lo < 0 && hi > 0) svg.appendChild(h('line', { class: 'zero', x1: ml, x2: W - mr, y1: y(0).toFixed(1), y2: y(0).toFixed(1) }));
  const ms = []; for (let m = Number(von.slice(5, 7)); m <= Number(bis.slice(5, 7)); m++) ms.push(m);
  if (ms.length > 1) ms.forEach(m => { const mm = von.slice(0, 4) + '-' + String(m).padStart(2, '0'); const cx = (x(mm + '-01') + x(E.monatsende(mm))) / 2;
    svg.appendChild(h('text', { class: 'axis', x: cx.toFixed(1), y: H - 4, 'text-anchor': 'middle' }, [MONATE[m - 1].slice(0, 3)])); });
  svg.appendChild(h('path', { class: 'area', d: d + 'V' + y(Math.max(lo, Math.min(0, hi))).toFixed(1) + 'H' + x(von).toFixed(1) + 'Z' }));
  svg.appendChild(h('path', { class: 'series' + (animate && !REDUCED ? ' reveal' : ''), d }));
  box.innerHTML = ''; box.appendChild(svg);
  /* hover: the balance at the end of each booking day, and what moved that day */
  const tage = []; punkte.slice(0, -1).forEach(([t, v], i) => { const last = tage[tage.length - 1];
    if (last && last.t === t && tage.length > 1){ last.v = v; last.n++; } else tage.push({ t, v, n: i ? 1 : 0, vor: last ? last.v : hb.anfang }); });
  chartHover(box, svg, tage.map((q, i) => ({ x: x(q.t), y: y(q.v), titel: i ? dateLong(q.t) : 'Opening, ' + dateLong(q.t),
    zeilen: [['Balance', tsd(q.v, 2)]].concat(i ? [[q.n === 1 ? '1 booking' : q.n + ' bookings', (q.v - q.vor >= 0 ? '+' : '−') + tsd(Math.abs(q.v - q.vor), 2)]] : []) })), mt, mt + ih);
}
function renderHauptbuch(animate){
  const nr = hbKonto = state.ui.hbKonto = hbStandard(), k = ix.km[nr], g = ix.gm[k.grp], wkz = k.wkz, w = fenster();
  const inp = $('#hb-konto'); if (document.activeElement !== inp) inp.value = nr + ' ' + k.name;
  $('#hb-info').textContent = (g ? g.t : 'no group') + (wkz ? ', currency ' + wkz : '') + (g && g.s === 'E' ? ', income statement' : ', balance sheet');
  $('#eyebrow').textContent = 'Account ' + nr + ' · ' + (P.ytd ? 'Year to date' : w.t) + ', ' + dateLong(w.von) + ' to ' + dateLong(w.bis) + (w.laeuft ? ' (running)' : '');
  const hb = E.hauptbuch(state, ix, nr, w.von, w.bis);
  /* the four figures */
  const fig = [['Opening', hb.anfang, 'at ' + dateLong(w.von)], ['Debit', hb.summeSoll, hb.zeilen.filter(z => z.soll).length + ' entries'],
    ['Credit', hb.summeHaben, hb.zeilen.filter(z => z.haben).length + ' entries'], ['Closing', hb.ende, 'at ' + dateLong(w.bis)]];
  const sum = $('#hb-summe'); sum.innerHTML = '';
  fig.forEach(f => sum.appendChild(h('div', { class: 'ev-fig' }, [h('div', { class: 'kpi__label' }, [h('span', {}, [f[0]])]),
    h('div', { class: 'ev-fig__v' + (f[1] < -0.005 ? ' neg' : '') }, [tsd(f[1], 2)]), h('small', {}, [f[2]])])));
  if (wkz) sum.appendChild(h('div', { class: 'ev-fig' }, [h('div', { class: 'kpi__label' }, [h('span', {}, ['In ' + wkz])]),
    h('div', { class: 'ev-fig__v' + (hb.fwEnde < -0.005 ? ' neg' : '') }, [tsd(hb.fwEnde, 2)]), h('small', {}, ['from ' + tsd(hb.fwAnfang, 2)])]));
  hbLinie(hb, w.von, w.bis, animate);
  $('#hb-export').textContent = fensterName();
  $('#hb-zaehler').textContent = hb.zeilen.length + (hb.zeilen.length === 1 ? ' entry' : ' entries') + ' in ' + fensterName();
  /* the months as groups, like the Journal: January on top; the head shows the month's movement and its closing balance */
  const box = $('#hb-inhalt'); box.innerHTML = '';
  const rand = (titel, sub, saldo, fw) => h('div', { class: 'ev-edge' }, [h('span', {}, [h('b', {}, [titel]), h('small', {}, [sub])]),
    fw !== null ? h('span', { class: 'ev-edge__fx' }, [tsd(fw, 2) + ' ' + wkz]) : null, h('span', { class: 'ev-edge__v' + (saldo < -0.005 ? ' neg' : '') }, [tsd(saldo, 2)])]);
  box.appendChild(rand('Opening balance', 'at ' + dateLong(w.von), hb.anfang, wkz ? hb.fwAnfang : null));
  const by = {}; hb.zeilen.forEach(z => { (by[z.datum.slice(0, 7)] = by[z.datum.slice(0, 7)] || []).push(z); });
  const keys = Object.keys(by).sort();
  if (keys.length && !keys.some(k => hbOffen[k]) && hbOffen.__ !== false) hbOffen[keys[keys.length - 1]] = true;
  const kopf = ['Date', 'Text', 'Contra', 'Debit', 'Credit'].concat(wkz ? [wkz] : []).concat(['Balance']);
  keys.forEach(k => {
    const zz = by[k], netto = E.r2(zz.reduce((a, x) => a + x.soll - x.haben, 0)), ende = zz[zz.length - 1].saldo;
    const tb = h('tbody');
    zz.forEach(z => {
      const gg = hbGegen(z.gegenkonto);
      tb.appendChild(h('tr', { class: 'ev-klick', title: 'Open in Book', onclick: () => ladeEntwurf(z.id) }, [
        h('td', { class: 'd' }, [dateLong(z.datum)]), h('td', { class: 't wrap-ok' }, [z.text || '–', z.beleg ? h('small', { class: 'ev-fx' }, [' · ' + z.beleg]) : null]),
        h('td', { class: 'k g' }, gg === 'Split' ? [h('span', { class: 'chip ev-chip-sm' }, ['Split'])] : (gg ? [gg + ' ', h('small', {}, [KN[gg] || ''])] : [])),
        h('td', { class: 'num s' }, z.soll ? [tsd(z.soll, 2)] : []), h('td', { class: 'num hb' }, z.haben ? [tsd(z.haben, 2)] : []),
        wkz ? h('td', { class: 'num fx' }, [z.fw ? (z.soll ? '' : '−') + tsd(z.fw, 2) : '']) : null,
        h('td', { class: 'num bal' + (z.saldo < -0.005 ? ' neg' : '') }, [tsd(z.saldo, 2)])]));
    });
    box.appendChild(monatsGruppe(k, hbOffen, [
      h('span', { class: 'group__meta' }, [zz.length + (zz.length === 1 ? ' entry · ' : ' entries · ') + (netto >= 0 ? '+' : '') + tsd(netto, 2)]),
      h('span', { class: 'group__sum' + (ende < -0.005 ? ' neg' : ''), title: 'Balance at the end of the month' }, [tsd(ende, 2)])],
      h('div', { class: 'group__body ev-jo ev-ledger' }, [h('div', { class: 'ev-scroll' }, [h('table', { class: 'table' }, [
        h('thead', {}, [h('tr', {}, kopf.map((t, i) => h('th', { class: i > 2 ? 'num' : '' }, [h('span', { class: 'th-sort' }, [t])])))]), tb])])])));
  });
  if (!keys.length) box.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty' }, [h('h3', { class: 'empty__title' }, ['No movements']), h('p', { class: 'empty__text' }, ['Nothing was booked on ' + nr + ' in ' + fensterName() + '.'])])]));
  box.appendChild(rand('Closing balance', 'at ' + dateLong(w.bis) + ' · debit ' + tsd(hb.summeSoll, 2) + ' · credit ' + tsd(hb.summeHaben, 2), hb.ende, wkz ? hb.fwEnde : null));
}
const hbOffen = {};
function initHauptbuch(){
  /* another account starts with its latest month open again */
  kontoWahl($('#hb-konto'), k => { if (!k) return; hbKonto = k.nr; Object.keys(hbOffen).forEach(x => delete hbOffen[x]); $('#hb-konto').value = k.nr + ' ' + k.name; renderHauptbuch(true); }, () => hbKonto);
  $('#hb-konto').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('#hb-konto')) $('#hb-konto').value = hbKonto + ' ' + kontoName(hbKonto); }, 150));
  $('#hb-xlsx').onclick = () => ledgerExcel(exportFenster());
  $('#hb-pdf').onclick = () => ledgerPdf(exportFenster());
  $('#hb-auf').onclick = () => { delete hbOffen.__; $$('#hb-inhalt .group').forEach(g => { g.classList.add('is-open'); hbOffen[g.dataset.monat] = true; }); };
  $('#hb-zu').onclick = () => { $$('#hb-inhalt .group').forEach(g => g.classList.remove('is-open')); Object.keys(hbOffen).forEach(x => delete hbOffen[x]); hbOffen.__ = false; };
  $('#hb-zumBuchen').onclick = () => { if (!bearbeitet && entwurf && !entwurf.soll && !entwurf.haben && entwurf.modus === 'schnell'){ entwurf.soll = hbKonto; fokusKonto = hbKonto; } zeige('buchen'); };
}
