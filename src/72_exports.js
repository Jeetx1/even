/* =====================================================================
   EXPORTS: Journal and Ledger (exactly the window of the page head), Twelve months, the financial statements report
   and workbook. One model for Journal and Ledger: the Excel is one flat table (the header in row 1, one row per entry,
   no blank, title or total rows), the PDF a landscape list.
   ===================================================================== */
const XLSX_TYP = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const dateiName = s => String(s||"").replace(/[^\wÄÖÜäöüéèàç &.-]+/g,"").trim().toUpperCase();
/* the window of the page head as an export: its dates, its name in the title, the period chosen as the short name in
   the file name (2026, 2026 Q1, 2026-03, or 2026-01 to 2026-06 for year to date) */
function exportFenster(){
  const w = fenster(), p = E.perioden(P.jahr).find(x => x.k === P.per) || E.perioden(P.jahr)[0];
  const name = p.k === "J" ? String(P.jahr) : P.ytd ? P.jahr+"-01 to "+p.bis.slice(0,7) : p.k.charAt(0) === "Q" ? P.jahr+" "+p.k : p.von.slice(0,7);
  return {von:w.von, bis:w.bis, titel:fensterName(), name:name};
}

/* ---------- Journal ---------------------------------------------------- */
function journalDaten(w){
  const liste = state.buchungen.filter(b=>E.istDatum(b.datum) && b.datum>=w.von && b.datum<=w.bis)
    .sort((a,b)=> a.datum===b.datum ? String(a.id).localeCompare(String(b.id)) : (a.datum<b.datum?-1:1));
  const monate = {};
  liste.forEach(b=>{ (monate[b.datum.slice(0,7)] = monate[b.datum.slice(0,7)]||[]).push(b); });
  return {liste:liste, monate:monate, titel:w.titel, name:w.name};
}
function journalExcel(w){
  const d = journalDaten(w);
  if(!d.liste.length){ meldung("No bookings in "+d.titel+".", {fehler:true}); return; }
  // a split booking becomes one row per part, each with its own debit and credit account, so every row is a complete
  // posting and the sums add up
  const z = [["Date","Month","No.","Text","Line text","Amount","Debit","Debit account","Credit","Credit account"].map(t=>({v:t, s:10}))];
  d.liste.forEach(b=>{
    const bf = buchungsform(b), kopf = [xlDatum(b.datum), b.datum.slice(0,7), String(b.id), b.text||""];
    const zeile = (zt, betrag, s, hb) => z.push(kopf.concat([zt, betrag, xlNr(s), s ? kontoName(s) : "", xlNr(hb), hb ? kontoName(hb) : ""]));
    if(!bf.teile.length){ zeile(fwText(bf.soll[0]) || fwText(bf.haben[0]), bf.betrag, bf.sollNr, bf.habenNr); return; }
    bf.teile.forEach(x=>{ const s = E.r2((x[1]||0)-(x[2]||0)) > 0;
      zeile([x[5]||"", fwText(x)].filter(Boolean).join(" · "), Math.abs(E.r2((x[1]||0)-(x[2]||0))), s ? x[0] : bf.sollNr, s ? bf.habenNr : x[0]); });
  });
  ablegen(new Blob([xlsxDatei([{name:"Journal "+d.name.replace(/ to /, "–"), zeilen:z, breiten:[11,9,8,44,30,14,9,30,9,30], frieren:1, filter:true}])], {type:XLSX_TYP}),
    heute()+"_JOURNAL "+d.name+" "+dateiName(state.mandant)+".xlsx");
  meldung("Journal "+d.titel+" created as Excel.");
}
function journalPdf(w){
  const d = journalDaten(w);
  if(!d.liste.length){ meldung("No bookings in "+d.titel+".", {fehler:true}); return; }
  const konto = nr => nr ? `${esc(nr)} <span style="color:var(--text-3)">${esc(kontoName(nr))}</span>` : `<span style="color:var(--text-3)">Split</span>`;
  const sek = Object.keys(d.monate).sort().map(m=>{
    const bs = d.monate[m], summe = E.r2(bs.reduce((a,b)=>a+buchungsform(b).betrag,0));
    return `<section><h2>Journal ${E.MONATE[+m.slice(5,7)-1]} ${m.slice(0,4)}</h2><div class="rb-sub">${esc(state.mandant)}, amounts in ${esc(state.waehrung)}, ${bs.length} bookings</div>
      <table class="linie"><thead><tr><th class="l" style="width:19mm">Date</th><th class="l">Text</th><th style="width:27mm">Amount</th><th class="l" style="width:62mm">Debit</th><th class="l" style="width:62mm">Credit</th></tr></thead><tbody>`+
      bs.map(b=>{ const bf = buchungsform(b);
        return `<tr class="konto"><td>${fd(b.datum)}</td><td>${esc(b.text||"")}</td><td class="z">${fz(bf.betrag)}</td><td>${konto(bf.sollNr)}</td><td>${konto(bf.habenNr)}</td></tr>`+
          bf.teile.map(x=>{ const s = E.r2((x[1]||0)-(x[2]||0)) > 0;
            return `<tr class="konto"><td></td><td class="v" style="padding-left:5mm">↳ ${esc([x[5]||"", fwText(x)].filter(Boolean).join(" · ") || kontoName(x[0]))}</td>
              <td class="z v">${fz(Math.abs((x[1]||0)-(x[2]||0)))}</td><td>${s?konto(x[0]):""}</td><td>${s?"":konto(x[0])}</td></tr>`; }).join(""); }).join("")+
      `<tr class="summe"><td></td><td>Total</td><td class="z">${fz(summe)}</td><td></td><td></td></tr></tbody></table></section>`;
  }).join("");
  drucke(druckStil(true) + LINIEN_STIL + sek, heute()+"_JOURNAL "+d.name+" "+dateiName(state.mandant));
}
// landscape lists: every entry on one line, long texts cut off with "…"
const LINIEN_STIL = `<style>#bericht table.linie{table-layout:fixed;font-size:8.6pt}
  #bericht table.linie td,#bericht table.linie th{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:.9mm 1.6mm}
  #bericht h2{font-size:13pt}</style>`;
