/* =====================================================================
   EVEN · the interface's core (rebuilt on the Design Lab kit, 25.10.2026)
   The engines stay as they are (ENGINE, the statements engine, VORLAGE). This part holds the shell (side navigation,
   page head with the period controls), changes with undo, the question dialog, the toasts, Overview (KPI cards with
   line and delta, the balance picture, month by month) and Journal (months as collapsible groups, search, a click
   opens the booking). 35_file.js opens and saves the file, 40_book.js is Book, 45_ledger.js the Ledger, 62 the
   statements, 64 Overview (Years), Investments and Fixed assets, 66 the setup pages, 99_boot.js wires it all.
   ===================================================================== */
const E = ENGINE;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const NS = 'http://www.w3.org/2000/svg';
const REDUCED = Kit.REDUCED;

/* ---------------------------------------------------------------- state */
let state = null, ix = null, geladen = false, dirty = false, istBeispiel = false;
let handle = null, dateiname = null;
let basis;                                        // the file's "saved" stamp when it was opened or last saved (undefined: not known)
let vgl = null;                                   // {state, name}: the comparison file, only read
const verlauf = { zurueck: [], vor: [] };
const FSA = !!(window.showOpenFilePicker && window.showSaveFilePicker);
const KN = {};                                    // account number → name
/* after every change of the books: the engine's index and the names */
function neuIndex(){ ix = E.ctx(state); Object.keys(KN).forEach(k => delete KN[k]); E.konten(state).forEach(k => { KN[k.nr] = k.name; }); }

