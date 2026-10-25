/* =====================================================================
   WIRING AND START
   ===================================================================== */
const AKTIONEN = {
  oeffnen:oeffnen, neu:neu, speichern:()=>speichern(false,false), speichernAls:()=>speichern(true,false), kopie:()=>speichern(true,true),
  export:oeffneExport, import:()=>oeffneImport(), csv:journalCsv, undo:rueckgaengig, redo:wiederholen, schliessen:schliessen, ordner:ordnerDialog
};
$$("#dmenu [data-aktion]").forEach(b=> b.onclick = ()=>{ $("#dmenu").open = false; AKTIONEN[b.dataset.aktion](); });
document.addEventListener("click", e=>{
  const m = $("#dmenu"); if(m && m.open && !m.contains(e.target)) m.open = false;
  const s = $("#navleiste"); if(s && s.classList.contains("offen") && !s.contains(e.target) && !$("#menuknopf").contains(e.target)) s.classList.remove("offen");
});
$("#s-oeffnen").onclick = ()=> ohneArbeitskopie(oeffnen); $("#s-neu").onclick = ()=> ohneArbeitskopie(neu);
$("#speichern").onclick = ()=> speichern(false,false);
{ const o = $("#ordner"); o.hidden = !(FSA && Kit.folder.can); o.onclick = ordnerDialog; }
{ const m = $('#dmenu [data-aktion="ordner"]'); if(m) m.hidden = !(FSA && Kit.folder.can); }
$("#menuknopf").onclick = ()=> $("#navleiste").classList.toggle("offen");
$("#mandant").addEventListener("change", e=>{ const v = e.target.value.trim() || "Untitled"; aendere("Name changed", ()=>{ state.mandant = v; }); });
$("#periode").onchange = e=>{ state.ui.periode = e.target.value; render(); };
$("#jahrwahl").onchange = e=>{
  const j = parseInt(e.target.value, 10); if(!(j >= 1900 && j <= 2200)) return;
  state.jahr = j; neuerEntwurf(true); bauGeruest(); render();
  const fort = istGeschlossen(j) ? null : E.spreadsFortfuehren(state, ix, j);
  meldung((E.jahreMitBuchungen(state)[j] ? "Year "+j+(istGeschlossen(j)?" (closed, read-only)":"") : "Year "+j+" is new. Its opening comes from the closing "+(j-1)+".")
    + (fort && fort.plaene.length ? " "+fort.plaene.length+" spread"+(fort.plaene.length>1?"s":"")+" from earlier years can be continued on the Book page." : ""));
};
$("#vergleich").onchange = async e=>{
  const v = e.target.value;
  if(v === "datei" && !vgl){ const ok = await vergleichsdateiLaden(); state.ui.vergleich = ok ? "datei" : ""; bauVergleichsliste(); render(); return; }
  state.ui.vergleich = v; render();
};
function bereich(ytd, still){
  const s = $("#rangeSeg"); s.style.setProperty("--i", ytd ? 1 : 0);
  [["#bPer", !ytd], ["#bYtd", ytd]].forEach(([id, an])=>{ $(id).classList.toggle("on", an); $(id).classList.toggle("is-active", an); $(id).setAttribute("aria-checked", an ? "true" : "false"); });
  if(!still) s.dispatchEvent(new CustomEvent("dl:seg", {bubbles:true}));
}
$("#bPer").onclick = ()=>{ if(!state.ui.ytd) return; state.ui.ytd = false; bereich(false); render(); };
$("#bYtd").onclick = ()=>{ if(state.ui.ytd) return; state.ui.ytd = true; bereich(true); render(); };
let sucheTimer = null;
$("#jo-suche").addEventListener("input", e=>{ clearTimeout(sucheTimer); sucheTimer = setTimeout(()=>{ suche = e.target.value.trim(); renderJournal(); }, 140); });
$("#jo-auf").onclick = ()=> $$("#jo-liste details").forEach(d=>d.open=true);
$("#jo-zu").onclick = ()=> $$("#jo-liste details").forEach(d=>d.open=false);
$("#jo-xlsx").onclick = ()=> journalExcel(null);
$("#jo-pdf").onclick = ()=> journalPdf(null);
$("#kt-nr").addEventListener("input", e=>{ const g = gruppeFuerNummer(e.target.value.trim()); if(g) $("#kt-grp").value = g; });
$("#kt-add").onclick = ()=>{
  const nr = $("#kt-nr").value.trim(), name = $("#kt-name").value.trim(), grp = $("#kt-grp").value;
  if(!/^\d{3,6}(\.\d{1,3})?$/.test(nr)){ meldung("An account number has 3 to 6 digits, optionally with a sub-number like 1020.3.", {fehler:true}); return; }
  if(!name){ meldung("Enter a name.", {fehler:true}); return; }
  if(ix.km[nr]){ meldung("Account "+nr+" already exists.", {fehler:true}); return; }
  if(aendere("Account "+nr+" added", ()=>{ state.konten.push([nr, name, grp, null, null]); }, {geruest:true})){
    $("#kt-nr").value = ""; $("#kt-name").value = ""; meldung("Account "+nr+" added"); }
};
$("#gr-add").onclick = ()=>{
  const name = $("#gr-name").value.trim(); if(!name){ meldung("Enter a name.", {fehler:true}); return; }
  const t = $("#gr-sek").value.split("|"), code = "G"+Date.now().toString(36).toUpperCase();
  if(aendere("Group added", ()=>{ state.gruppen.push(t[0]==="E" ? {c:code, t:name, s:"E", vz:parseInt(t[1],10), zw:""}
      : {c:code, t:name, s:t[0], sek:t[1], st:"auto"}); }, {geruest:true})) $("#gr-name").value = "";
};
$("#vg-import").onclick = ()=> oeffneImport();
$("#mo-export").onclick = oeffneExport;
$("#ja-delta").onchange = renderJahre;
$("#ex-mo-xlsx").onclick = monateExcel; $("#ex-mo-pdf").onclick = monatePdf;
$("#ex-fs-pdf").onclick = ()=> fsBericht(false); $("#ex-fs-sum").onclick = ()=> fsBericht(true); $("#ex-fs-xlsx").onclick = fsExcelExport;
$$("[data-schliessen]").forEach(b=> b.onclick = ()=> b.closest(".hg").classList.remove("on"));
$$(".hg").forEach(h=> h.addEventListener("click", e=>{ if(e.target === h){ if(h.id === "dlg-frage" && frageOffen) frageOffen(); else h.classList.remove("on"); } }));
document.addEventListener("keydown", e=>{
  const mod = e.ctrlKey || e.metaKey, ziel = e.target, inFeld = ziel && /INPUT|TEXTAREA|SELECT/.test(ziel.tagName);
  if(e.key === "Escape"){
    if($("#dlg-frage").classList.contains("on") && frageOffen){ frageOffen(); return; }
    const offen = $$(".hg.on").pop(); if(offen){ offen.classList.remove("on"); return; }
    if($("#dmenu").open) $("#dmenu").open = false;
  }
  if(!geladen) return;
  if(mod && e.key.toLowerCase() === "s"){ e.preventDefault(); speichern(e.shiftKey, false); }
  else if(mod && !inFeld && e.key.toLowerCase() === "z" && !e.shiftKey){ e.preventDefault(); rueckgaengig(); }
  else if(mod && !inFeld && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))){ e.preventDefault(); wiederholen(); }
  else if(mod && e.key === "Enter" && state.ui.tab === "buchen"){ e.preventDefault(); versucheBuchen(); }
});