function journalCsv(){
  const w = fenster();
  const z = [["Date","Text","Account","Name","Line text","Debit","Credit","FX amount","Currency","Rate"]];
  state.buchungen.filter(b=>b.datum>=w.von && b.datum<=w.bis).sort((a,b)=>a.datum<b.datum?-1:1)
    .forEach(b=>b.z.forEach(x=> z.push([b.datum,b.text||"",x[0],kontoName(x[0]),x[5]||"",(x[1]||0).toFixed(2),(x[2]||0).toFixed(2),
      x[3]?x[3].toFixed(2):"", (ix.km[x[0]]||{}).wkz||"", x[4]||""])));
  const csv = "\uFEFF"+z.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(";")).join("\r\n");
  ablegen(new Blob([csv],{type:"text/csv;charset=utf-8"}), heute()+"_JOURNAL "+exportFenster().name+".csv");
}

/* ---------- Ledger: the account on screen over the window ------------- */
function hbExportDaten(w){
  const nr = hbKonto, k = ix.km[nr];
  return {nr:nr, k:k, wkz:k.wkz, von:w.von, hb:E.hauptbuch(state, ix, nr, w.von, w.bis), titel:w.titel, name:w.name+" "+nr};
}
// Excel cells: a real date (filterable by year/month/day) and account numbers as numbers where they are plain digits
function xlDatum(iso){ const t = iso.split("-").map(Number); return {v:(Date.UTC(t[0], t[1]-1, t[2]) - Date.UTC(1899, 11, 30)) / 86400000, s:11}; }
function xlNr(nr){ return !nr ? "" : (/^\d+$/.test(nr) ? {v:parseFloat(nr), s:0} : nr); }
function ledgerExcel(w){
  const d = hbExportDaten(w), hb = d.hb, wk = d.wkz;
  // the opening balance as the first row, the last balance is the closing one
  const z = [["Date","Month","No.","Text","Contra","Contra account","Debit","Credit"].concat(wk?[wk]:[]).concat(["Balance"]).map(t=>({v:t, s:10}))];
  z.push([xlDatum(d.von), d.von.slice(0,7), "", "Opening balance", "", "", "", ""].concat(wk?[hb.fwAnfang]:[]).concat([hb.anfang]));
  hb.zeilen.forEach(x=>{ const g = hbGegen(x.gegenkonto);
    z.push([xlDatum(x.datum), x.datum.slice(0,7), String(x.id), x.text||"", xlNr(g), ix.km[g] ? kontoName(g) : "", x.soll||"", x.haben||""]
      .concat(wk?[x.fw ? (x.soll ? x.fw : -x.fw) : ""]:[]).concat([x.saldo])); });
  ablegen(new Blob([xlsxDatei([{name:"Ledger "+d.nr, zeilen:z, breiten:[11,9,8,44,9,28,14,14].concat(wk?[14]:[]).concat([15]), frieren:1, filter:true}])], {type:XLSX_TYP}),
    heute()+"_LEDGER "+d.name+" "+dateiName(state.mandant)+".xlsx");
  meldung("Ledger "+d.nr+", "+d.titel+" created as Excel.");
}
/* the ledger table in the report look: the opening balance, every entry with its contra account, the closing balance */
function ledgerTabelle(hb, wk, von, bis){
  const z = n => `<td class="z ${n < -0.005 ? "neg" : ""}">${fz(n)}</td>`, leer = n => `<td class="z">${n ? fz(n) : ""}</td>`;
  // shares of the width, so the text keeps about a third of the line whatever the paper (fixed widths left it nothing)
  return `<table class="linie"><colgroup><col style="width:8%"><col><col style="width:22%"><col style="width:10%"><col style="width:10%">${wk ? '<col style="width:9%">' : ""}<col style="width:10%"></colgroup>
    <thead><tr><th class="l">Date</th><th class="l">Text</th><th class="l">Contra</th><th>Debit</th><th>Credit</th>${wk ? `<th>${esc(wk)}</th>` : ""}<th>Balance</th></tr></thead><tbody>
    <tr class="eb"><td>${fd(von)}</td><td class="t">Opening balance</td><td></td><td></td><td></td>${wk ? z(hb.fwAnfang) : ""}${z(hb.anfang)}</tr>`+
    hb.zeilen.map(x=>{ const g = hbGegen(x.gegenkonto);
      return `<tr class="position"><td>${fd(x.datum)}</td><td>${esc(x.text||"")}</td><td>${esc(g)}${ix.km[g] ? ` <span class="rb-gegen">${esc(kontoName(g))}</span>` : ""}</td>
        ${leer(x.soll)}${leer(x.haben)}${wk ? `<td class="z">${x.fw ? (x.soll ? "" : "−")+fz(x.fw) : ""}</td>` : ""}${z(x.saldo)}</tr>`; }).join("")+
    `<tr class="summe"><td>${fd(bis)}</td><td>Closing balance</td><td></td>${z(hb.summeSoll)}${z(hb.summeHaben)}${wk ? z(hb.fwEnde) : ""}${z(hb.ende)}</tr></tbody></table>`;
}
/* the four figures of a ledger as the report's cards */
const ledgerKarten = (hb, von, bis) => `<div class="rb-cards">`+[["Opening", hb.anfang, "at "+fd(von)], ["Debit", hb.summeSoll, hb.zeilen.filter(x=> x.soll).length+" entries"],
  ["Credit", hb.summeHaben, hb.zeilen.filter(x=> x.haben).length+" entries"], ["Closing", hb.ende, "at "+fd(bis)]].map(c=>
  `<div class="rb-card"><div class="rb-card-l">${c[0]}</div><div class="rb-card-v${c[1] < -0.005 ? " neg" : ""}">${fz(c[1])}</div><div class="rb-card-s">${c[2]}</div></div>`).join("")+`</div>`;