/* ---------------------------------------------------------------- helpers */
function h(tag, attrs, kids){
  const e = tag === 'svg' || tag === 'path' || tag === 'rect' || tag === 'line' || tag === 'circle' || tag === 'text' || tag === 'g' || tag === 'title' || tag === 'defs'
    ? document.createElementNS(NS, tag) : document.createElement(tag);
  for (const a in (attrs || {})){
    const v = attrs[a];
    if (v === null || v === undefined || v === false) continue;
    if (a === 'class') e.setAttribute('class', v);
    else if (a === 'html') e.innerHTML = v;
    else if (a === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (a.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(a.slice(2), v);
    else e.setAttribute(a, v === true ? '' : v);
  }
  (kids || []).forEach(k => { if (k !== null && k !== undefined && k !== false) e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k); });
  return e;
}
const icon = (id, s) => '<svg width="' + (s || 18) + '" height="' + (s || 18) + '"><use href="#i-' + id + '"/></svg>';
/* EVEN's page icons (16 px stroke) */
const PI = {
  uebersicht: '<path d="M3 13h4V7H3zM9 13h4V3H9z"/>', ueberjahre: '<path d="M2 14h12M4 11.5V9M7 11.5V7M10 11.5V5M13 11.5V2.5"/>',
  buchen: '<path d="M4 2h8v12H4zM6 5h4M6 8h4M6 11h2"/>', journal: '<path d="M3 3h10M3 6.5h10M3 10h10M3 13.5h6"/>', hauptbuch: '<path d="M3 2v12h10M6 10l2-3 2 2 3-4"/>',
  bilanz: '<path d="M8 2v12M3 5h10M3 5l-1.5 4h3zM13 5l-1.5 4h3zM5 14h6"/>', erfolg: '<path d="M2 12l4-4 3 3 5-6M10 5h4v4"/>', geldfluss: '<path d="M2 5h10l-2-2M14 11H4l2 2"/>',
  anlagen: '<path d="M8 14V8.5M8 8.5C8 5.5 6.2 3.5 2.8 3.5c0 3 2 5 5.2 5zM8 10c0-2.6 1.8-4.3 5-4.3 0 2.7-1.8 4.3-5 4.3z"/>',
  sachanlagen: '<path d="M2 10.5V5h7.5v5.5zM9.5 7h2.8l1.7 2v1.5H9.5z"/><circle cx="4.5" cy="11.5" r="1.3"/><circle cx="11.5" cy="11.5" r="1.3"/>',
  monate: '<path d="M2 3h12v10H2zM2 6h12M5.5 3v10M9 3v10M12.5 3v10"/>', jahre: '<path d="M5.5 2.5h8v8M2.5 5.5h8v8h-8zM2.5 8.5h8"/>',
  konten: '<path d="M3 3h10v10H3zM3 7h10M7 7v6"/>', aufbau: '<path d="M3 3h4v4H3zM9 9h4v4H9zM5 7v4h4"/>',
  fsmapping: '<path d="M2.5 4h2M7.5 4h6M2.5 8h7M12.5 8h1M2.5 12h3M8.5 12h5"/><circle cx="6" cy="4" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="7" cy="12" r="1.5"/>',
  vergleich: '<path d="M4 3v10M12 3v10M4 8h8M2 5l2-2 2 2M10 11l2 2 2-2"/>'
};
const pageIcon = id => '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PI[id] || '') + '</svg>';
/* Swiss format on screen: 1’234.50, a real minus sign */
function tsd(x, dec){
  dec = dec || 0;
  const s = Math.abs(x).toFixed(dec).split('.');
  return (x < 0 && Math.abs(x) >= Math.pow(10, -dec) / 2 ? '−' : '') + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '’') + (s[1] ? '.' + s[1] : '');
}
const dateLong = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
/* for search and the pickers: no accents, no case */
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/* "today" is the local clock's day */
function heute(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const vorJahr = iso => (Number(iso.slice(0, 4)) - 1) + iso.slice(4);
const MONATE = E.MONATE;
/* the reports and exports (PDF, Excel) write 1'234.50 as before */
const nf = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });
const tz = s => s.replace(/['  ’]/g, "'");
function betrag(n){ return tz(nf.format(n)); }
function f(n){ if (n === null || n === undefined || isNaN(n)) return ''; const v = E.r2(n); if (Math.abs(v) < 0.005) return '–'; return (v < 0 ? '−' : '') + betrag(Math.abs(v)); }
function fz(n){ const v = E.r2(n || 0); return (v < 0 ? '−' : '') + betrag(Math.abs(v)); }
function fk(n){ const v = Math.round(n || 0); return (v < 0 ? '−' : '') + tz(nf0.format(Math.abs(v))); }
function fd(d){ if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || ''; const p = d.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function klon(o){ return JSON.parse(JSON.stringify(o)); }
/* the engine reads a few things for "the year" from state.jahr: run a computation for another year, then put it back */
function imJahr(j, fn){ const alt = state.jahr; state.jahr = j; try { return fn(); } finally { state.jahr = alt; } }

/* ---------------------------------------------------------------- changes with undo (a closed year never changes) */
const istGeschlossen = j => !!state && (state.abgeschlossen || []).indexOf(parseInt(j, 10)) >= 0;
function gesperrteSpur(){
  const zu = new Set(state.abgeschlossen || []);
  return zu.size ? JSON.stringify(state.buchungen.filter(b => zu.has(parseInt(String(b.datum).slice(0, 4), 10)))) : '';
}
/* what an undo brings back: everything in the file but the view (state.ui). The state object itself stays, so every
   part keeps its reference to it */
function schnappschuss(){ const o = Object.assign({}, state); delete o.ui; return JSON.stringify(o); }
function setzeStand(s){
  const x = JSON.parse(s), ui = state.ui;
  Object.keys(state).forEach(k => { if (k !== 'ui') delete state[k]; });
  Object.assign(state, x); state.ui = ui;
  neuIndex();
}
/* one change: fn() changes state; on an error or a touched closed year everything goes back. The caller draws again.
   o.jahreFrei: closing or reopening a year changes which years are closed, so the closed-year guard steps aside */
function aendere(beschreibung, fn, o){
  const vorher = schnappschuss(), spur = o && o.jahreFrei ? null : gesperrteSpur();
  try {
    fn();
    if (spur !== null && gesperrteSpur() !== spur) throw new Error('this would change bookings of a closed year. Reopen the year under Years and closings first');
  } catch (err){
    setzeStand(vorher);
    toast('Not done: ' + (err && err.message ? err.message : err), { type: 'error' }); console.error(err);
    return false;
  }
  verlauf.zurueck.push({ b: beschreibung, s: vorher }); if (verlauf.zurueck.length > 20) verlauf.zurueck.shift();
  verlauf.vor = [];
  neuIndex(); markiere();
  return true;
}
function zurueckholen(von, nach, wort){
  if (!geladen) return;
  const e = von.pop();
  if (!e){ toast(wort === 'Undone' ? 'Nothing left to undo.' : 'Nothing to redo.'); return; }
  nach.push({ b: e.b, s: schnappschuss() });
  setzeStand(e.s); markiere();
  buchenNachUndo();
  baueKontrollen(); render(false);
  toast(wort + ': ' + e.b, wort === 'Undone' ? { action: { text: 'Redo', fn: wiederholen } } : {});
}
const rueckgaengig = () => zurueckholen(verlauf.zurueck, verlauf.vor, 'Undone');
const wiederholen = () => zurueckholen(verlauf.vor, verlauf.zurueck, 'Redone');

/* ---------------------------------------------------------------- the question dialog: the kit modal #dlg-frage
   answers with the button's value, null for Escape or a click beside it. The main answer comes last; three or more
   answers stand stacked, the main one on top */
let frageOffen = null;
function frage(titel, text, knoepfe){
  return new Promise(resolve => {
    if (frageOffen) frageOffen();                                   // one question at a time
    const hg = $('#dlg-frage'), box = $('#fr-knoepfe'), vorher = document.activeElement;
    knoepfe = knoepfe || [{ text: 'OK', wert: true }];
    $('#fr-titel').textContent = titel; $('#fr-text').innerHTML = text; box.innerHTML = '';
    box.className = 'modal__actions' + (knoepfe.length > 2 ? ' ev-stack' : '');
    const zu = wert => {
      if (frageOffen !== abbruch) return;
      frageOffen = null; document.removeEventListener('keydown', taste, true);
      hg.classList.remove('on'); hg.hidden = true;
      document.dispatchEvent(new CustomEvent('dl:overlay', { detail: { open: false } }));
      try { if (vorher && vorher.isConnected) vorher.focus({ preventScroll: true }); } catch (e){}
      resolve(wert);
    };
    const abbruch = () => zu(null);
    const taste = e => { if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); zu(null); } };
    knoepfe.forEach(k => box.appendChild(h('button', { type: 'button', class: 'btn ' + ({ gefahr: 'btn--danger', leicht: 'btn--secondary' }[k.art] || 'btn--primary'), onclick: () => zu(k.wert) }, [k.text])));
    hg.onpointerdown = e => { if (e.target === hg) zu(null); };
    frageOffen = abbruch;
    pickerZu();
    hg.hidden = false; hg.classList.add('on');
    document.addEventListener('keydown', taste, true);
    document.dispatchEvent(new CustomEvent('dl:overlay', { detail: { open: true } }));
    const haupt = box.lastChild; if (haupt) haupt.focus();
  });
}

/* ---------------------------------------------------------------- navigation: EVEN's 16 pages in four groups */
const NAV = [
  { g: 'Overview' }, { id: 'uebersicht', t: 'Overview' }, { id: 'ueberjahre', t: 'Overview (Years)' },
  { g: 'Record' }, { id: 'buchen', t: 'Book' }, { id: 'journal', t: 'Journal' }, { id: 'hauptbuch', t: 'Ledger' },
  { g: 'Statements' }, { id: 'bilanz', t: 'Balance sheet' }, { id: 'erfolg', t: 'Income statement' }, { id: 'geldfluss', t: 'Cash flow' },
  { id: 'anlagen', t: 'Investments' }, { id: 'sachanlagen', t: 'Fixed assets' }, { id: 'monate', t: 'Twelve months' }, { id: 'jahre', t: 'Years' },
  { g: 'Setup' }, { id: 'konten', t: 'Accounts' }, { id: 'aufbau', t: 'Structure' }, { id: 'fsmapping', t: 'Statement settings' }, { id: 'vergleich', t: 'Years and closings' }
];
let PAGE = 'uebersicht';
const CTL = { uebersicht: 'jp', buchen: 'j', journal: 'jp', hauptbuch: 'jp', bilanz: 'j', erfolg: 'j', geldfluss: 'j', monate: 'j', sachanlagen: 'j', konten: 'j', fsmapping: 'j' };
function baueNav(){
  const nav = $('#nav'); nav.innerHTML = '';
  NAV.forEach(n => {
    if (n.g){ nav.appendChild(h('div', { class: 'ev-nav__group' }, [n.g])); return; }
    nav.appendChild(h('button', { type: 'button', class: 'ev-nav__item' + (n.id === PAGE ? ' is-active' : ''), 'data-page': n.id, 'data-tab': n.id, 'aria-current': n.id === PAGE ? 'page' : null,
      html: pageIcon(n.id) + '<span>' + n.t + '</span>', onclick: () => zeige(n.id) }));
  });
}
function zeige(id){
  if (!NAV.some(x => x.id === id)) id = 'uebersicht';
  PAGE = id; if (state) state.ui.tab = id;
  const n = NAV.find(x => x.id === id);
  $$('.ev-nav__item').forEach(b => { const on = b.dataset.page === id; b.classList.toggle('is-active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#pageTitle').textContent = n.t;
  const aktiv = $('.ev-nav__item.is-active'), nav = $('#nav');            // the active page stays in sight in the side navigation
  if (aktiv && nav){ const a = aktiv.getBoundingClientRect(), b = nav.getBoundingClientRect(); if (a.top < b.top || a.bottom > b.bottom) nav.scrollTop += a.top - b.top - b.height / 2 + a.height / 2; }
  const seite = { erfolg: 'bilanz', geldfluss: 'bilanz' }[id] || id;      // the three statements share one page
  $$('.ev-page').forEach(s => { const on = s.dataset.page === seite; s.hidden = !on; s.classList.toggle('on', on); });
  /* the controls a page uses: the year everywhere it reads a year, the period only where it reads a window */
  const ctl = CTL[id] || '';
  $('#ctl').hidden = !ctl;
  $('#yearSel').parentElement.hidden = ctl.indexOf('j') < 0;
  $('#periodSel').parentElement.hidden = $('#rangeSeg').hidden = ctl.indexOf('p') < 0;
  pickerZu();
  navZu();
  render(true);
  window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
}
/* phone: the navigation is a sheet */
function navAuf(){ $('#scrim').hidden = false; requestAnimationFrame(() => $('#shell').classList.add('nav-open')); document.dispatchEvent(new CustomEvent('dl:overlay', { detail: { open: true } })); }
function navZu(){ if (!$('#shell').classList.contains('nav-open')) return; $('#shell').classList.remove('nav-open'); document.dispatchEvent(new CustomEvent('dl:overlay', { detail: { open: false } })); setTimeout(() => { $('#scrim').hidden = true; }, REDUCED ? 0 : 260); }

/* ---------------------------------------------------------------- period controls: year, period, Period | Year to date.
   P is what the head shows; the file keeps it in state.ui (periode, ytd) */
const P = { jahr: null, per: 'J', ytd: false };
/* the window the page shows. A year that is still running ends with its latest month that has bookings, so a full year
   or a quarter is never compared with twelve finished months a year earlier ("to the period end, or this month while
   the period runs") */
function fenster(){
  const ps = E.perioden(P.jahr), p = ps.find(x => x.k === P.per) || ps[0];
  let bis = p.bis;
  const letzte = E.buchungenIn(state, P.jahr + '-01-01', P.jahr + '-12-31').filter(b => !b.virtuell).reduce((m, b) => b.datum > m ? b.datum : m, '');
  if (letzte && bis > letzte){ const m = Number(letzte.slice(5, 7)), ende = E.letzterTag(P.jahr, m); if (ende >= p.von && ende < bis) bis = ende; }
  return { von: P.ytd ? P.jahr + '-01-01' : p.von, bis, t: p.t, laeuft: bis !== p.bis };
}
/* the years: every year with bookings, this year, and the year after the latest one (a new year starts by picking it) */
function baueKontrollen(){
  const mit = E.jahreMitBuchungen(state), js = Object.keys(mit).map(Number).concat([state.jahr]);
  const von = Math.min.apply(null, js), bis = Math.max.apply(null, js.concat([new Date().getFullYear()])) + 1;
  P.jahr = state.jahr;
  const y = $('#yearSel'); y.innerHTML = '';
  for (let j = bis; j >= von; j--) y.appendChild(h('option', { value: j, selected: j === P.jahr ? true : null }, [String(j) + (istGeschlossen(j) ? ' · closed' : (mit[j] ? '' : ' · new'))]));
  const p = $('#periodSel'); p.innerHTML = ''; E.perioden(P.jahr).forEach(x => p.appendChild(h('option', { value: x.k, selected: x.k === P.per ? true : null }, [x.k === 'J' ? 'Full year' : x.t.replace(' ' + P.jahr, '')])));
  y.onchange = () => {
    const j = parseInt(y.value, 10); if (!(j >= 1900 && j <= 2200)) return;
    P.jahr = state.jahr = j; jahrGewechselt(); baueKontrollen(); render(true);
    const fort = istGeschlossen(j) ? null : E.spreadsFortfuehren(state, ix, j);
    toast((mit[j] ? 'Year ' + j + (istGeschlossen(j) ? ' (closed, read-only)' : '') : 'Year ' + j + ' is new. Its opening comes from the closing ' + (j - 1) + '.')
      + (fort && fort.plaene.length ? ' ' + fort.plaene.length + ' spread' + (fort.plaene.length > 1 ? 's' : '') + ' from earlier years can be continued on the Book page.' : ''));
  };
  p.onchange = () => { P.per = p.value; render(true); };
}
/* the range switch shows P.ytd */
function zeigeBereich(){
  const s = $('#rangeSeg'), knoepfe = $$('button', s), i = P.ytd ? 1 : 0;
  knoepfe.forEach((k, n) => { k.classList.toggle('is-active', n === i); k.setAttribute('aria-checked', n === i ? 'true' : 'false'); });
  s.style.setProperty('--i', i);
}
function segment(){
  const s = $('#rangeSeg'), knoepfe = $$('button', s);
  knoepfe.forEach(k => k.onclick = () => {
    if (k.classList.contains('is-active')) return;
    P.ytd = k.dataset.ytd === '1'; zeigeBereich();
    s.dispatchEvent(new CustomEvent('dl:seg', { bubbles: true }));    // Glass: liquid pill
    render(true);
  });
}

/* ---------------------------------------------------------------- figures from the engine */
function werte(j, von, bis){
  return imJahr(j, () => {
    const er = E.erfolg(state, ix, von, bis), b = E.bilanz(state, ix, j + '-01-01', bis);
    return { ertrag: er.ertrag, aufwand: er.aufwand, ergebnis: er.ergebnis, rv: E.reinvermoegen(state, ix, bis),
      ekq: b.aktiven.summe ? b.eigenkapital / b.aktiven.summe : null, n: E.buchungenIn(state, von, bis).filter(x => !x.eb).length };
  });
}
/* one value per month of the year up to the end of the window: flows per month, stocks at each month end */
function monate(j, bis){
  const bisM = Number(bis.slice(5, 7)), out = [];
  for (let m = 1; m <= bisM; m++){ const mm = String(m).padStart(2, '0'); out.push(werte(j, j + '-' + mm + '-01', E.letzterTag(j, m))); }
  return out;
}
const KPI = [
  { k: 'ertrag', label: 'Income', pre: 'CHF', better: 'up' },
  { k: 'aufwand', label: 'Expenses', pre: 'CHF', better: 'down' },
  { k: 'ergebnis', label: 'Result', pre: 'CHF', better: 'up' },
  { k: 'rv', label: 'Net worth', pre: 'CHF', better: 'up' },
  { k: 'ekq', label: 'Equity ratio', pct: true, better: 'up' },
  { k: 'n', label: 'Bookings', better: null }
];

/* ---------------------------------------------------------------- KPI cards with the travelling-light line */
function smooth(pts){
  let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for (let i = 1; i < pts.length; i++){ const a = pts[i - 1], b = pts[i], mx = (a[0] + b[0]) / 2; d += 'C' + mx.toFixed(1) + ',' + a[1].toFixed(1) + ' ' + mx.toFixed(1) + ',' + b[1].toFixed(1) + ' ' + b[0].toFixed(1) + ',' + b[1].toFixed(1); }
  return d;
}
const sparkSignal = (svg, phase) => { try { svg.dispatchEvent(new CustomEvent('dl:spark', { bubbles: true, detail: { phase } })); } catch (e){} };   // Glass: frost glint
function sparkDraw(svg, data, run, delay){
  const W = Math.max(40, Math.round(svg.getBoundingClientRect().width || 200)), H = 34, px = 4, py = 5;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  if (!svg._built){ svg.innerHTML = '<path class="spark__glow"/><path class="spark__line"/><path class="spark__trail t1"/><path class="spark__trail t2"/><path class="spark__trail t3"/><circle class="spark__head" r="2.6"/>'; svg._built = true; }
  svg._data = data;
  let d = '';
  if (data.length > 1){ const lo = Math.min.apply(null, data), hi = Math.max.apply(null, data), r = hi - lo || 1; d = smooth(data.map((v, i) => [px + i / (data.length - 1) * (W - 2 * px), H - py - (v - lo) / r * (H - 2 * py)])); }
  $$('.spark__glow, .spark__line, .spark__trail', svg).forEach(p => p.setAttribute('d', d));
  if (run) sparkRun(svg, delay || 0); else { svg.classList.add('is-done'); sparkSignal(svg, 'rest'); }
}
function sparkRun(svg, delay){
  const line = $('.spark__line', svg), total = line.getTotalLength && line.getAttribute('d') ? line.getTotalLength() : 0;
  if (REDUCED || !total){ svg.classList.add('is-done'); sparkSignal(svg, 'rest'); return; }
  const dur = Number(Kit.tok('--spark-dur')) || 1100, tl = Number(Kit.tok('--spark-trail-len')) || .25, glow = $('.spark__glow', svg), head = $('.spark__head', svg);
  const trails = [['.t1', 1], ['.t2', .5], ['.t3', .2]].map(([c, f]) => [$(c, svg), Math.max(4, tl * f * total)]);
  const run = svg._run = {};
  [line, glow].forEach(p => { p.style.strokeDasharray = total + ' ' + total; p.style.strokeDashoffset = total; });
  trails.forEach(([p]) => { p.style.strokeDasharray = '0 ' + total * 2; });
  head.setAttribute('transform', 'translate(-20 -20)');
  svg.classList.remove('is-done', 'is-pending'); svg.classList.add('is-running'); sparkSignal(svg, 'start');
  const t0 = performance.now() + delay, ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  (function step(now){
    if (svg._run !== run || !svg.isConnected) return;
    const x = Math.max(0, Math.min(1, (now - t0) / dur)), dd = ease(x) * total;
    line.style.strokeDashoffset = total - dd; glow.style.strokeDashoffset = total - dd;
    trails.forEach(([p, L]) => { const l = Math.min(L, dd); p.style.strokeDasharray = l + ' ' + total * 2; p.style.strokeDashoffset = -(dd - l); });
    if (x > 0){ const pt = line.getPointAtLength(dd); head.setAttribute('transform', 'translate(' + pt.x.toFixed(2) + ' ' + pt.y.toFixed(2) + ')'); }
    if (x < 1) requestAnimationFrame(step);
    else { line.style.strokeDasharray = ''; line.style.strokeDashoffset = ''; svg.classList.remove('is-running'); svg.classList.add('is-done'); sparkSignal(svg, 'end'); }
  })(performance.now());
}
function revealNumber(el, to, dec){
  const from = Number(el.dataset.v || 0), done = () => el.dispatchEvent(new CustomEvent('dl:number', { bubbles: true }));   // Ember: heat-up
  el.dataset.v = to;
  if (Kit.numberReveal(el, from, to, v => tsd(v, dec), done)) return;                     // Prism: refraction focus
  if (REDUCED || from === to){ el.textContent = tsd(to, dec); done(); return; }
  const t0 = performance.now(), dur = 900;
  (function step(t){ const x = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - x, 3); el.textContent = tsd(from + (to - from) * e, dec); if (x < 1) requestAnimationFrame(step); else done(); })(t0);
}
/* the delta against the same window a year earlier: better = success colour, otherwise neutral, never red */
function delta(k, jetzt, vorher){
  if (vorher === null || jetzt === null || (!vorher && !jetzt)) return null;
  const d = jetzt - vorher;
  const besser = k.better === 'up' ? d > 0.005 : k.better === 'down' ? d < -0.005 : false;
  const txt = k.pct ? (d >= 0 ? '+' : '−') + Math.abs(d * 100).toFixed(1) + ' pts' : (d >= 0 ? '+' : '−') + tsd(Math.abs(d));
  return h('span', { class: 'delta ' + (besser ? 'delta--up' : 'delta--flat') }, [txt]);
}
function renderKPIs(animate){
  const w = fenster(), j = P.jahr, jetzt = werte(j, w.von, w.bis), vorher = werte(j - 1, vorJahr(w.von), vorJahr(w.bis)), reihe = monate(j, w.bis);
  const g = $('#kpis');
  if (!g.children.length) KPI.forEach(() => g.appendChild(h('div', { class: 'card kpi' })));
  KPI.forEach((k, i) => {
    const c = g.children[i];
    let val = $('.kpi__value b', c);
    if (!val){
      val = h('b', {}, ['0']);
      c.appendChild(h('div', {}, [h('div', { class: 'kpi__label' }, [h('span', {}, [k.label])]),
        h('div', { class: 'kpi__value' }, [k.pre ? h('small', { class: 'pre' }, [state.waehrung || k.pre]) : null, val, k.pct ? h('small', {}, ['%']) : null])]));
      const foot = h('div', {}, [h('div', { class: 'kpi__foot' })]);
      foot.insertBefore(h('svg', { class: 'spark', 'aria-hidden': 'true' }), foot.firstChild); c.appendChild(foot);
    }
    const v = jetzt[k.k], vv = vorher[k.k];
    sparkDraw($('.spark', c), reihe.map(r => k.pct ? (r[k.k] || 0) * 100 : r[k.k]), animate, i * 110);
    const fu = $('.kpi__foot', c); fu.innerHTML = '';
    const dl = delta(k, v, vv);
    if (dl){ fu.appendChild(dl); fu.appendChild(h('span', {}, ['vs ' + (j - 1)])); } else fu.appendChild(h('span', {}, [k.k === 'n' ? 'in the window' : 'no ' + (j - 1) + ' to compare']));
    revealNumber(val, k.pct ? (v || 0) * 100 : v, k.pct ? 1 : 0);
  });
}

/* ---------------------------------------------------------------- the balance picture and the balance sheet lists */
const SEK_FARBE = { UV: '--ev-uv', AV: '--ev-av', KFK: '--ev-kfk', LFK: '--ev-lfk', EK: '--ev-ek' };
function renderBilanz(){
  const w = fenster(), j = P.jahr, b = imJahr(j, () => E.bilanz(state, ix, j + '-01-01', w.bis));
  $('#bsSub').textContent = 'At ' + dateLong(w.bis) + ', ' + state.waehrung;
  const ok = Math.abs(b.differenz) < 0.005;
  const chip = $('#bsCheck'); chip.textContent = ok ? 'Balances' : 'Off by ' + tsd(b.differenz, 2);
  chip.style.background = ok ? 'var(--success-soft)' : 'var(--danger-soft)'; chip.style.color = ok ? 'var(--success)' : 'var(--danger)';
  const total = Math.max(b.aktiven.summe, b.passiven.summe, 1);
  const zeile = (titel, sektionen, summe) => h('div', { class: 'ev-bal__row' }, [h('span', {}, [titel]),
    h('div', { class: 'ev-bal__bar' }, sektionen.filter(s => s.summe > 0).map(s => h('i', { style: { width: (s.summe / total * 100).toFixed(2) + '%', background: 'var(' + (SEK_FARBE[s.code] || '--ev-lfk') + ')' }, title: s.titel + ' ' + tsd(s.summe) }))),
    h('span', { class: 'ev-bal__sum' }, [tsd(summe)])]);
  const pic = $('#balPicture'); pic.innerHTML = '';
  pic.appendChild(zeile(b.aktiven.titel, b.aktiven.sektionen, b.aktiven.summe));
  pic.appendChild(zeile(b.passiven.titel, b.passiven.sektionen, b.passiven.summe));
  const liste = (seite) => h('div', {}, [h('h3', {}, [seite.titel])].concat(
    seite.sektionen.filter(s => s.gruppen.length || s.mitErgebnis).map(s => h('div', { class: 'ev-bs__row' }, [
      h('span', {}, [h('i', { style: { background: 'var(' + (SEK_FARBE[s.code] || '--ev-lfk') + ')' } }), s.titel + (s.mitErgebnis ? ' (incl. result)' : '')]),
      h('span', { class: s.summe < 0 ? 'neg' : null }, [tsd(s.summe)])])),
    [h('div', { class: 'ev-bs__row sum' }, [h('span', {}, ['Total']), h('span', {}, [tsd(seite.summe)])])]));
  const ls = $('#bsLists'); ls.innerHTML = '';
  ls.appendChild(liste(b.aktiven)); ls.appendChild(liste(b.passiven));
}

/* ---------------------------------------------------------------- hover on a chart (all charts share it)
   The nearest point snaps under the pointer (a tap on the phone): the kit's dashed cross and dot mark it, the kit's tip
   says the essentials in two or three lines. pts: [{x, y, titel, zeilen: [[label, value], …]}] in the svg's units. */
const tipZeile = (l, v) => '<div class="ev-tip__row"><span>' + l + '</span><b>' + v + '</b></div>';
function chartHover(box, svg, pts, oben, unten){
  if (!pts.length) return;
  $$('title', svg).forEach(t => t.remove());                                     // the tip replaces the native tooltips
  const tip = h('div', { class: 'chart-tip ev-tip', role: 'status' }), cross = h('line', { class: 'cross', y1: oben, y2: unten }), dot = h('circle', { class: 'dot ev-hover-dot', r: 4.5 });
  svg.appendChild(cross); svg.appendChild(dot); box.appendChild(tip);
  const W = Number(String(svg.getAttribute('viewBox') || '').split(/[\s,]+/)[2]) || 1;
  let zuletzt = -1;
  const zeige = clientX => {
    const r = svg.getBoundingClientRect(), s = (r.width || W) / W, x = (clientX - r.left) / s;
    let i = 0; pts.forEach((p, k) => { if (Math.abs(p.x - x) < Math.abs(pts[i].x - x)) i = k; });
    const p = pts[i];
    box.classList.add('is-hover');
    cross.setAttribute('x1', p.x.toFixed(1)); cross.setAttribute('x2', p.x.toFixed(1));
    if (p.y !== undefined && p.y !== null){ dot.style.display = ''; dot.setAttribute('cx', p.x.toFixed(1)); dot.setAttribute('cy', p.y.toFixed(1)); } else dot.style.display = 'none';
    if (i !== zuletzt){ tip.innerHTML = '<b>' + esc(p.titel) + '</b>' + p.zeilen.map(z => tipZeile(esc(z[0]), esc(z[1]))).join(''); zuletzt = i; }
    /* above the point, kept inside the card */
    const bw = box.clientWidth, tw = tip.offsetWidth, mitte = Math.max(tw / 2 + 4, Math.min(bw - tw / 2 - 4, p.x * s + (r.left - box.getBoundingClientRect().left)));
    tip.style.left = mitte + 'px'; tip.style.top = Math.max(tip.offsetHeight + 14, ((p.y !== undefined && p.y !== null ? p.y : oben + 20) * s)) + 'px';
    tip.classList.add('on');
  };
  const weg = () => { box.classList.remove('is-hover'); tip.classList.remove('on'); zuletzt = -1; };
  svg.addEventListener('pointermove', e => zeige(e.clientX));
  svg.addEventListener('pointerdown', e => zeige(e.clientX));
  svg.addEventListener('pointerleave', weg);
}

/* ---------------------------------------------------------------- month by month: income and expenses as bars, the result as a line */
function renderMonate(animate){
  const j = P.jahr, w = fenster(), bisM = Number(w.bis.slice(5, 7)), box = $('#mmChart');
  const r = []; for (let m = 1; m <= 12; m++) r.push(m <= bisM ? werte(j, j + '-' + String(m).padStart(2, '0') + '-01', E.letzterTag(j, m)) : null);
  $('#mmSub').textContent = j + (bisM < 12 ? ', January to ' + MONATE[bisM - 1] : '') + ', ' + state.waehrung;
  const W = Math.max(280, Math.round(box.getBoundingClientRect().width || 520)), H = Math.round(box.getBoundingClientRect().height || 220);
  const ml = 46, mr = 6, mt = 8, mb = 22, iw = W - ml - mr, ih = H - mt - mb;
  const da = r.filter(Boolean), hi = Math.max(1, ...da.map(x => Math.max(x.ertrag, x.aufwand, x.ergebnis))), lo = Math.min(0, ...da.map(x => x.ergebnis));
  const y = v => mt + (hi - v) / (hi - lo) * ih, slot = iw / 12, bw = Math.max(3, Math.min(14, slot * .3));
  const svg = h('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ev-mm', role: 'img', 'aria-label': 'Income and expenses per month' });
  [hi, (hi + lo) / 2, lo].forEach(v => { svg.appendChild(h('line', { class: 'gridline', x1: ml, x2: W - mr, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }));
    svg.appendChild(h('text', { class: 'axis', x: ml - 8, y: (y(v) + 4).toFixed(1), 'text-anchor': 'end' }, [tsd(v / 1000, Math.abs(hi) < 10000 ? 1 : 0) + 'k'])); });
  if (lo < 0) svg.appendChild(h('line', { class: 'zero', x1: ml, x2: W - mr, y1: y(0).toFixed(1), y2: y(0).toFixed(1) }));
  const pts = [];
  r.forEach((x, i) => {
    const cx = ml + slot * (i + .5);
    svg.appendChild(h('text', { class: 'axis', x: cx.toFixed(1), y: H - 6, 'text-anchor': 'middle' }, [MONATE[i].slice(0, 3)]));
    if (!x) return;
    [['inc', x.ertrag, -bw - 1], ['exp', x.aufwand, 1]].forEach(([c, v, dx], k) => {
      const top = y(Math.max(0, v)), hgt = Math.max(1, Math.abs(y(0) - y(v)));
      svg.appendChild(h('rect', { class: 'bar ' + c, x: (cx + dx).toFixed(1), y: top.toFixed(1), width: bw, height: hgt.toFixed(1), rx: Math.min(4, bw / 2),
        style: animate && !REDUCED ? { animationDelay: (i * 40 + k * 20) + 'ms' } : { animation: 'none' } }, [h('title', {}, [MONATE[i] + ': ' + (c === 'inc' ? 'income ' : 'expenses ') + tsd(v)])]));
    });
    pts.push([cx, y(x.ergebnis), x, i]);
  });
  if (pts.length > 1) svg.appendChild(h('path', { class: 'series series--dash res' + (animate && !REDUCED ? ' reveal' : ''), d: smooth(pts.map(p => [p[0], p[1]])) }));
  pts.forEach(p => svg.appendChild(h('circle', { class: 'ev-mm-dot', cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 2.6 })));
  box.innerHTML = ''; box.appendChild(svg);
  chartHover(box, svg, pts.map(p => ({ x: p[0], y: p[1], titel: MONATE[p[3]] + ' ' + j,
    zeilen: [['Income', tsd(p[2].ertrag)], ['Expenses', tsd(p[2].aufwand)], ['Result', tsd(p[2].ergebnis)]] })), mt, H - mb);
}

/* ---------------------------------------------------------------- Journal: the year's bookings by month */
/* a booking as one line: amount, debit and credit account; a split side keeps its parts below */
function buchungsform(b){
  const soll = b.z.filter(z => E.r2((z[1] || 0) - (z[2] || 0)) > 0), haben = b.z.filter(z => E.r2((z[2] || 0) - (z[1] || 0)) > 0);
  const betrag = E.r2(soll.reduce((a, z) => a + (z[1] || 0) - (z[2] || 0), 0));
  const einzel = soll.length === 1 && haben.length === 1 && !soll[0][5] && !haben[0][5];
  const teile = einzel ? [] : (soll.length === 1 ? haben : (haben.length === 1 ? soll : soll.concat(haben)));
  return { soll, haben, betrag, einzel, teile, sollNr: soll.length === 1 ? soll[0][0] : '', habenNr: haben.length === 1 ? haben[0][0] : '' };
}
const fwText = z => z && z[3] ? tsd(z[3], 2) + ' ' + ((ix.km[z[0]] || {}).wkz || '') + ' at ' + z[4] : '';
function planTag(b){
  if (b.eb) return 'Opening';
  if (!b.plan) return '';
  if (b.plan.rolle === 'basis') return 'Spread over ' + b.plan.monate + ' months';
  if (b.plan.rolle === 'uebertrag') return 'Spread, carried over';
  return b.plan.nr ? 'Spread ' + b.plan.nr + '/' + b.plan.von : 'Spread';
}
/* the rows of one booking for the Journal and the latest bookings: a click opens it in Book, Copy fills the form */
function buchungsZeilen(b, o){
  o = o || {};
  const bf = buchungsform(b), fx = bf.einzel ? (fwText(bf.soll[0]) || fwText(bf.haben[0])) : '', tag = planTag(b);
  const konto = nr => nr ? [nr + ' ', h('small', { title: KN[nr] || null }, [KN[nr] || 'unknown account'])] : [h('span', { class: 'chip ev-chip-sm' }, ['Split'])];
  const oeffne = () => ladeEntwurf(b.id);
  const kopf = h('tr', { class: 'ev-klick' + (o.an ? ' is-current' : '') + (o.frisch ? ' is-new' : ''), 'data-edit': b.id, onclick: oeffne, title: 'Open in Book' }, [
    h('td', { class: 'd' }, [dateLong(b.datum)]),
    h('td', { class: 't wrap-ok' }, [b.text || '–', tag ? h('span', { class: 'chip ev-chip-sm' }, [tag]) : null, fx ? h('small', { class: 'ev-fx' }, [' · ' + fx]) : null]),
    h('td', { class: 'k s' }, konto(bf.sollNr)), h('td', { class: 'k hb' }, konto(bf.habenNr)), h('td', { class: 'num' }, [tsd(bf.betrag, 2)]),
    h('td', { class: 'a' }, [h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-kopie': b.id, tabindex: '-1', title: 'Copy into a new booking',
      onclick: e => { e.stopPropagation(); kopiereBuchung(b.id); } }, ['Copy'])])]);
  return [kopf].concat(bf.teile.map(z => {
    const s = E.r2((z[1] || 0) - (z[2] || 0)) > 0, t = [z[5] || '', fwText(z)].filter(Boolean).join(' · ');
    return h('tr', { class: 'z ev-klick', onclick: oeffne }, [h('td', { class: 'd' }), h('td', { class: 't' }, ['↳ ' + (t || KN[z[0]] || '')]),
      h('td', { class: 'k s' }, s ? konto(z[0]) : []), h('td', { class: 'k hb' }, s ? [] : konto(z[0])),
      h('td', { class: 'num' }, [tsd(Math.abs((z[1] || 0) - (z[2] || 0)), 2)]), h('td', { class: 'a' })]);
  }));
}
const buchungsKopf = () => h('thead', {}, [h('tr', {}, ['Date', 'Text', 'Debit', 'Credit', state.waehrung || 'CHF', ''].map((t, i) => h('th', { class: i === 4 ? 'num' : (i === 5 ? 'a' : '') }, [t ? h('span', { class: 'th-sort' }, [t]) : null])))]);