Kit.init({
  app: "accounting", defaultTheme: "glass", icon: (theme, u) => APP_ICONS.even(u).replace("<svg ", '<svg width="100%" height="100%" '),
  toolEffects: [
    { id: "stamp", kind: "signature", tool: "EVEN", name: "The stamp", desc: "A posted booking gets a seal: a ring of guilloché turns once and “Booked” lands on the booking mask." }
  ],
  /* a new look: the page and its charts are drawn again with the new colours */
  onTheme: (id, first) => { if(!first && geladen){ try{ render(); }catch(e){ console.error(e); } } },
  toast: (m, o) => meldung(m, {fehler: !!(o && o.type === "error")})
});
Kit.initDropdowns("select:not([multiple])");   // every dropdown gets the themed menu on a computer (24.10.: incl. the pills on Statement settings)
{ const lb = Kit.lookButton(); lb.id = "look"; $("#lookSlot").replaceWith(lb); }
{ const look = $("#startLook"); if(look){ const sw = Kit.themeSwitch(); look.appendChild(sw.el); document.addEventListener("dl:theme", sw.sync); } }
/* the tool's dialogs open and close by a class: tell the effects (Glass sinks the page back behind them) */
if("MutationObserver" in window) $$(".hg").forEach(hgEl=>{ let war = hgEl.classList.contains("on");
  new MutationObserver(()=>{ const ist = hgEl.classList.contains("on"); if(ist !== war){ war = ist; document.dispatchEvent(new CustomEvent("dl:overlay", {detail:{open:ist}})); } }).observe(hgEl, {attributes:true, attributeFilter:["class"]}); });
/* hosted (GitHub Pages): the web manifest and the offline cache (sw.js), so the app also opens without a connection.
   Opened as a local file, nothing of this is loaded. */
if(location.protocol === "https:"){
  document.head.appendChild(Object.assign(document.createElement("link"), {rel:"manifest", href:"manifest.webmanifest"}));
  if("serviceWorker" in navigator){
    const hatteSchon = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(()=>{});
    navigator.serviceWorker.addEventListener("controllerchange", ()=>{ if(hatteSchon) meldung("A new version is ready. Close and reopen EVEN to use it."); });
  }
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
}
{ const bz = $("#buildzeile"); if(bz) bz.textContent = "EVEN \u00b7 build " + ((document.querySelector('meta[name="build"]') || {}).content || "local"); }
setzeIcons();
baueMarkeUndSiegel();
$("#start-hinweis").textContent = FSA
  ? "Saving writes straight back into the opened file, or with Save to folder into the app folder, the older file going to the backup folder. Ctrl+S saves, Ctrl+Z undoes."
  : "This browser cannot write back into the opened file. Saving creates a new file each time (on iPhone in Files). To save into the same file, use Chrome or Edge on a computer.";
zeigeArbeitskopie();
window.__buha = {get state(){ return state; }, E:E, anlageDialog:anlageDialog};
})();
</script>
</body>
</html>