function ledgerPdf(w){
  const d = hbExportDaten(w), hb = d.hb, wk = d.wkz, bis = w.bis;
  const html = berichtStil({ quer: true, fuss: state.mandant+" · Ledger "+d.nr+", "+d.titel }) +
    `<section class="rb-erste"><div class="rb-head"><span class="rb-mark">${APP_ICONS.even("hb_")}</span><span>${esc(state.mandant)}</span><span class="rb-head-t">Ledger · ${esc(d.titel)}</span></div>
    <div class="rb-eyebrow">Ledger</div><h2>${esc(d.nr)} ${esc(d.k.name)}</h2>
    <div class="rb-sub">${esc(d.titel)} · ${fd(d.von)} to ${fd(bis)} · amounts in ${esc(state.waehrung)} · ${hb.zeilen.length} ${hb.zeilen.length === 1 ? "entry" : "entries"}</div>
    ${ledgerKarten(hb, d.von, bis)}${ledgerTabelle(hb, wk, d.von, bis)}</section>`;
  drucke(html, heute()+"_LEDGER "+d.name+" "+dateiName(state.mandant));
}

/* ---------- Ledger, every account: the full year of the file --------- */
// every account with an opening balance or a movement in the year, in the order of the chart
function alleKontenDaten(){
  const j = state.jahr, von = j+"-01-01", bis = j+"-12-31";
  const konten = kontenSortiert().map(k=>({k:k, hb:E.hauptbuch(state, ix, k.nr, von, bis)}))
    .filter(x=> x.hb.zeilen.length || Math.abs(x.hb.anfang) >= .005 || Math.abs(x.hb.ende) >= .005);
  return {j:j, von:von, bis:bis, konten:konten};
}
function alleKontenExcel(){
  const d = alleKontenDaten();
  if(!d.konten.length){ meldung("No account has a balance or a movement in "+d.j+".", {fehler:true}); return; }
  // one flat table for filtering: the account in the first two columns, per account its opening balance, every entry
  // and its closing balance; no blank or total rows. The currency amount only on foreign-currency accounts
  const z = [["Account","Account name","Date","Month","No.","Text","Contra","Contra account","Debit","Credit","Balance","Currency amount","Currency"].map(t=>({v:t, s:10}))];
  d.konten.forEach(x=>{
    const k = x.k, hb = x.hb, wk = k.wkz || "", vorne = [xlNr(k.nr), k.name];
    z.push(vorne.concat([xlDatum(d.von), d.von.slice(0,7), "", "Opening balance", "", "", "", "", hb.anfang, wk ? hb.fwAnfang : "", wk]));
    hb.zeilen.forEach(r=>{ const g = hbGegen(r.gegenkonto);
      z.push(vorne.concat([xlDatum(r.datum), r.datum.slice(0,7), String(r.id), r.text||"", xlNr(g), ix.km[g] ? kontoName(g) : "", r.soll||"", r.haben||"", r.saldo,
        wk && r.fw ? (r.soll ? r.fw : -r.fw) : "", wk])); });
    z.push(vorne.concat([xlDatum(d.bis), d.bis.slice(0,7), "", "Closing balance", "", "", hb.summeSoll, hb.summeHaben, hb.ende, wk ? hb.fwEnde : "", wk]));
  });
  ablegen(new Blob([xlsxDatei([{name:"Ledger "+d.j, zeilen:z, breiten:[9,34,11,9,8,44,9,28,14,14,15,14,9], frieren:1, filter:true}])], {type:XLSX_TYP}),
    heute()+"_LEDGER ALL ACCOUNTS "+d.j+" "+dateiName(state.mandant)+".xlsx");
  meldung("Ledger of "+d.konten.length+" accounts, "+d.j+", created as Excel.");
}
function alleKontenPdf(status){
  const d = alleKontenDaten();
  if(!d.konten.length){ meldung("No account has a balance or a movement in "+d.j+".", {fehler:true}); return; }
  status = status || "entwurf";
  /* the report look: a title block with the app icon, then the accounts one after another; an account's head never
     stands alone at the foot of a page, and a long account repeats its column heads on the next page */
  const html = berichtStil({ quer: true, fuss: state.mandant+" · Ledger "+d.j+", every account", status: status }) +
    (status === "entwurf" ? `<div class="rb-wz">Draft</div>` : "")+
    `<section class="rb-erste"><div class="rb-titel"><div class="rb-brand">${APP_ICONS.even("hba_")}<div><b>EVEN</b><small>${esc(state.mandant)}</small></div></div>
      <div class="rb-meta"><span class="rb-chip">${status === "entwurf" ? "Draft" : "Final version"}</span><span>Created on ${fd(heute())}</span></div></div>
    <div class="rb-eyebrow" style="margin-top:8mm">Ledger</div><h2>Every account, ${d.j}</h2><div class="rb-spektrum" style="margin:3mm 0 4mm"></div>
    <div class="rb-sub">Full year ${d.j} · ${fd(d.von)} to ${fd(d.bis)} · amounts in ${esc(state.waehrung)} · ${d.konten.length} accounts with a balance or a movement</div>`+
    d.konten.map(x=>{ const k = x.k, hb = x.hb, wk = k.wkz;
      return `<div class="rb-konto"><h3><span class="nr">${esc(k.nr)}</span><span>${esc(k.name)}</span><small>${hb.zeilen.length} ${hb.zeilen.length === 1 ? "entry" : "entries"}${wk ? " · "+esc(wk) : ""} · closing ${fz(hb.ende)}</small></h3>`+
        ledgerTabelle(hb, wk, d.von, d.bis)+`</div>`; }).join("")+`</section>`;
  drucke(html, heute()+"_LEDGER ALL ACCOUNTS "+d.j+" "+dateiName(state.mandant));
}