const offen = {};
let suche = '';
/* the window's name, which is also what an export covers: "Full year 2026", "Q1 2026", "March 2026", "January to March 2026" */
function fensterName(){
  const p = E.perioden(P.jahr).find(x => x.k === P.per) || E.perioden(P.jahr)[0];
  return P.ytd && p.k !== 'J' ? 'January to ' + MONATE[Number(p.bis.slice(5, 7)) - 1] + ' ' + P.jahr : p.t;
}
/* months as groups, in calendar order: January on top. Unless the reader chose otherwise, the latest month is open */
function monatsGruppe(k, offenListe, kopf, koerper){
  const auf = !!offenListe[k], g = h('div', { class: 'group' + (auf ? ' is-open' : ''), 'data-monat': k });
  const head = h('button', { type: 'button', class: 'group__head', 'aria-expanded': auf ? 'true' : 'false' }, [h('span', { class: 'chev' }), h('span', { class: 'group__title' }, [MONATE[Number(k.slice(5)) - 1] + ' ' + k.slice(0, 4)])].concat(kopf));
  head.onclick = () => { offenListe[k] = !g.classList.contains('is-open'); g.classList.toggle('is-open', offenListe[k]); head.setAttribute('aria-expanded', offenListe[k] ? 'true' : 'false'); };
  g.appendChild(head); g.appendChild(koerper);
  return g;
}
const hinweisKarte = (art, kids) => h('div', { class: 'ev-check ev-jo-note is-' + art }, [h('span', { class: 'ev-check__i', html: icon(art === 'fehler' ? 'alert' : 'info', 12) }), h('span', {}, kids)]);
function renderJournal(){
  const w = fenster(), box = $('#jo-liste'), q = norm(suche.trim()), betragSuche = E.betragAusEingabe(suche);
  const alle = E.buchungenIn(state, w.von, w.bis).filter(b => !b.virtuell);
  $('#jo-export').textContent = fensterName();
  /* the app's search: text, voucher, account number or name, line text, or the amount */
  const treffer = b => !q || norm(b.text).indexOf(q) >= 0 || norm(b.beleg).indexOf(q) >= 0 || b.z.some(z => z[0].indexOf(suche.trim()) === 0 || norm(KN[z[0]]).indexOf(q) >= 0
    || norm(z[5]).indexOf(q) >= 0 || (isFinite(betragSuche) && Math.abs((z[1] || z[2]) - Math.abs(betragSuche)) < .005));
  const by = {}; alle.filter(treffer).forEach(b => { (by[b.datum.slice(0, 7)] = by[b.datum.slice(0, 7)] || []).push(b); });
  const keys = Object.keys(by).sort();
  if (keys.length && !keys.some(k => offen[k]) && offen.__ !== false) offen[keys[keys.length - 1]] = true;
  const sicht = q ? keys.reduce((o, k) => { o[k] = true; return o; }, {}) : offen;     // a search opens every month it finds, for now only
  const gefunden = keys.reduce((s, k) => s + by[k].length, 0);
  $('#eyebrow').textContent = (P.ytd ? 'Year to date' : w.t) + ', ' + dateLong(w.von) + ' to ' + dateLong(w.bis) + ' · ' + alle.length + ' bookings' + (q ? ' · ' + gefunden + ' found' : '');
  box.innerHTML = '';
  /* what the statements cannot show: bookings without a valid date, and where the opening of the year comes from */
  const kaputt = state.buchungen.filter(b => !E.istDatum(b.datum));
  if (kaputt.length) box.appendChild(hinweisKarte('fehler', ['Without a valid date: ' + kaputt.length + ' booking(s). They are missing from every statement. ']
    .concat(kaputt.map(b => h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-edit': b.id, onclick: () => ladeEntwurf(b.id) }, [b.text || b.id])))));
  if (w.von === P.jahr + '-01-01' && !q){
    const eb = E.eroeffnung(state, P.jahr);
    if (eb) box.appendChild(hinweisKarte('info', ['Opening balance: taken from the ' + eb.quelle + ' (' + eb.z.length + ' accounts). It is not a booking and always follows those figures.'
      + (Math.abs(eb.differenz || 0) >= .005 ? ' That closing does not balance (' + tsd(eb.differenz, 2) + ').' : '')]));
    else if (!state.buchungen.some(b => b.eb && String(b.datum).slice(0, 4) === String(P.jahr)) && alle.length)
      box.appendChild(hinweisKarte('fehler', ['No opening balance for ' + P.jahr + '. Book ' + (P.jahr - 1) + ' in this file, or import the closing ' + (P.jahr - 1) + ' under Years and closings.']));
  }
  if (!keys.length){ box.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty' }, [h('h3', { class: 'empty__title' }, [q ? 'Nothing found' : 'No bookings in ' + fensterName()]),
    h('p', { class: 'empty__text' }, [q ? 'No booking in ' + fensterName() + ' matches “' + suche + '”.' : 'Choose another period in the head of the page.'])])])); return; }
  keys.forEach(k => {
    const rows = by[k], sum = rows.reduce((s, b) => s + buchungsform(b).betrag, 0);
    const tb = h('tbody'); rows.forEach(b => buchungsZeilen(b, { an: b.id === bearbeitet }).forEach(tr => tb.appendChild(tr)));
    box.appendChild(monatsGruppe(k, sicht, [h('span', { class: 'group__meta' }, [rows.length + (rows.length === 1 ? ' booking' : ' bookings')]), h('span', { class: 'group__sum' }, [tsd(sum, 2)])],
      h('div', { class: 'group__body ev-jo' }, [h('div', { class: 'ev-scroll' }, [h('table', { class: 'table ev-buchungen' }, [buchungsKopf(), tb])])])));
  });
}

