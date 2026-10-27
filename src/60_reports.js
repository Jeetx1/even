/* =====================================================================
   REPORTS FROM THE BOOKINGS
   Builds the data the statement engine reads (S), in the format of the
   Financial Statements file: one report per period, balance per account,
   assets as they are and everything from 2000 up reversed.
   ===================================================================== */
const FS_MONATE = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const FS_STANDARD = {overrides:{}, cfOverrides:{}, ncOverrides:{}, ncTx:[], cfGross:true, cfChain:false, showVariance:true, investments:[], forecast:{years:10}, invView:"all"};
function fsDaten(state, ix, E, opt){
  opt = opt || {};
  const r2 = E.r2, aw = Object.assign({}, FS_STANDARD, JSON.parse(JSON.stringify(state.auswertung || {})));
  const names = {}; E.konten(state).forEach(k=> names[k.nr] = k.name);
  const gebucht = Object.keys(E.jahreMitBuchungen(state)).map(Number);
  const aktiv = opt.jahr || state.jahr;
  const jahre = Array.from(new Set(gebucht.concat([aktiv]))).sort((a,b)=>a-b);
  const reports = {};
  const bericht = (k, meta, rechne) => {
    let acc = null;
    reports[k] = Object.defineProperty(meta, "accounts", {enumerable:true, configurable:true, get(){ return acc || (acc = rechne()); }});
  };
  // imported closings for years without bookings (the 2023 opening shows as "Opening 2023")
  // opt.bis (YYYY-MM): nothing after this month end. opt.alleMonate: every month end of every year.
  const bisOk = k => !opt.bis || k <= opt.bis;
  (state.vergleichsjahre||[]).filter(v=> jahre.indexOf(v.jahr) < 0).forEach(v=>{
    const nurBilanz = !Object.keys(v.salden).some(nr=> parseFloat(nr) >= 3000);
    if(opt.ohneEroeffnung && nurBilanz) return;
    bericht(v.jahr+"-12", {label: nurBilanz && jahre.indexOf(v.jahr+1) >= 0 ? "Opening "+(v.jahr+1) : "FY "+v.jahr+" (imported)",
      asOf:v.jahr+"-12-31", basis:"FY", importiert:true}, ()=>{
        const m = {}; Object.keys(v.salden).forEach(nr=>{ const s = r2(v.salden[nr]); if(Math.abs(s) >= .005) m[nr] = parseFloat(nr) < 2000 ? s : r2(-s); }); return m; });
  });
  const proJahr = {};      // one pass per year gives all twelve month ends
  const monat = (j, m) => (proJahr[j] = proJahr[j] || E.fsMonatsWerte(state, ix, j))[m-1];
  jahre.forEach(j=>{
    if(bisOk(j+"-12")) bericht(j+"-12", {label:"FY "+j, asOf:j+"-12-31", basis:"FY"}, ()=> monat(j, 12));
    if(j === aktiv || opt.alleMonate) for(let m = 1; m <= 11; m++){
      const k = j+"-"+String(m).padStart(2,"0"), bis = E.letzterTag(j, m);
      if(!bisOk(k)) break;
      bericht(k, {label:"YTD "+FS_MONATE[m-1]+" "+j, asOf:bis, basis:"YTD"}, ()=> monat(j, m));
    }
  });
  // structure, cash flow classes and investment candidates all come from the Structure page and the chart
  const cfBase = E.cfKlassen(state, ix);
  const S = {currency:state.waehrung||"CHF", names:names, reports:reports, overrides:{},
    struktur:E.abschlussStruktur(state), cfBase:cfBase, invKandidaten:E.anlageKandidaten(state, ix, cfBase),
    cfOverrides:aw.cfOverrides, ncOverrides:aw.ncOverrides, ncTx:aw.ncTx, cfGross:aw.cfGross, cfChain:aw.cfChain,
    showVariance:aw.showVariance, investments:aw.investments, forecast:aw.forecast, invView:aw.invView,
    title:state.mandant||"", zerosBS:!!opt.zerosBS, zerosIS:!!opt.zerosIS, cfShowAll:!!opt.cfShowAll,
    toast:(opt.hooks||{}).toast || (()=>{}), touch:(opt.hooks||{}).touch || (()=>{}), go:(opt.hooks||{}).go || (()=>{}),
    activePeriod:opt.p, comparePeriod:opt.c};
  // without a stored mapping, detect the investments once over every month end, so all pages see the same set
  if((!S.investments || !S.investments.length) && !opt.nurErkennen){
    const D = fsDaten(state, ix, E, {jahr:aktiv, alleMonate:true, nurErkennen:true});
    S.investments = D.investments();
  }
  const K = FSKern(S);
  // the chart of accounts decides the group: accounts moved out of their number range become overrides
  E.konten(state).forEach(k=>{ if(K.GROUPS[k.grp] && K.groupOf(k.nr) !== k.grp) S.overrides[k.nr] = k.grp; });
  K.invalidate();
  // the engine's Excel and overview use the cash flow from the bookings (cfDirekt below) where it is loaded
  const direkt = typeof cfDirektZwischen === "function" ? cfDirektZwischen : (opt.cfDirektZwischen || null);
  if(direkt) S.cfDirekt = (p, c) => direkt(K, state, p, c);
  return K;
}
// default report and comparison for a year: finished years at year end, the running year at the last month end
function fsStandard(state, jahr, heute){
  const jetzt = new Date(), h = heute || jetzt.getFullYear()+"-"+String(jetzt.getMonth()+1).padStart(2,"0")+"-"+String(jetzt.getDate()).padStart(2,"0");
  let p = jahr+"-12";
  if(h.slice(0,4) === String(jahr)){ const m = +h.slice(5,7) - 1; p = m >= 1 ? jahr+"-"+String(m).padStart(2,"0") : jahr+"-12"; }
  return {p:p, c:(jahr-1)+"-12"};
}
if(typeof module !== "undefined") module.exports = {fsDaten, fsStandard, FS_STANDARD};
/* ---------- Cash flow, direct method, from the bookings -----------------
   Every booking line on a cash account is a cash flow. Its counter-accounts
   say what it was for. Bookings that never touch cash (depreciation,
   unrealised gains, the leasing takeover, pension contributions) simply do
   not appear; transfers between own cash accounts net to zero.

   Classification uses the statements engine K, so the account classes on
   Statement settings (cfClassOf) and the statement groups decide:
     income statement accounts      -> operating, one line per statement group
     opAsset / opLiab (incl. cards) -> operating
     invest                         -> investing
     finLiab / equity               -> financing
     FX accounts (settings) and unrealised valuation accounts hitting cash
                                    -> effect of exchange rate changes
   A booking with several counter-accounts shares its cash out in proportion
   to the counter lines on the opposite side of the cash line; depreciation and
   unrealised value changes in the same booking never take a share, and neither
   does a realised gain or loss booked together with the sale of an investment
   (the whole proceeds are investing, the gain is not a cash flow).
   Since 12 October 2026: a prepayment booked as a spread (cash onto 1300/1305 or
   2300/2305) shows under the expense or income accounts the spread releases to,
   and operating balance sheet accounts can be shown under an income statement group
   (auswertung.cfZeile, e.g. 2210 Direkte Steuern under Direct taxes). */