/* ---------- Twelve months ---------------------------------------------- */
function monateExcel(){
  const mb = E.monatsbericht(state, ix);
  const kopf = t => [[{v:state.mandant, s:5}], [{v:t+" "+state.jahr, s:1}], [{v:"Amounts in "+state.waehrung, s:6}], []];
  const tabelle = (titel, zeilen, mitTotal) => {
    const z = kopf(titel);
    z.push([{v:"Account", s:10}, {v:"Description", s:10}].concat(mb.monate.map(m=>({v:m.kurz, s:10}))).concat(mitTotal?[{v:"Year", s:10}]:[]));
    zeilen.forEach(x=>{
      if(x.typ === "seite" || x.typ === "bereich"){ z.push(["", {v:x.text, s:1}]); return; }
      const fett = x.typ !== "konto", linie = x.typ === "summe" || x.typ === "total";
      const st = linie ? 7 : (fett ? 3 : 2);
      z.push([x.nr ? {v:parseFloat(x.nr), s:0} : "", {v:(x.einzug?"   ":"")+x.text, s: linie ? 8 : (fett ? 1 : 0)}]
        .concat(x.werte.map(v=>({v:v, s:st}))).concat(mitTotal?[{v:x.total, s:st}]:[]));
    });
    return {name:titel, zeilen:z, breiten:[9,46].concat(mb.monate.map(()=>12)).concat(mitTotal?[14]:[]), frieren:5};
  };
  const bl = [tabelle("Income statement by month", mb.erfolg, true), tabelle("Balance sheet by month", mb.bilanz, false)];
  ablegen(new Blob([xlsxDatei(bl)], {type:XLSX_TYP}), heute()+"_TWELVE MONTHS "+state.jahr+" "+dateiName(state.mandant)+".xlsx");
  meldung("Twelve-month report created as Excel.");
}
function druckStil(quer){
  return `<style>
    @page{size:A4 ${quer?"landscape":"portrait"};margin:${quer?"12mm 10mm 14mm 10mm":"18mm 17mm 20mm 17mm"};${OHNE_BROWSERKOPF}
      @bottom-left{content:"${esc(state.mandant).replace(/"/g,"")}";font:8pt -apple-system,"Segoe UI",sans-serif;color:#6b7684}
      @bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt -apple-system,"Segoe UI",sans-serif;color:#6b7684}}
    #bericht{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#101C2B;font-size:${quer?"7.4pt":"9.5pt"};line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    #bericht section{page-break-before:always} #bericht section:first-child{page-break-before:auto}
    #bericht h2{font-size:${quer?"12pt":"15pt"};font-weight:600;margin:0 0 1mm}
    #bericht .rb-sub{color:#48566A;font-size:8.5pt;margin-bottom:4mm}
    #bericht table{width:100%;border-collapse:collapse}
    #bericht th{font-weight:600;color:#8592A6;text-align:right;border-bottom:.6pt solid #101C2B;padding:1.2mm 1.4mm}
    #bericht th:first-child,#bericht th.l{text-align:left}
    #bericht td{padding:${quer?".7mm 1.2mm":"1.1mm 1.8mm"};vertical-align:top}
    #bericht td.z{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    #bericht td.v{color:#48566A} #bericht td.d{color:#8592A6} #bericht td.nr{color:#48566A;width:12mm}
    #bericht .neg{color:#A6262D}
    #bericht tr.teil td{font-size:${quer?"9pt":"11pt"};font-weight:600;padding-top:3mm}
    #bericht tr.bereich td{font-weight:600;color:#2F5E91;padding-top:2.4mm}
    #bericht tr.konto td,#bericht tr.position td{border-bottom:.3pt solid #E3E8EF}
    #bericht tr.konto td.t.e{padding-left:4mm}
    #bericht tr.gruppe td{font-weight:600;border-top:.4pt solid #B8C4D4}
    #bericht tr.summe td{font-weight:600;border-top:.6pt solid #101C2B;background:#F3F6FB}
    #bericht tr.total td{font-weight:700;border-top:.6pt solid #101C2B;border-bottom:1.8pt double #101C2B}
    #bericht tr{page-break-inside:avoid}
    #bericht .rb-hinweis{margin-top:4mm;font-size:8.5pt;color:#6E4C06;background:#FBF3E1;padding:2mm 3mm;border-radius:2mm}
    #bericht .rb-wz{position:fixed;left:0;right:0;top:42%;text-align:center;font-size:96pt;font-weight:700;color:rgba(166,38,45,.07);transform:rotate(-24deg);letter-spacing:.06em}
  </style>`;
}
/* a report goes into #bericht, which only the print shows */
function drucke(html, titel){
  $("#bericht").innerHTML = html;
  const alt = document.title; document.title = titel;
  window.addEventListener("afterprint", ()=>{ document.title = alt; }, {once:true});
  setTimeout(()=>{ try{ window.print(); }catch(e){ meldung("Printing is not possible in this browser.", {fehler:true}); } }, 60);
}
function monatePdf(status){
  const mb = E.monatsbericht(state, ix);
  const z = n => `<td class="z ${n<0?"neg":""}">${Math.abs(n)<.005?"–":fz(n)}</td>`;
  const tab = (zeilen, mitTotal) => `<table><thead><tr><th class="l" colspan="2"></th>${mb.monate.map(m=>`<th>${m.kurz}</th>`).join("")}${mitTotal?"<th>Year</th>":""}</tr></thead><tbody>`+
    zeilen.map(x=> (x.typ === "seite" || x.typ === "bereich")
      ? `<tr class="${x.typ==="seite"?"teil":"bereich"}"><td colspan="${mb.monate.length+(mitTotal?3:2)}">${esc(x.text)}</td></tr>`
      : `<tr class="${x.typ}"><td class="nr">${esc(x.nr||"")}</td><td class="t${x.einzug?" e":""}">${esc(x.text)}</td>${x.werte.map(z).join("")}${mitTotal?z(x.total):""}</tr>`).join("")+`</tbody></table>`;
  const html = druckStil(true) + (status === "entwurf" ? `<div class="rb-wz">Draft</div>` : "") +
    `<section><h2>Income statement by month ${state.jahr}</h2><div class="rb-sub">${esc(state.mandant)}, amounts in ${esc(state.waehrung)}</div>${tab(mb.erfolg, true)}</section>`+
    `<section><h2>Balance sheet at each month end ${state.jahr}</h2><div class="rb-sub">${esc(state.mandant)}, amounts in ${esc(state.waehrung)}</div>${tab(mb.bilanz, false)}</section>`;
  drucke(html, heute()+"_TWELVE MONTHS "+state.jahr+" "+dateiName(state.mandant));
}