/* ---------------------------------------------------------------- the open file on screen */
function starteApp(){
  $('#start').classList.remove('on'); $('#shell').classList.add('on');
  neuIndex();
  state.ui = state.ui || {};
  P.jahr = state.jahr; P.per = state.ui.periode || 'J'; P.ytd = !!state.ui.ytd;
  hbKonto = state.ui.hbKonto || '1020';
  ST.jahr = null; ST.p = ST.c = null;
  if (state.ui.fs && state.ui.fs.jahr === state.jahr){ ST.jahr = state.jahr; ST.p = state.ui.fs.p; ST.c = state.ui.fs.c; }
  [offen, hbOffen, ktOffen].forEach(o => Object.keys(o).forEach(k => delete o[k]));
  suche = ''; $('#jo-suche').value = '';
  letztesDatum = null; frischId = null; fokusKonto = null; saGewaehlt = null; INV_JAHRE = null;
  $('#mandant').value = state.mandant || '';
  baueKontrollen(); zeigeBereich();
  neuerEntwurf();
  zeige(state.ui.tab || 'uebersicht');
  zeigeDateiname();
}

/* ---------------------------------------------------------------- render (each page on its own, so one failing view never blanks the others) */
function sicher(name, fn){
  try { fn(); }
  catch (err){
    console.error(name, err);
    const seite = $('.ev-page.on');
    if (seite) seite.insertBefore(h('div', { class: 'ev-check is-fehler ev-fehlerblatt' }, [h('span', { class: 'ev-check__i', html: icon('alert', 12) }),
      h('span', {}, [h('b', {}, ['This view could not be shown completely. ']), (err && err.message ? err.message : String(err)) + '. Your data is unchanged; all other views keep working.'])]), seite.firstChild);
  }
}
function render(animate){
  if (!geladen || !state) return;
  state.ui.periode = P.per; state.ui.ytd = P.ytd; state.ui.tab = PAGE;
  $$('.ev-fehlerblatt').forEach(x => x.remove());
  const w = fenster();
  const R = {
    uebersicht: () => { $('#eyebrow').textContent = (P.ytd ? 'Year to date' : w.t) + ', ' + dateLong(w.von) + ' to ' + dateLong(w.bis) + (w.laeuft ? ' (running)' : '') + ' · ' + state.mandant; renderKPIs(animate); renderBilanz(); renderMonate(animate); },
    journal: renderJournal, buchen: renderBuchen, hauptbuch: () => renderHauptbuch(animate),
    bilanz: renderAbschluss, erfolg: renderAbschluss, geldfluss: renderAbschluss,
    monate: renderMonateSeite, jahre: renderJahreSeite, ueberjahre: () => renderUeberJahreSeite(animate), anlagen: () => renderAnlagenSeite(animate),
    sachanlagen: () => renderSachanlagenSeite(animate), konten: renderKontenSeite, aufbau: renderAufbauSeite, fsmapping: renderFsSeite, vergleich: renderVergleichSeite
  };
  if (R[PAGE]) sicher(PAGE, R[PAGE]);
  sicher('status', renderStatus);
}
/* the kit's toasts, in #meldungen; meldung() is the file code's name for the same */
function toast(msg, o){
  o = o || {};
  const box = $('#meldungen'), type = o.type || 'info', ic = { success: 'check', info: 'info', error: 'alert' }[type];
  const t = h('div', { class: 'toast toast--' + type, role: type === 'error' ? 'alert' : null }, [h('span', { class: 'toast__icon', html: icon(ic, 14) }), h('div', { class: 'toast__body' }, [msg, o.sub ? h('small', {}, [o.sub]) : null])]);
  const weg = () => { if (!t.parentNode) return; t.classList.add('is-leaving'); setTimeout(() => t.remove(), 260); };
  if (o.action) t.appendChild(h('button', { type: 'button', class: 'toast__action', onclick: () => { t.remove(); o.action.fn(); } }, [o.action.text]));
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(weg, o.ms || (o.action ? 8000 : (type === 'error' ? 6000 : 4500)));
}
function meldung(text, o){ o = o || {}; toast(String(text), { type: o.fehler ? 'error' : 'info', action: o.aktion, ms: o.dauer }); }
window.addEventListener('error', e => { if (geladen) meldung('Unexpected error: ' + (e.message || 'unknown') + '. Your data is unchanged.', { fehler: true }); });
window.addEventListener('unhandledrejection', e => { if (geladen) meldung('Unexpected error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), { fehler: true }); });
window.addEventListener('beforeunload', e => { if (dirty && !istBeispiel){ e.preventDefault(); e.returnValue = ''; } });