function cfDirekt(K, state, von, bis){
  const r2 = K.r2, nil = K.nil;
  const ein = state.einstellungen || {};
  const fxKonten = new Set([ein.kursgewinn, ein.kursverlust].filter(Boolean).map(String));
  const istUnreal = a => /nicht realisiert/i.test(K.nameOf(a) || "") || [6945, 6946, 6955, 6956].indexOf(+a) >= 0;
  const istCash = a => K.cfClassOf(a) === "cash";
  const ohneGeld = a => (+a >= 6800 && +a < 6900) || istUnreal(a);
  // Realised gains and losses on the sale of an investment are not cash flows (IAS 7.14, FER 4): the whole
  // proceeds are investing. Such an account riding along with an investing account in one booking never takes
  // a share. Detected by name ("realisiert", but not dividends, interest or "nicht realisiert"), by the
  // standard numbers, or listed in einstellungen.veraeusserung.
  const veraeusserungListe = new Set((Array.isArray(ein.veraeusserung) ? ein.veraeusserung : []).map(String));
  const istVeraeusserung = a => {
    if(+a < 3000) return false;
    if(veraeusserungListe.has(String(a))) return true;
    if([6942, 6943, 6944, 6952, 6953, 6954].indexOf(+a) >= 0) return true;
    const n = K.nameOf(a) || "";
    return /realisiert/i.test(n) && !/nicht realisiert|dividend|zins|interest/i.test(n);
  };
  const klasse = a => {
    if(+a >= 3000){
      if(fxKonten.has(String(a)) || istUnreal(a)) return "fx";
      return "op";
    }
    const k = K.cfClassOf(a);
    if(k === "opAsset" || k === "opLiab") return "op";
    if(k === "invest") return "inv";
    if(k === "finLiab" || k === "equity") return "fin";
    return k === "cash" ? "cash" : "op";      // unclassified balance sheet accounts count as operating
  };

  const fluss = {}, buchungen = {}, offen = [], ohne = [];   // per account: amount, bookings
  const abgr = new Set([ein.ara, ein.araJahr, ein.pra, ein.praJahr].filter(Boolean).map(String));
  const zeile = (state.auswertung && state.auswertung.cfZeile) || {};
  // where each spread ends up: its releases on income statement accounts, over all years
  const planZiel = {};
  (state.buchungen || []).forEach(b=>{
    if(!b || !b.plan || b.plan.rolle !== "aufloesung") return;
    const m = planZiel[b.plan.id] = planZiel[b.plan.id] || {};
    (b.z || []).forEach(z=>{ if(+z[0] >= 3000) m[z[0]] = r2((m[z[0]] || 0) + Math.abs((+z[1] || 0) - (+z[2] || 0))); });
  });
  const buche = (a, v, id) => { fluss[a] = r2((fluss[a] || 0) + v); (buchungen[a] = buchungen[a] || []).push(id); };
  let nBuch = 0;
  (state.buchungen || []).forEach(b=>{
    if(!b || b.eb || !b.datum || b.datum < von || b.datum > bis) return;
    const netto = {};
    let cash = 0;
    (b.z || []).forEach(z=>{
      const a = String(z[0]), v = r2((+z[1] || 0) - (+z[2] || 0));
      if(istCash(a)) cash = r2(cash + v);
      else netto[a] = r2((netto[a] || 0) + v);
    });
    if(nil(cash)){
      // no cash moved: a non-cash transaction when it builds up or swaps investments, debt or equity
      if((b.z || []).some(z=> istCash(String(z[0])))) return;            // transfer between own cash accounts
      const konten = Object.keys(netto).filter(a=> !nil(netto[a]));
      if(konten.some(ohneGeld)) return;                                    // depreciation, value changes
      const kern = konten.filter(a=> ["inv", "fin"].indexOf(klasse(a)) >= 0);
      if(!kern.length) return;                                             // accruals
      // a reclassification inside one section (lease short/long term, contra account, sub-account) is no transaction
      if(kern.length === konten.length && kern.every(a=> klasse(a) === klasse(kern[0]))) return;
      ohne.push({b, kern, netto});
      return;
    }
    // counter lines on the opposite side of the cash line carry the flow
    let quellen = Object.keys(netto).filter(a=> cash > 0 ? netto[a] < -0.005 : netto[a] > 0.005);
    // a non-cash pair riding along in the same booking (depreciation, unrealised value change) never takes a share
    const echt = quellen.filter(a=> !ohneGeld(a));
    if(echt.length) quellen = echt;
    // a sale of an investment: the realised gain or loss is part of the proceeds, not a flow of its own
    if(quellen.some(a=> klasse(a) === "inv")){
      const ohneGewinn = quellen.filter(a=> !istVeraeusserung(a));
      if(ohneGewinn.length) quellen = ohneGewinn;
    }
    const gewicht = quellen.reduce((s, a)=> s + Math.abs(netto[a]), 0);
    if(!quellen.length || gewicht < 0.005){ offen.push({id:b.id, datum:b.datum, text:b.text, betrag:cash}); return; }
    nBuch++;
    let rest = cash;
    quellen.sort((x, y)=> Math.abs(netto[y]) - Math.abs(netto[x]));
    quellen.forEach((a, i)=>{
      const teil = i === quellen.length - 1 ? rest : r2(cash * Math.abs(netto[a]) / gewicht);
      rest = r2(rest - teil);
      // a spread paid in advance: the cash goes to what the spread is for
      const ziel = b.plan && abgr.has(a) ? planZiel[b.plan.id] : null, zk = ziel ? Object.keys(ziel).filter(k=> ziel[k] > 0) : [];
      if(!zk.length){ buche(a, teil, b.id); return; }
      const summeZ = zk.reduce((t, k)=> t + ziel[k], 0);
      let restZ = teil;
      zk.forEach((k, j)=>{ const t = j === zk.length - 1 ? restZ : r2(teil * ziel[k] / summeZ); restZ = r2(restZ - t); buche(k, t, b.id); });
    });
  });

  // lines: one per statement group, in statement order, accounts as drilldown
  const bereiche = {op:[], inv:[], fin:[], fx:[]};
  const proGruppe = {};
  Object.keys(fluss).forEach(a=>{
    if(nil(fluss[a])) return;
    const k = klasse(a), g = (k === "op" && zeile[a] && K.GROUPS[zeile[a]]) ? zeile[a] : (K.groupOf(a) || "?");
    const key = k+"|"+g;
    (proGruppe[key] = proGruppe[key] || {k, g, konten:[]}).konten.push({a, v:fluss[a], n:buchungen[a].length});
  });
  const reihenfolge = K.IS.concat(K.BS).filter(n=> n.k === "g").map(n=> n.id);
  const rang = g => { const i = reihenfolge.indexOf(g); return i < 0 ? 999 : i; };
  Object.keys(proGruppe).map(k=> proGruppe[k]).sort((x, y)=> rang(x.g) - rang(y.g)).forEach(x=>{
    x.konten.sort((p, q)=> +p.a - +q.a);
    const node = K.GROUPS[x.g];
    bereiche[x.k].push({g:x.g, l:node ? node.l : "Unassigned accounts", v:r2(x.konten.reduce((s, o)=> s + o.v, 0)), konten:x.konten});
  });
  // the note: non-cash transactions, gathered per account they built up or reduced
  // per account set, netted (a trade-in reduces the lease it was set against), named after its largest booking
  const notiz = {};
  ohne.forEach(o=>{
    const key = o.kern.slice().sort().join("+");
    const n = notiz[key] = notiz[key] || {konten:key.split("+"), netto:{}, anzahl:0, text:"", groesste:0};
    o.kern.forEach(a=> n.netto[a] = r2((n.netto[a] || 0) + o.netto[a]));
    const gross = o.kern.reduce((s2, a)=> s2 + Math.abs(o.netto[a]), 0);
    if(gross > n.groesste){ n.groesste = gross; n.text = o.b.text || ""; }
    n.anzahl++;
  });
  const alle = Object.keys(notiz).map(k=> notiz[k]).map(n=>{
    const w = Object.keys(n.netto).map(a=> n.netto[a]);
    const betrag = r2(Math.max(w.filter(v=> v > 0).reduce((s2, v)=> s2 + v, 0), -w.filter(v=> v < 0).reduce((s2, v)=> s2 + v, 0)));
    return {konten:n.konten, betrag, anzahl:n.anzahl,
      l: (n.anzahl <= 3 && n.text ? n.text : n.konten.map(a=> K.nameOf(a)).join(" / ")) + (n.anzahl > 1 ? " ("+n.anzahl+" bookings)" : "")};
  }).filter(n=> !nil(n.betrag)).sort((x, y)=> y.betrag - x.betrag);
  // listed from CHF 500; smaller ones in one line
  const nichtGeld = alle.filter(n=> n.betrag >= 500);
  const klein = alle.filter(n=> n.betrag < 500);
  if(klein.length) nichtGeld.push({konten:[], betrag:r2(klein.reduce((s2, n)=> s2 + n.betrag, 0)), anzahl:klein.reduce((s2, n)=> s2 + n.anzahl, 0), l:"Smaller items", klein:true});
  const summe = arr => r2(arr.reduce((s, o)=> s + o.v, 0));
  const operating = summe(bereiche.op), investing = summe(bereiche.inv), financing = summe(bereiche.fin), fx = summe(bereiche.fx);
  return {von, bis, bereiche, operating, investing, financing, fx,
    net: r2(operating + investing + financing), change: r2(operating + investing + financing + fx),
    buchungen: nBuch, offen, nichtGeld};
}