/* ---------- Financial statements report (layout of 25 October: the EVEN icon, a numbered cover, figure cards) */
// the engine of the statement pages, with the reports chosen there
const fsKern = () => stKern();
const fsWahl = () => ({p:ST.p, c:ST.c});
// the cash flow rows of the report: the same rows as the cash flow page
function gfBerichtZeilen(K, cf, detail){
  const aus = [], zahl = (v, erg) => ({t: erg ? K.fmt(v, true) : K.fmt(v), neg: !!erg && v < -0.005});
  gfZeilen(K, cf).forEach(r=>{
    if(r.k === "luft") return;
    if(r.k === "teil" || r.k === "bereich"){ aus.push({typ:"bereich", text:r.l}); return; }
    if(r.k === "grp"){
      const auf = detail && r.kids.length;
      aus.push({typ: auf ? "gruppe" : "position", text:r.l, w:zahl(r.w[0])});
      if(auf) r.kids.forEach(k=> aus.push({typ:"konto", nr:k.nr, text:k.l, w:zahl(k.w[0])}));
      return;
    }
    aus.push({typ: r.k === "tot" ? "total" : "summe", text:r.l, w:zahl(r.w[0], r.ergebnis)});
  });
  return aus;
}
// rows straight from the engine's own tables, so figures and grouping are exactly the statement pages'
function fsZeilen(html, detail){
  const t = document.createElement("table"); t.innerHTML = html;
  const reihen = Array.from(t.querySelectorAll("tbody tr")), aus = [];
  reihen.forEach((tr, i)=>{
    const k = tr.classList;
    if(k.contains("spacer")) return;
    if(k.contains("sec")){ aus.push({typ:"bereich", text:tr.textContent.trim()}); return; }
    if(k.contains("leaf") && !detail) return;
    const nums = Array.from(tr.querySelectorAll("td.num")).map(td=>({t:td.textContent.trim(), neg:td.classList.contains("neg")}));
    const acct = tr.querySelector("td.acct"), lbl = tr.querySelector("td.lbl") || tr.children[1];
    let typ = k.contains("leaf") ? "konto" : k.contains("grp") ? "position" : k.contains("tot") ? "total" : "summe";
    if(typ === "position" && detail){ const n = reihen[i+1]; if(n && n.classList.contains("leaf")) typ = "gruppe"; }
    aus.push({typ:typ, nr:acct ? acct.textContent.trim() : "", text:(lbl ? lbl.textContent : "").replace(/[▸▾]/g,"").trim(), w:nums[0], v:nums[1], d:nums[2]});
  });
  return aus;
}
/* ---------- The report look (financial statements, ledgers): one style for every page of these PDFs ---------- */
const RB = { INK: "#16152B", MUTED: "#5B5E78", FAINT: "#8C8FA8", RULE: "#E4E2F2", ACCENT: "#4632E6", TINT: "#F5F3FE",
  SPEKTRUM: "linear-gradient(90deg,#16B2E3,#1FC796 35%,#FFAA2E 65%,#FF5C8A)" };
/* the browser prints its own header (date, title) in every top margin box the page leaves empty: a blank one in each
   keeps it out. The bottom boxes carry the owner and the page numbers, so its footer stays out too */
