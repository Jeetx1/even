/* =====================================================================
   WIRING AND START: the kit, the file menu, the keys, the start screen
   ===================================================================== */
const AKTIONEN = {
  oeffnen:oeffnen, neu:neu, speichern:()=>speichern(false,false), speichernAls:()=>speichern(true,false), kopie:()=>speichern(true,true),
  export:()=>{ if(geladen) exportDialog(); }, import:()=>{ if(geladen) importDialog(); }, csv:()=>{ if(geladen) journalCsv(); },
  undo:rueckgaengig, redo:wiederholen, schliessen:schliessen, ordner:ordnerDialog
};
Kit.init({
  app: "accounting", defaultTheme: "glass", icon: (theme, u) => APP_ICONS.even(u).replace("<svg ", '<svg width="100%" height="100%" '),
  toolEffects: [
    { id: "stamp", kind: "signature", tool: "EVEN", name: "The stamp", desc: "A posted booking gets a seal: a ring of guilloché turns once and “Booked” lands on the booking card." }
  ],
  /* a new look: the charts are drawn again with its colours */
  onTheme: (id, first) => { if(!first && geladen){ try{ $$("#kpis .spark").forEach(s=>{ if(s._data) sparkDraw(s, s._data, false); }); render(false); }catch(e){ console.error(e); } } },
  toast: (m, o) => toast(m, o)
});
Kit.initDropdowns("select.select");
(function wire(){
  const steps = [
    () => { const lb = Kit.lookButton(); lb.id = "look"; $("#lookSlot").replaceWith(lb); },
    () => { const sw = Kit.themeSwitch(); $("#startLook").appendChild(sw.el); document.addEventListener("dl:theme", sw.sync); },
    baueNav, segment, initBuchen, initHauptbuch, initAbschluss, initAnlagen, initSetup,
    () => { $("#oj-zuInv").onclick = () => zeige("anlagen"); },
    () => { $("#menuknopf").onclick = navAuf; $("#scrim").onclick = navZu; },
    /* the file */
    () => {
      $$("#dmenu [data-aktion]").forEach(b=> b.onclick = ()=>{ pickerZu(); AKTIONEN[b.dataset.aktion](); });
      // without the file pickers of Chrome/Edge, Open starts the browser's picker at once and asks after the choice
      $("#s-oeffnen").onclick = ()=> FSA ? ohneArbeitskopie(oeffnen) : oeffnen(); $("#s-neu").onclick = ()=> ohneArbeitskopie(neu);
      $("#speichern").onclick = ()=> speichern(false,false);
      const o = $("#ordner"); o.hidden = !(FSA && Kit.folder.can); o.onclick = ordnerDialog;
      const m = $('#dmenu [data-aktion="ordner"]'); if(m) m.hidden = !(FSA && Kit.folder.can);
    },
    /* Journal: search, open and close the months, the export of the window */
    () => { const s = $("#jo-suche"); let t = null; s.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { suche = s.value; renderJournal(); }, 140); });
      $("#jo-auf").onclick = () => { delete offen.__; $$("#jo-liste .group").forEach(g => { g.classList.add("is-open"); offen[g.dataset.monat] = true; }); };
      $("#jo-zu").onclick = () => { $$("#jo-liste .group").forEach(g => g.classList.remove("is-open")); Object.keys(offen).forEach(k => delete offen[k]); offen.__ = false; };
      $("#jo-xlsx").onclick = () => journalExcel(exportFenster()); $("#jo-pdf").onclick = () => journalPdf(exportFenster()); },
    /* keys: Escape closes the sheet and the pickers (a dialog closes itself); Ctrl/Cmd + S saves (with Shift: as a new
       file), + Enter books from anywhere on Book, + Z / Y (or Shift + Z) undo and redo outside a field */
    () => { document.addEventListener("keydown", e => {
      const mod = e.ctrlKey || e.metaKey, imFeld = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || ""), k = (e.key || "").toLowerCase();
      if(e.key === "Escape"){ navZu(); pickerZu(); return; }
      if(!geladen || frageOffen) return;
      if(mod && k === "s"){ e.preventDefault(); speichern(e.shiftKey, false); }
      else if(mod && e.key === "Enter" && PAGE === "buchen"){ e.preventDefault(); enter(); }
      else if(mod && !imFeld && k === "z" && !e.shiftKey){ e.preventDefault(); rueckgaengig(); }
      else if(mod && !imFeld && (k === "y" || (k === "z" && e.shiftKey))){ e.preventDefault(); wiederholen(); }
    }); },
    /* the charts have the size of their box: drawn again when the width changes */
    () => { let bw = window.innerWidth, t = null; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if(window.innerWidth === bw) return; bw = window.innerWidth;
      if(geladen && ["uebersicht","hauptbuch","ueberjahre","anlagen","sachanlagen"].indexOf(PAGE) >= 0) render(false); }, 200); }); },
    /* hosted (GitHub Pages): the web manifest and the offline cache (sw.js), so the app also opens without a connection.
       Opened as a local file, nothing of this is loaded. */
    () => { if(location.protocol !== "https:") return;
      document.head.appendChild(Object.assign(document.createElement("link"), {rel:"manifest", href:"manifest.webmanifest"}));
      if("serviceWorker" in navigator){
        const hatteSchon = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.register("sw.js").catch(()=>{});
        navigator.serviceWorker.addEventListener("controllerchange", ()=>{ if(hatteSchon) meldung("A new version is ready. Close and reopen EVEN to use it."); });
      }
      if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{}); },
    () => { $("#buildzeile").textContent = "EVEN · build " + ((document.querySelector('meta[name="build"]') || {}).content || "local"); },
    () => { $("#start-hinweis").textContent = FSA
      ? "Saving writes straight back into the opened file, or with Save to folder into the app folder, the older file going to the backup folder. Ctrl+S saves, Ctrl+Z undoes."
      : "This browser cannot write back into the opened file. Saving creates a new file each time (on iPhone in Files). To save into the same file, use Chrome or Edge on a computer."; },
    zeigeArbeitskopie
  ];
  /* each part boots on its own, so one failing part never blanks the page */
  steps.forEach(fn => { try { fn(); } catch (e){ console.error(e); } });
})();
window.__buha = {get state(){ return state; }, E:E, anlageDialog:anlageDialog};
})();
</script>
</body>
</html>