/* the cash flow between two reports of the statements engine: bookings after
   the comparison date up to the report date, reconciled to cash on the balance sheet */
function cfDirektZwischen(K, state, p, c){
  const a = K.rep(c), b = K.rep(p);
  if(!a || !b) return null;
  let lo = String(a.asOf), hi = String(b.asOf), richtung = 1;
  if(lo > hi){ const t = lo; lo = hi; hi = t; richtung = -1; }
  const naechster = d => new Date(Date.parse(d+"T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const cf = cfDirekt(K, state, naechster(lo), hi);
  const cashKonten = K.allAccounts().filter(x=> K.cfClassOf(x) === "cash");
  // liabilities in the fund (credit cards, if chosen) count against it: the engine shows them with reversed sign
  const cashBei = per => K.r2(cashKonten.reduce((s, x)=> s + (+x >= 2000 ? -1 : 1) * K.accVal(per, x), 0));
  cf.mitSchulden = cashKonten.some(x=> +x >= 2000);
  const [vonP, bisP] = richtung > 0 ? [c, p] : [p, c];
  cf.cashOpen = cashBei(vonP); cf.cashClose = cashBei(bisP);
  cf.check = K.r2(cf.change - (cf.cashClose - cf.cashOpen));
  cf.rueckwaerts = richtung < 0;
  // years in the span without bookings: the cash flow can only cover what was booked
  const jahre = (typeof E !== "undefined" && E.jahreMitBuchungen) ? E.jahreMitBuchungen(state) : null;
  cf.ohneBuchungen = [];
  if(jahre) for(let j = +cf.von.slice(0, 4); j <= +hi.slice(0, 4); j++) if(!jahre[j]) cf.ohneBuchungen.push(j);
  return cf;
}
if(typeof module !== "undefined") module.exports = {cfDirekt, cfDirektZwischen};