const OHNE_BROWSERKOPF = `@top-left{content:"\\00a0"}@top-center{content:"\\00a0"}@top-right{content:"\\00a0"}`;
/* o.quer: landscape (ledgers); o.fuss: the text at the foot of every page; o.status: "entwurf" gives the Draft chip */
function berichtStil(o){
  const { INK, MUTED, FAINT, RULE, ACCENT, TINT, SPEKTRUM } = RB, quer = !!o.quer, status = o.status, fussText = String(o.fuss || "").replace(/["\\]/g, "");
  return `<style>
    @page{size:A4 ${quer ? "landscape" : "portrait"};margin:${quer ? "12mm 13mm 14mm 13mm" : "16mm 16mm 18mm 16mm"};${OHNE_BROWSERKOPF}
      @bottom-left{content:"${fussText}";font:7.5pt -apple-system,"Segoe UI",sans-serif;color:${FAINT}}
      @bottom-right{content:counter(page) " / " counter(pages);font:7.5pt -apple-system,"Segoe UI",sans-serif;color:${FAINT}}}
    #bericht{font-family:-apple-system,"Segoe UI",Inter,Helvetica,Arial,sans-serif;color:${INK};font-size:9.2pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    #bericht .rb-seite{page-break-before:always} #bericht .rb-erste{page-break-before:auto}
    #bericht .rb-deck{height:250mm;display:flex;flex-direction:column;position:relative}
    #bericht .rb-brand{display:flex;align-items:center;gap:3.5mm}
    #bericht .rb-brand svg{width:15mm;height:15mm;border-radius:3.6mm;box-shadow:0 .6mm 2.4mm rgba(46,31,184,.18)}
    #bericht .rb-brand b{font-size:12pt;letter-spacing:.14em;font-weight:700}
    #bericht .rb-brand small{display:block;font-size:8.5pt;color:${MUTED};letter-spacing:0;font-weight:400}
    #bericht .rb-mitte{margin-top:auto;margin-bottom:auto}
    #bericht .rb-deck .rb-eyebrow{font-size:8.5pt}
    #bericht .rb-deck h1{font-size:32pt;font-weight:650;letter-spacing:-.025em;margin:3mm 0 3mm;line-height:1.08}
    #bericht .rb-spektrum{width:56mm;height:1.6mm;border-radius:1mm;background:${SPEKTRUM};margin:5mm 0 6mm}
    #bericht .rb-deck .u{font-size:10.5pt;color:${MUTED}}
    #bericht .rb-inhalt{margin-top:14mm;max-width:100mm}
    #bericht .rb-inhalt div{display:flex;gap:5mm;padding:2mm 0;border-bottom:.3pt solid ${RULE};font-size:10pt}
    #bericht .rb-inhalt span{color:${ACCENT};font-variant-numeric:tabular-nums;font-weight:600;width:7mm}
    #bericht .rb-meta{display:flex;align-items:center;gap:3mm;font-size:8.5pt;color:${MUTED}}
    #bericht .rb-chip{display:inline-block;padding:.8mm 2.6mm;border-radius:10mm;font-weight:600;font-size:8pt;background:${status === "entwurf" ? "#FFF2DB;color:#8A5A00" : "#E3F7EE;color:#0E7A4E"}}
    #bericht .rb-head{display:flex;align-items:center;gap:2.2mm;font-size:7.5pt;color:${FAINT};padding-bottom:2.2mm;border-bottom:.3pt solid ${RULE};margin-bottom:7mm}
    #bericht .rb-mark svg{width:5mm;height:5mm;border-radius:1.2mm;display:block}
    #bericht .rb-head-t{margin-left:auto}
    #bericht .rb-eyebrow{font-size:7.5pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${ACCENT}}
    #bericht h2{font-size:17pt;font-weight:650;margin:.8mm 0 1mm;letter-spacing:-.015em}
    #bericht .rb-sub{color:${MUTED};font-size:8.6pt;margin-bottom:6mm}
    #bericht table{width:100%;border-collapse:collapse}
    #bericht th{font-size:6.8pt;font-weight:650;color:${FAINT};text-transform:uppercase;letter-spacing:.07em;text-align:right;border-bottom:.7pt solid ${INK};padding:0 1.8mm 1.6mm}
    #bericht th:first-child,#bericht th.l{text-align:left}
    #bericht td{padding:1.25mm 1.8mm;vertical-align:top}
    #bericht td.z{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;width:27mm}
    #bericht td.v{color:${MUTED}} #bericht td.d{color:${FAINT};width:22mm}
    #bericht td.nr{width:13mm;color:${FAINT};font-variant-numeric:tabular-nums}
    #bericht .neg{color:#B42339}
    #bericht tr.bereich td{font-size:9.6pt;font-weight:650;padding-top:5mm;padding-bottom:1.4mm;color:${ACCENT}}
    #bericht tr.position td,#bericht tr.konto td{border-bottom:.3pt solid ${RULE}}
    #bericht tr.konto td{color:${MUTED};font-size:8.6pt} #bericht tr.konto td.t{padding-left:5mm}
    #bericht tr.gruppe td{font-weight:600;border-bottom:.3pt solid ${RULE}}
    #bericht tr.summe td{font-weight:650;background:${TINT};border-top:.5pt solid ${INK}}
    #bericht tr.total td{font-weight:700;border-top:.7pt solid ${INK};border-bottom:1.8pt double ${INK};font-size:10pt}
    #bericht tr{page-break-inside:avoid}
    #bericht .rb-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:8mm}
    #bericht .rb-card{border:.4pt solid ${RULE};border-radius:2.6mm;padding:3mm 3.2mm;background:linear-gradient(180deg,#FFFFFF,${TINT})}
    #bericht .rb-card-l{font-size:7pt;font-weight:650;color:${FAINT};text-transform:uppercase;letter-spacing:.07em}
    #bericht .rb-card-v{font-size:14pt;font-weight:650;letter-spacing:-.01em;margin:1.2mm 0 .6mm;font-variant-numeric:tabular-nums}
    #bericht .rb-card-s{font-size:7.6pt;color:${MUTED}} #bericht .rb-card-s b{font-weight:600;color:${MUTED}} #bericht .rb-card-s b.gut{color:#0E7A4E}
    #bericht .rb-h3{font-size:10pt;font-weight:650;margin:7mm 0 1mm;color:${INK}}
    #bericht .rb-hinweis{margin-top:4mm;font-size:8.3pt;color:#7A4F00;background:#FFF6E4;padding:2.2mm 3.2mm;border-radius:2mm;border-left:1mm solid #FFAA2E}
    #bericht .rb-fuss{margin-top:3mm;font-size:8pt;color:${MUTED}}
    #bericht .rb-wz{position:fixed;left:0;right:0;top:42%;text-align:center;font-size:96pt;font-weight:700;color:rgba(70,50,230,.055);transform:rotate(-24deg);pointer-events:none;letter-spacing:.06em}
    #bericht table.linie{table-layout:fixed}
    #bericht table.linie td,#bericht table.linie th{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #bericht table.linie td{padding:1.05mm 1.8mm}
    #bericht table.linie td.z{width:auto}
    #bericht tr.eb td{color:${MUTED};border-bottom:.3pt solid ${RULE}}
    #bericht tr.eb td.t{font-weight:600;color:${INK}}
    #bericht .rb-gegen{color:${FAINT}}
    #bericht .rb-titel{display:flex;align-items:flex-end;gap:6mm}
    #bericht .rb-titel .rb-meta{margin-left:auto;padding-bottom:1.6mm}
    #bericht .rb-konto{margin-top:7mm;page-break-inside:auto}
    #bericht .rb-konto h3{display:flex;align-items:baseline;gap:2.6mm;font-size:10.5pt;font-weight:650;margin:0 0 2mm;page-break-after:avoid}
    #bericht .rb-konto h3 .nr{color:${ACCENT};font-variant-numeric:tabular-nums}
    #bericht .rb-konto h3 small{margin-left:auto;font-size:7.8pt;font-weight:400;color:${MUTED}}
    #bericht .rb-konto thead{display:table-header-group}
  </style>`;
}
/* the report as PDF: sum = summarized (no accounts), status = "entwurf" (draft, watermark) or "definitiv" */
function fsBericht(sum, status){
  const K = fsKern(); const w = fsWahl(K), p = w.p, c = w.c, G = K.GROUPS, R = K.rep(p);
  status = status || "entwurf";
  const detail = !sum;
  const titel = R.basis === "YTD" ? "Interim statements as at "+fd(R.asOf) : "Annual statements "+p.slice(0,4);
  const vglT = K.periodLabel(c), cur = K.CUR();
  const fussText = (state.mandant+" · "+titel).replace(/["\\]/g,"");
  const fm = v => K.fmt(v).replace(/\u2019/g, "'");
  const zelle = (x, kl) => !x ? `<td class="z ${kl||""}"></td>` : `<td class="z ${kl||""} ${x.neg?"neg":""}">${x.t === "0.00" ? "–" : esc(x.t.replace(/\u2019/g, "'"))}</td>`;
  const zahl = (n, kl) => `<td class="z ${kl||""} ${n < -0.005 ? "neg" : ""}">${Math.abs(n) < .005 ? "–" : fm(n)}</td>`;
  const tabelle = (zeilen, kopfW, kopfV) => `<table><thead><tr><th class="l" colspan="2"></th><th>${esc(kopfW)}</th>${kopfV?`<th>${esc(kopfV)}</th><th>Change</th>`:""}</tr></thead><tbody>`+
    zeilen.map(x=> x.typ === "bereich" ? `<tr class="bereich"><td colspan="${kopfV?5:3}">${esc(x.text)}</td></tr>`
      : `<tr class="${x.typ}"><td class="nr">${esc(x.nr||"")}</td><td class="t">${esc(x.text)}</td>${zelle(x.w)}${kopfV?zelle(x.v,"v")+zelle(x.d,"d"):""}</tr>`).join("")+`</tbody></table>`;
  // key figures, all from the statement engine
  const ta = K.nodeVal(G.TA,p), tl = K.nodeVal(G.TL,p), eq = K.nodeVal(G.EQ,p), cash = K.nodeVal(G.FONDS,p);
  const taC = K.nodeVal(G.TA,c), tlC = K.nodeVal(G.TL,c), eqC = K.nodeVal(G.EQ,c), cashC = K.nodeVal(G.FONDS,c);
  const ti = K.nodeVal(G.TI,p), np = K.nodeVal(G.NP,p), tiC = K.nodeVal(G.TI,c), npC = K.nodeVal(G.NP,c);
  const pz2 = x => isFinite(x) ? (x*100).toFixed(1)+"%" : "–";
  const cf = p !== c ? cfDirektZwischen(K, state, p, c) : null;
  const kennz = [["Total assets", ta, taC], ["Total liabilities", tl, tlC], ["Net worth (equity)", eq, eqC], ["Cash and cash equivalents", cash, cashC],
    ["Cash, equivalents and investments", cash+K.investedAt(p), cashC+K.investedAt(c)], ["Total income", ti, tiC], ["Total expenses", -(ti-np), -(tiC-npC)],
    ["Result for the period", np, npC]];
  const set = K.investments().filter(i=> i.include);
  const summe = (q, accs) => K.r2(accs.reduce((s, a)=> s + K.accVal(q, a), 0));
  const teile = [{id:"kennzahlen", t:"Key figures"}, {id:"bilanz", t:"Balance sheet"}, {id:"erfolg", t:"Income statement"}].concat(cf ? [{id:"geldfluss", t:"Cash flow statement"}] : []).concat(set.length ? [{id:"anlagen", t:"Investments"}] : []);
  const nr = id => String(teile.findIndex(x=> x.id === id) + 1).padStart(2, "0");
  /* the EVEN app icon (FINAL series), one copy per page so its gradients never share an id */
  let logos = 0; const logo = () => APP_ICONS.even("rb"+(++logos)+"_");
  const sub = t => `<div class="rb-sub">${t}</div>`;
  const stdSub = sub(`${esc(K.periodLabel(p))} compared with ${esc(vglT)} · amounts in ${esc(cur)}`);
  /* every page after the cover: a slim running head (logo, owner, report) and the section's number and name */
  let erste = true;
  const seite = (id, titel) => { const k = erste ? "rb-erste" : "rb-seite"; erste = false;
    return `<section class="${k}"><div class="rb-head"><span class="rb-mark">${logo()}</span><span>${esc(state.mandant)}</span><span class="rb-head-t">${esc(titel)}</span></div>`+
      `<div class="rb-eyebrow">${nr(id)}</div><h2>${esc(teile.find(x=> x.id === id).t)}</h2>`; };
  /* the figure cards on the key-figure page: value, comparison and change; better is green, never red for worse */
  const karte = (l, v, vv, besser, pct) => { const d = K.r2(v - vv), gut = besser === "up" ? d > .005 : besser === "down" ? d < -.005 : false;
    return `<div class="rb-card"><div class="rb-card-l">${esc(l)}</div><div class="rb-card-v${!pct && v < -0.005 ? " neg" : ""}">${pct ? pz2(v) : fm(v)}</div>`+
      `<div class="rb-card-s">${esc(vglT)}: ${pct ? pz2(vv) : fm(vv)}${pct || K.nil(d) ? "" : ` <b class="${gut ? "gut" : ""}">${d > 0 ? "+" : "−"}${fm(Math.abs(d))}</b>`}</div></div>`; };
  let h = berichtStil({ fuss: fussText, status: status });
  if(status === "entwurf") h += `<div class="rb-wz">Draft</div>`;
  /* the cover */
  erste = false;
  h += `<section class="rb-deck rb-erste"><div class="rb-brand">${logo()}<div><b>EVEN</b><small>${esc(state.mandant)}</small></div></div>
    <div class="rb-mitte"><div class="rb-eyebrow">Financial statements</div><h1>${esc(titel)}</h1><div class="rb-spektrum"></div>
      <div class="u">Compared with ${esc(vglT)}${sum ? " · summarized" : ""} · amounts in ${esc(cur)}</div>
      <div class="rb-inhalt">${teile.map((x, i)=>`<div><span>${String(i+1).padStart(2, "0")}</span>${esc(x.t)}</div>`).join("")}</div></div>
    <div class="rb-meta"><span class="rb-chip">${status === "entwurf" ? "Draft" : "Final version"}</span><span>Created on ${fd(heute())}</span></div></section>`;
  /* 01 key figures: four cards, then the full list */
  h += seite("kennzahlen", titel) + stdSub +
    `<div class="rb-cards">${karte("Net worth", eq, eqC, "up")}${karte("Result", np, npC, "up")}${karte("Total assets", ta, taC, "up")}${karte("Savings rate", ti ? np/ti : NaN, tiC ? npC/tiC : NaN, null, true)}</div>`+
    `<table><thead><tr><th class="l">Key figure</th><th>${esc(K.periodLabel(p))}</th><th>${esc(vglT)}</th><th>Change</th></tr></thead><tbody>`+
    kennz.map(x=>`<tr class="position"><td>${esc(x[0])}</td>${zahl(x[1])}${zahl(x[2],"v")}${zahl(K.r2(x[1]-x[2]),"d")}</tr>`).join("")+
    `<tr class="position"><td>Savings rate</td><td class="z">${pz2(ti ? np/ti : NaN)}</td><td class="z v">${pz2(tiC ? npC/tiC : NaN)}</td><td class="z d"></td></tr>`+
    (cf ? `<tr class="bereich"><td colspan="4">Cash flow, ${esc(vglT)} → ${esc(K.periodLabel(p))}</td></tr>`+
      [["Operating activities", cf.operating], ["Investing activities", cf.investing], ["Financing activities", cf.financing]].map(x=>`<tr class="position"><td>${x[0]}</td>${zahl(x[1])}<td></td><td></td></tr>`).join("")+
      `<tr class="summe"><td>Net change in cash</td>${zahl(cf.change)}<td></td><td></td></tr>` : "")+`</tbody></table></section>`;
  h += seite("bilanz", titel) + stdSub + tabelle(fsZeilen(K.statementHTML(K.BS, p, c, ST.nullen.bilanz, true, sum), detail), K.periodLabel(p), vglT)+
    (K.nil(K.r2(ta - K.nodeVal(G.TLE,p))) ? "" : `<div class="rb-hinweis">Assets and liabilities differ by ${fm(K.r2(ta - K.nodeVal(G.TLE,p)))}.</div>`)+`</section>`;
  h += seite("erfolg", titel) + stdSub + tabelle(fsZeilen(K.statementHTML(K.IS, p, c, ST.nullen.erfolg, true, sum), detail), K.periodLabel(p), vglT)+
    (K.monthsOf(p) === K.monthsOf(c) ? "" : `<div class="rb-hinweis">${K.monthsOf(p)} months compared with ${K.monthsOf(c)}: not like for like.</div>`)+`</section>`;
  if(cf){
    const [fruehP, spaetP] = cf.rueckwaerts ? [p, c] : [c, p];
    cf.vonDatum = K.rep(fruehP).asOf; cf.bisDatum = K.rep(spaetP).asOf;
    h += seite("geldfluss", titel) + sub(`Cash in and out from ${fd(cf.von)} to ${fd(cf.bis)} · direct method, from the bookings · amounts in ${esc(cur)}`)+
      tabelle(gfBerichtZeilen(K, cf, detail), K.periodLabel(fruehP)+" → "+K.periodLabel(spaetP), null)+
      (cf.nichtGeld.length ? `<h3 class="rb-h3">Non-cash transactions</h3>`+tabelle(cf.nichtGeld.map(o=>({typ:"position", nr:o.konten.join(" · "), text:o.l, w:{t:K.fmt(o.betrag)}})), "Not in the cash flow", null) : "")+
      (K.nil(cf.check) ? "" : `<div class="rb-hinweis">The cash flow differs from the change in cash by ${fm(cf.check)}.</div>`)+`</section>`;
  }
  if(set.length){
    const jahre = (K.S.forecast && K.S.forecast.years) || 10;
    const zeilen = set.map(i=>{ const pay = summe(p, i.pay), adj = summe(p, i.adj), ser = K.buildSeries([i], jahre), last = ser[ser.length-1];
      return {i:i, pay:pay, adj:adj, val:K.r2(pay+adj), prog: last ? last.val : NaN}; });
    const tot = k => K.r2(zeilen.reduce((s, z)=> s + (isFinite(z[k]) ? z[k] : 0), 0));
    h += seite("anlagen", titel) + sub(`As at ${fd(R.asOf)} · amounts in ${esc(cur)}`)+
      `<table><thead><tr><th class="l">Investment</th><th>Paid in</th><th>Value adjustment</th><th>Value</th><th>Monthly pay-in</th><th>Return p.a.</th><th>In ${jahre} years</th></tr></thead><tbody>`+
      zeilen.map(z=>`<tr class="position"><td>${esc(z.i.label)}</td>${zahl(z.pay)}${zahl(z.adj)}${zahl(z.val)}<td class="z v">${fm(z.i.monthly||0)}</td><td class="z v">${((z.i.ret||0)).toFixed(1)}%</td>${zahl(z.prog,"v")}</tr>`).join("")+
      `<tr class="total"><td>Total</td>${zahl(tot("pay"))}${zahl(tot("adj"))}${zahl(tot("val"))}<td></td><td></td>${zahl(tot("prog"))}</tr></tbody></table>
      <div class="rb-fuss">The forecast compounds the monthly pay-in and the expected annual return of each investment. It is an assumption, not a promise.</div></section>`;
  }
  drucke(h, heute()+"_FINANCIAL STATEMENTS "+p+(sum ? " SUMMARY" : ""));
}
function fsExcelExport(){
  const K = fsKern(); const w = fsWahl(K);
  let blob;
  try{ blob = K.buildXLSX(); }catch(err){ meldung("Could not build the workbook: "+(err.message||err), {fehler:true}); return; }
  ablegen(blob, heute()+"_FINANCIAL STATEMENTS "+w.p+".xlsx");
  meldung("Excel workbook created: "+K.periodLabel(w.p)+" compared with "+K.periodLabel(w.c)+".");
}
