/* =====================================================================
   THE FILE: open, save (back into the file, as a new file, a dated copy, to the app folder), the working copy of unsaved
   changes, a new file, close. Since build 2026-10-25.4 one save runs at a time, and a change made while a save is
   writing stays unsaved. Since 2026-10-28.1 every write is read back before the window counts as saved, and each
   window keeps its own working copy.
   ===================================================================== */
// Everything in the file is written back, including data this version does not use itself.
function dateiObjekt(){
  return Object.assign({typ:"buchhaltung", version:5, mandant:state.mandant, jahr:state.jahr, waehrung:state.waehrung,
    kurse:state.kurse, einstellungen:state.einstellungen, sektionen:state.sektionen, titel:state.titel,
    buckets:state.buckets, gruppen:state.gruppen, konten:state.konten, buchungen:state.buchungen,
    vergleichsjahre:state.vergleichsjahre||[], abgeschlossen:state.abgeschlossen||[], ui:state.ui}, state, {version:5, settings:Object.assign({}, state.settings||{}, {theme: Kit.theme()})});
}
function vorschlag(mitDatum){ return heute()+"_EVEN"+(mitDatum ? " COPY" : "")+".json"; }
/* a file opened under an old name (…_ACCOUNTING ….json) is not written back into: the picker offers the new name once */
const neuerName = n => /_EVEN\.json$/i.test(n || "");
/* every change counts, so a save knows whether something changed while it was still writing */
let aenderungen = 0;
function markiere(){ dirty = true; aenderungen++; const b = $("#speichern"); if(b){ b.classList.add("schmutzig", "is-dirty"); $(".btn__label", b).textContent = "Save"; b.title = "Unsaved changes (Ctrl/Cmd + S)"; } arbeitskopie(); }
function sauber(){ dirty = false; arbeitskopieWeg(); const b = $("#speichern"); if(b){ b.classList.remove("schmutzig", "is-dirty"); $(".btn__label", b).textContent = "Saved"; b.title = "Everything is saved"; }
  if(geladen) document.dispatchEvent(new CustomEvent("dl:saved")); zeigeDateiname(); }
function zeigeDateiname(){
  const el = $("#dateiname"); if(!el) return;
  el.textContent = dateiname || "not saved yet";
  el.title = dateiname || "";
}
async function uebernehmen(roh, h, name){
  let d;
  try{ d = typeof roh === "string" ? JSON.parse(roh) : roh; }
  catch(e){ meldung("This is not an accounting file (the JSON cannot be read).", {fehler:true}); return false; }
  const p = E.pruefeDatei(d, VORLAGE);
  if(p.fehler && p.fehler.length){ meldung(p.fehler.join(" "), {fehler:true}); return false; }
  state = p.daten; ix = E.ctx(state);
  handle = h || null; dateiname = name || null; geladen = true; basis = d && d.saved || null;
  verlauf.zurueck = []; verlauf.vor = [];
  starteApp(); sauber(); verworfeneWeg();
  if(d && d.settings && d.settings.theme) Kit.set(d.settings.theme, "file");
  // spreads booked the old way (straight onto 1300/2300) in open years: once onto 1305/2305 with the carry-over on 31.12.
  { const probe = E.spreadsUmstellen(JSON.parse(JSON.stringify(state)), E.ctx(state), ()=> "x");
    if(probe.plaene && aendere("Spreads moved to "+(state.einstellungen.araJahr||"1305")+"/"+(state.einstellungen.praJahr||"2305"), ()=>{ E.spreadsUmstellen(state, ix, naechsteId); })){
      render(false);
      meldung(probe.plaene+" spread"+(probe.plaene===1?"":"s")+" of "+probe.jahre.join(", ")+" moved to the in-year accounts ("+probe.buchungen+" bookings changed, "+
        probe.uebertraege+" carried into the next year on 31.12.). Save to keep it, or undo.");
    } }
  if(p.warnungen.length){
    const liste = p.warnungen.slice(0,10).map(w=>"<li>"+esc(w)+"</li>").join("");
    frage("File opened with "+p.warnungen.length+" note"+(p.warnungen.length>1?"s":""),
      "All data was loaded. While reading, the following was noticed or repaired:<ul style='margin:10px 0 0;padding-left:18px'>"+liste+"</ul>"+
      (p.warnungen.length>10 ? "<p class='mut'>… and "+(p.warnungen.length-10)+" more.</p>" : ""),
      [{text:"Got it", wert:true}]);
  }
  return true;
}
async function waehleDatei(input){
  return new Promise(resolve=>{
    const el = $(input);
    el.value = "";
    el.onchange = ()=> resolve(el.files && el.files[0] ? el.files[0] : null);
    el.click();
  });
}
/* without the File System Access API (Safari, the iPhone, Firefox) a browser opens its file picker only inside the tap
   itself, not after a question or a look into IndexedDB: the picker comes first, the questions (a working copy, unsaved
   changes) after the choice */
function oeffnenOhneFSA(){
  const el = $("#dateiwahl");
  el.value = "";
  el.onchange = ()=>{
    const file = el.files && el.files[0]; if(!file) return;
    ohneArbeitskopie(async ()=>{ if(!(await verwerfenOk())) return; await uebernehmen(await file.text(), null, file.name); });
  };
  el.click();
}
async function oeffnen(){
  if(!FSA){ oeffnenOhneFSA(); return; }
  if(!(await verwerfenOk())) return;
  try{
    const [h] = await window.showOpenFilePicker({types:[{description:"Buchhaltung", accept:{"application/json":[".json"]}}], multiple:false});
    const file = await h.getFile();
    await uebernehmen(await file.text(), h, h.name);
  }catch(err){ if(err && err.name !== "AbortError") meldung("Could not open: "+err.message, {fehler:true}); }
}
async function schreibrechte(h){
  if(!h || !h.queryPermission) return true;
  if(await h.queryPermission({mode:"readwrite"}) === "granted") return true;
  return (await h.requestPermission({mode:"readwrite"})) === "granted";
}
/* without file pickers: on the iPhone and iPad the share sheet ("Save to Files" picks the folder, as in CICO and RISE),
   elsewhere a download. An iPad with a keyboard reports a fine pointer, so its touch points count too (a Mac has none).
   "geteilt" (shared), "geladen" (downloaded) or null (the share sheet was closed). For the books (nurTeilen) a share sheet
   that cannot take the file gives its error instead of a download: a download the browser blocks or drops would leave
   the window marked as saved with nothing written */
async function ablegen(blob, name, nurTeilen){
  if((Kit.TOUCH || navigator.maxTouchPoints > 1) && navigator.canShare){
    try{
      const f = new File([blob], name, {type:blob.type.split(";")[0] || "application/octet-stream"});
      if(navigator.canShare({files:[f]})){ await navigator.share({files:[f]}); return "geteilt"; }
    }catch(err){
      if(err && err.name === "AbortError") return null;
      if(nurTeilen) return err && typeof err === "object" ? err : new Error(String(err));
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 800);
  return "geladen";
}
/* one save at a time: a second Save while one is still writing (a double click, Ctrl+S again) is ignored */
let speichertGerade = false;
async function speichern(alsNeu, mitDatum){
  if(!geladen || speichertGerade) return false;
  speichertGerade = true;
  try{ return await speichernJetzt(alsNeu, mitDatum); }
  finally{ speichertGerade = false; }
}
/* written: clean, unless something changed while it was writing. That change is not in the file, so it stays unsaved
   (the button keeps blinking, the working copy is kept with the new stamp) */
function gespeichert(stand){
  if(aenderungen === stand){ sauber(); return; }
  zeigeDateiname(); arbeitskopie();
  meldung("A change made while saving is not in the file yet. Save again to keep it.");
}
/* what is written must read back exactly as the window holds it: the bookings and accounts, debit and credit, every
   year's closing. A difference is named; nothing is written then */
function lesbarWieGeschrieben(text){
  const zurueck = E.pruefeDatei(JSON.parse(text), VORLAGE);
  if(zurueck.fehler.length) throw new Error(zurueck.fehler.join(" "));
  const d = zurueck.daten, k1 = E.kontrolle(state, E.ctx(state)), k2 = E.kontrolle(d, E.ctx(d));
  const anders = (was, hier, dort) => new Error("The check before saving found a difference: "+was+" "+hier+" in this window, "+dort+" in the file.");
  if(d.buchungen.length !== state.buchungen.length) throw anders("bookings", state.buchungen.length, d.buchungen.length);
  if(d.konten.length !== state.konten.length) throw anders("accounts", state.konten.length, d.konten.length);
  if(Math.abs(k1.soll-k2.soll) > .005 || Math.abs(k1.haben-k2.haben) > .005) throw anders("debit / credit", tsd(k1.soll, 2)+" / "+tsd(k1.haben, 2), tsd(k2.soll, 2)+" / "+tsd(k2.haben, 2));
  Object.keys(E.jahreMitBuchungen(state)).forEach(j=>{
    const a = E.saldoPer(state, j+"-12-31"), b = E.saldoPer(d, j+"-12-31");
    Object.keys(Object.assign({}, a, b)).forEach(nr=>{ if(Math.abs((a[nr]||0)-(b[nr]||0)) > .005) throw anders("the closing "+j+" of account "+nr+":", tsd(a[nr]||0, 2), tsd(b[nr]||0, 2)); });
  });
}
async function speichernJetzt(alsNeu, mitDatum){
  const stand = aenderungen;
  // the file carries the moment it was saved: the next save compares it with the file on disk (fremdGespeichert)
  const vorher = state.saved, stamp = new Date().toISOString(), zurueckSetzen = ()=>{ state.saved = vorher; };
  state.saved = stamp;
  const text = JSON.stringify(dateiObjekt(), null, 1);
  try{ lesbarWieGeschrieben(text); }
  catch(err){ zurueckSetzen(); meldung("Not saved: "+err.message+" The data in this window is unchanged.", {fehler:true}); return false; }
  /* Save to folder (computer, once the app folder is chosen): today's file into the app folder, the data files it
     replaces into the backup folder (Kit.folder.save, Design Lab §6.4). The written file must read back exactly */
  if(!alsNeu && !mitDatum && FSA && Kit.folder.can && await Kit.folder.get()){
    let r;
    const o = {name:vorschlag(false), text:text, copyName:vorschlag(true), basis:basis, isData:istDatendatei, stamp:stampOf, check:t => t === text,
      // "Save as a new file": the copy gets a name that is free in the app folder, so an earlier copy is never replaced
      ask:async fo => { const w = await ordnerFrage(fo); if(w === "neu") o.copyName = await freierName(await Kit.folder.get(), vorschlag(true)); return w; }};
    try{ r = await Kit.folder.save(o); }
    catch(err){ zurueckSetzen(); meldung("Not saved to the folder: "+(err && err.message || err), {fehler:true}); return false; }
    if(r.cancel){ zurueckSetzen(); return false; }
    if(r.missing || r.denied){
      zurueckSetzen();
      meldung(r.missing ? "“"+r.folder+"” cannot be found any more. Moved or renamed? Choose it again." : "No access to “"+r.folder+"”. Choose it again.", {fehler:true});
      ordnerDialog(); return false;
    }
    handle = r.handle; dateiname = r.name; basis = stamp;
    meldung("Saved to "+r.folder+": "+r.name+(r.moved.length ? ". Moved to "+r.backup+": "+r.moved.map(m=>m[0]).join(", ") : "")+
      (r.noBackup ? ". Choose a backup folder to move the older files." : ""));
    gespeichert(stand);
    return true;
  }
  if(FSA){
    try{
      const insBuch = !alsNeu && !mitDatum;
      let h = insBuch && neuerName(dateiname) ? handle : null, alsKopie = !!mitDatum;
      /* writing back into the opened file: was it saved elsewhere since this window opened it? */
      if(h){ const w = await trotzFremd(h); if(w === false){ zurueckSetzen(); return false; } if(w === "neu"){ h = null; alsKopie = true; } }
      if(!h){
        h = await zielWaehlen(alsKopie);
        /* the books saved through the picker (a new file, a restored working copy, an old file name): the same question
           when the chosen file holds a version saved elsewhere */
        if(insBuch && !alsKopie){ const w = await trotzFremd(h); if(w === false){ zurueckSetzen(); return false; } if(w === "neu") h = await zielWaehlen(true); }
      }
      if(!(await schreibrechte(h))){ zurueckSetzen(); meldung("Saving needs write access to the file.", {fehler:true}); return false; }
      const strom = await h.createWritable();
      await strom.write(text); await strom.close();
      // read back what was written: a file that does not hold it is reported, and the window stays unsaved
      let da = null; try{ da = await (await h.getFile()).text(); }catch(e){}
      if(da !== text) throw new Error(h.name+" did not read back the same after writing. Save again, or save as a new file.");
      if(mitDatum){ zurueckSetzen(); meldung("Dated copy saved: "+h.name); }
      else { handle = h; dateiname = h.name; basis = stamp; meldung("Saved to "+h.name); gespeichert(stand); }
      return true;
    }catch(err){ zurueckSetzen(); if(err && err.name !== "AbortError") meldung("Could not save: "+err.message, {fehler:true}); return false; }
  }
  const name = vorschlag(mitDatum);
  const wie = await ablegen(new Blob([text],{type:"application/json;charset=utf-8"}), name, true);
  if(typeof wie !== "string"){
    zurueckSetzen();
    if(wie) meldung("Not saved: the share sheet could not take the file ("+(wie.message || wie.name || "no reason given")+"). Nothing was written; try Save again.", {fehler:true});
    else meldung("Not saved: the share sheet was closed.");
    return false;
  }
  if(!mitDatum){ dateiname = name; basis = stamp; } else zurueckSetzen();
  meldung(wie === "geteilt" ? (mitDatum ? "Dated copy shared: " : "Shared as ")+name : (mitDatum ? "Dated copy downloaded: " : "Downloaded as ")+name);
  if(!mitDatum) gespeichert(stand);
  return true;
}
const zielWaehlen = alsKopie => window.showSaveFilePicker({suggestedName:vorschlag(alsKopie), types:[{description:"Buchhaltung", accept:{"application/json":[".json"]}}]});
/* the name itself when no file in the folder has it, else "… 2.json", "… 3.json" … */
async function freierName(ordner, name){
  for(let i = 1; ordner && i < 1000; i++){
    const n = i === 1 ? name : name.replace(/(\.json)$/i, " "+i+"$1");
    try{ await ordner.getFileHandle(n); }catch(e){ if(!e || e.name !== "TypeMismatchError") return n; }
  }
  return name;
}

/* ---------- Saved elsewhere since it was opened ----------------------- */
// The file's own "saved" stamp against the one this window started from, so a file sync that only touches the
// file date does not count. null: nothing to worry about (also when the file is gone, empty or cannot be read).
async function fremdGespeichert(h){
  if(basis === undefined) return null;
  let text; try{ text = await (await h.getFile()).text(); }catch(e){ return null; }
  if(!String(text).trim()) return null;
  try{ const s = JSON.parse(text).saved || null; return s !== (basis || null) ? {saved:s} : null; }catch(e){ return {saved:null}; }
}
/* null: go on and write; "neu": save as a new file instead; false: cancelled */
async function trotzFremd(h){
  const fr = await fremdGespeichert(h); if(!fr) return null;
  const w = await konfliktFrage(h.name, fr.saved);
  return w === "ersetzen" ? null : (w === "neu" ? "neu" : false);
}
const wannText = s => s ? new Date(s).toLocaleString("en-GB", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}) : "";
/* three choices: "ersetzen" (replace it), "neu" (save as a new file) or null (cancel) */
function dreiWege(titel, text, hinweis){
  return frage(titel, "<p style='margin:0'>"+esc(text)+"</p>"+(hinweis ? "<p class='klein mut' style='margin:8px 0 0'>"+esc(hinweis)+"</p>" : ""),
    [{text:"Cancel", wert:null, art:"leicht"}, {text:"Replace it", wert:"ersetzen", art:"gefahr"}, {text:"Save as a new file", wert:"neu"}]);
}
function konfliktFrage(name, saved){
  return dreiWege("Saved elsewhere since you opened it", name+" was saved again"+(saved ? " on "+wannText(saved) : "")+" after you opened it here, in another window or on another device. Saving now would replace that version.",
    "Your changes here are not lost either way.");
}
/* Save to folder asks when the app folder holds a newer data file, or today's file that is not this window's version */
function ordnerFrage(fo){
  const liste = fo.files.map(x=> x.name+(x.stamp ? " (saved "+wannText(x.stamp)+")" : "")).join(", ");
  return fo.kind === "newer"
    ? dreiWege("Saved elsewhere since you opened it", liste+" in “"+fo.folder+"” was saved after the version you have here, in another window or on another device.",
        "Replace it: that file goes to the backup folder and this version takes its place. Save as a new file: this version goes next to it as a copy.")
    : dreiWege("Today’s file is already there", liste+" is already in “"+fo.folder+"” and is not the version you have here.",
        "Replace it: the old one goes to the backup folder. Save as a new file: this version goes next to it as a copy.");
}
/* the data files a save to the app folder replaces (moved to the backup folder): today's name, the " 1" / " (1)" a
   second save adds, the old ACCOUNTING names, the daily backups of earlier builds. Copies stay where they are */
function istDatendatei(n){ return /\.json$/i.test(n) && !/COPY/i.test(n) && (/_EVEN( BACKUP)?( \d+| \(\d+\))?\.json$/i.test(n) || /ACCOUNTING/i.test(n)); }
function stampOf(t){ try{ return JSON.parse(t).saved || null; }catch(e){ return null; } }

/* ---------- Save to folder (computer): the app folder and its backup folder ---------- */
async function ordnerDialog(){
  if(!(FSA && Kit.folder.can)){ meldung("Saving to folders needs Chrome or Edge on a computer.", {fehler:true}); return; }
  const app = await Kit.folder.get(), bk = await Kit.folder.backup();
  const zeile = (id, titel, o, leer, an) => `<div class="ordnerzeile"><div><small>${titel}</small><b>${o ? "“"+esc(o.name)+"”" : leer}</b></div>`+
    `<button type="button" class="btn btn--secondary btn--sm" id="${id}"${an ? "" : " disabled"}>${o ? "Change …" : "Choose …"}</button></div>`;
  const antwort = frage("Save to folder",
    "<p style='margin:0 0 10px'>Save writes today’s file into the app folder and moves the file it replaces into the backup folder. Nothing is deleted.</p>"+
    zeile("od-app", "App folder", app, "Not chosen yet (e.g. APPS › EVEN)", true)+
    zeile("od-bk", "Backup folder", bk, app ? "Not chosen yet (e.g. 02 BACKUP)" : "Choose the app folder first", !!app)+
    "<p class='klein mut' style='margin:12px 0 0'>A browser only shows a folder’s name, not where it is. If you move or rename a folder, EVEN says so and you choose it again. The github.io app and a copy opened from this computer each remember their own folders.</p>",
    [app ? {text:"Stop using folders", wert:"weg", art:"leicht"} : null, {text:"Close", wert:null, art:"leicht"}, app ? {text:"Save now", wert:"jetzt"} : null].filter(Boolean));
  const waehle = async (fn, was, alt)=>{
    let neu;
    try{ neu = await fn(); }
    catch(e){ if(!e || e.name !== "AbortError") meldung(e && e.message || "This browser did not give access to that folder.", {fehler:true}); return; }
    const bk2 = await Kit.folder.backup();
    meldung(was+" folder: “"+neu.name+"”"+(alt && alt !== neu.name ? " (was “"+alt+"”)" : "")+"."+
      (was === "App" ? (bk2 ? " Backups go to “"+bk2.name+"”." : " It has no 02 BACKUP: choose a backup folder too.") : ""));
    if(frageOffen) frageOffen();
    setTimeout(ordnerDialog, 60);
  };
  $("#od-app").onclick = ()=> waehle(Kit.folder.choose, "App", app && app.name);
  $("#od-bk").onclick = ()=> waehle(Kit.folder.chooseBackup, "Backup", bk && bk.name);
  const w = await antwort;
  if(w === "weg"){ await Kit.folder.forget(); meldung("Folders forgotten. Save writes back into the opened file again."); if(state && state.ui.tab === "vergleich") render(); }
  if(w === "jetzt") speichern(false, false);
}

/* ---------- Working copy (IndexedDB): unsaved changes survive a crash or a closed tab ----------
   One per window ("arbeitskopie:<window>"), so two windows never replace or remove each other's. While a window is open
   it holds a lock of that name (Web Locks): the start screen offers only the copies of windows that are gone, and
   opening another file drops only those. Without Web Locks every other copy counts as one of a window that is gone.
   A copy of an earlier build ("arbeitskopie") is offered the same way */
const FENSTER = Date.now().toString(36) + Math.random().toString(36).slice(2, 7), AK = "arbeitskopie:" + FENSTER;
try{ if(navigator.locks && navigator.locks.request) navigator.locks.request("even:" + AK, () => new Promise(()=>{})).catch(()=>{}); }catch(e){}
let akTimer = null, akFehler = false, verworfen = [];
/* the copy is written at once with sofort (going to the background, closing, a restore), else 1.2 s after the last
   change; with sofort it gives true once it is stored */
function arbeitskopie(sofort){
  clearTimeout(akTimer);
  const tu = ()=>{
    if(!geladen || !dirty || !state) return Promise.resolve(false);
    return idbSchreiben(AK, {at:new Date().toISOString(), name:dateiname || "", basis:basis === undefined ? null : basis, daten:dateiObjekt()}).then(ok=>{
      if(!ok && !akFehler){ akFehler = true; meldung("This browser refused to keep a copy of your unsaved changes. Save regularly.", {fehler:true}); }
      return ok; });
  };
  if(sofort) return tu();
  akTimer = setTimeout(tu, 1200);
  return null;
}
function arbeitskopieWeg(){ clearTimeout(akTimer); idbLoeschen(AK); }
document.addEventListener("visibilitychange", ()=>{ if(document.hidden) arbeitskopie(true); });
window.addEventListener("pagehide", ()=> arbeitskopie(true));
/* the copies of windows that are gone, newest first */
async function alteKopien(){
  const keys = (await idbSchluessel()).filter(k => /^arbeitskopie(:|$)/.test(k) && k !== AK);
  let offen = new Set();
  try{ if(navigator.locks && navigator.locks.query){ const q = await navigator.locks.query(); offen = new Set((q.held || []).map(l => String(l.name).replace(/^even:/, ""))); } }catch(e){}
  const liste = [];
  for(const k of keys){ if(offen.has(k)) continue; const ak = await idbLesen(k); if(ak && ak.daten) liste.push(Object.assign({key:k}, ak)); }
  return liste.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
/* the start screen offers the unsaved changes this browser kept, one button per window */
async function zeigeArbeitskopie(){
  const alte = await alteKopien(), w = $("#start .wahl");
  $$("#start .ev-weiter").forEach(x => x.remove());
  if(!w || !alte.length) return;
  alte.slice().reverse().forEach((ak, n) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "ev-choice ev-weiter"; if(n === alte.length - 1) b.id = "s-weiter";
    b.innerHTML = `<span class="ev-choice__i" aria-hidden="true"><svg width="22" height="22"><use href="#i-zurueck"/></svg></span><span><b>Restore unsaved changes</b><small>From ${fd(String(ak.at).slice(0,10))} ${new Date(ak.at).toTimeString().slice(0,5)}${ak.name ? ", based on "+esc(ak.name) : ""}. They never reached a file.</small></span>`;
    b.onclick = async ()=>{
      if(!(await uebernehmen(ak.daten, null, ak.name || null))) return;
      basis = ak.basis; markiere();
      // this window keeps them now: its own copy is stored first, only then the old one goes
      if(await arbeitskopie(true)) idbLoeschen(ak.key);
      meldung("Unsaved changes restored. Save to put them into your file.");
    };
    w.insertBefore(b, w.firstChild);
  });
}
/* opening or starting another file replaces those unsaved changes: ask first. They are dropped once the other file is
   open (verworfeneWeg), so a cancelled picker keeps them */
async function ohneArbeitskopie(fn){
  const alte = !geladen ? await alteKopien() : [];
  if(alte.length){
    const ja = await frage("Drop the unsaved changes?", (alte.length > 1 ? "This browser holds changes of "+alte.length+" windows that never reached a file." : "This browser holds changes that never reached a file.")+" Opening or starting another file replaces them."+
      "<p class='klein mut' style='margin:8px 0 0'>To keep them: Cancel, then Restore unsaved changes and Save.</p>",
      [{text:"Cancel", wert:false, art:"leicht"}, {text:"Drop them", wert:true, art:"gefahr"}]);
    if(!ja) return;
    verworfen = alte.map(a => a.key);
  }
  fn();
}
function verworfeneWeg(){ verworfen.forEach(k => idbLoeschen(k)); verworfen = []; }

/* one connection for the whole page, so writes and removals reach the store in the order they were asked for */
let dbP = null;
function idb(){
  if(dbP) return dbP;
  dbP = new Promise((ok, nein)=>{ const r = indexedDB.open("buchhaltung", 1);
    r.onupgradeneeded = ()=> r.result.createObjectStore("kv");
    r.onsuccess = ()=>{ const db = r.result; db.onclose = ()=>{ dbP = null; }; db.onversionchange = ()=>{ db.close(); dbP = null; }; ok(db); };
    r.onerror = ()=>{ dbP = null; nein(r.error); }; });
  return dbP;
}
async function idbLesen(k){ try{ const db = await idb(); return await new Promise((ok, nein)=>{ const t = db.transaction("kv").objectStore("kv").get(k);
  t.onsuccess = ()=> ok(t.result); t.onerror = ()=> nein(t.error); }); }catch(e){ dbP = null; return null; } }
async function idbSchluessel(){ try{ const db = await idb(); return await new Promise((ok, nein)=>{ const t = db.transaction("kv").objectStore("kv").getAllKeys();
  t.onsuccess = ()=> ok((t.result || []).map(String)); t.onerror = ()=> nein(t.error); }); }catch(e){ dbP = null; return []; } }
async function idbSchreiben(k, v){ try{ const db = await idb(); await new Promise((ok, nein)=>{ const t = db.transaction("kv","readwrite").objectStore("kv").put(v, k);
  t.onsuccess = ()=> ok(); t.onerror = ()=> nein(t.error); }); return true; }catch(e){ dbP = null; return false; } }
async function idbLoeschen(k){ try{ const db = await idb(); db.transaction("kv","readwrite").objectStore("kv").delete(k); }catch(e){ dbP = null; } }
function leererStand(mandant, jahr, buchungen){
  return E.pruefeDatei({mandant:mandant, jahr:jahr, waehrung:"CHF", kurse:klon(VORLAGE.kurse),
    konten:klon(VORLAGE.konten), gruppen:klon(VORLAGE.gruppen), buckets:klon(VORLAGE.buckets),
    sektionen:klon(VORLAGE.sektionen), titel:klon(VORLAGE.titel), einstellungen:klon(VORLAGE.einstellungen||{}), buchungen:buchungen||[],
    ui:{tab:"uebersicht", periode:"J", ytd:false, vergleich:"start"}}, VORLAGE).daten;
}
async function neu(){
  if(!(await verwerfenOk())) return;
  const vorschlagJahr = new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0);
  const w = await frage("Start a new accounting file", "First financial year <input class='input num' id='neu-jahr' inputmode='numeric' style='width:110px;display:inline-block;margin-left:8px' value='"+vorschlagJahr+"'>"+
    "<p class='klein mut' style='margin:12px 0 0'>The new file gets your chart of accounts and structure, with no bookings yet. Later years go into the same file: pick them in the year selector.</p>",
    [{text:"Cancel", wert:null, art:"leicht"}, {text:"Create", wert:"ok"}]);
  if(!w) return;
  const j = parseInt((document.getElementById("neu-jahr")||{}).value, 10);
  const jahr = (j >= 1900 && j <= 2200) ? j : vorschlagJahr;
  state = leererStand(VORLAGE.mandant || "Untitled", jahr, []);
  state.ui.tab = "buchen"; ix = E.ctx(state);
  handle = null; dateiname = null; basis = null; geladen = true; verlauf.zurueck = []; verlauf.vor = [];
  starteApp(); markiere(); verworfeneWeg();
  const imp = await frage("Opening balances "+jahr, "Import the closing "+(jahr-1)+" now? It becomes the opening balance automatically: balance sheet accounts carry over, equity and the result of "+(jahr-1)+" roll into account "+(state.einstellungen.gewinnvortrag||"2800")+". Nothing is booked.",
    [{text:"Later", wert:false, art:"leicht"}, {text:"Import now", wert:true}]);
  if(imp) importDialog();
}
async function schliessen(){
  if(!(await verwerfenOk())) return;
  state = null; ix = null; geladen = false; handle = null; dateiname = null; basis = undefined; dirty = false; vgl = null;
  verlauf.zurueck = []; verlauf.vor = [];
  pickerZu(); navZu();
  $("#shell").classList.remove("on"); $("#start").classList.add("on"); window.scrollTo(0, 0);
  zeigeArbeitskopie();
}
async function verwerfenOk(){
  if(!dirty) return true;
  const w = await frage("Unsaved changes", "This file has changes that are not saved yet.",
    [{text:"Cancel", wert:"nein", art:"leicht"}, {text:"Discard", wert:"weg", art:"gefahr"}, {text:"Save", wert:"speichern"}]);
  if(w === "speichern") return await speichern(false, false) && !dirty;
  if(w === "weg") arbeitskopieWeg();
  return w === "weg";
}
async function vergleichsdateiLaden(){
  let text = null, name = null;
  if(FSA){
    try{
      const [h] = await window.showOpenFilePicker({types:[{description:"Buchhaltung", accept:{"application/json":[".json"]}}], multiple:false});
      const file = await h.getFile(); text = await file.text(); name = h.name;
    }catch(err){ if(err && err.name !== "AbortError") meldung(err.message, {fehler:true}); }
  }else{
    const file = await waehleDatei("#dateiwahl"); if(file){ text = await file.text(); name = file.name; }
  }
  if(!text) return false;
  let d; try{ d = JSON.parse(text); }catch(e){ meldung("The comparison file cannot be read.", {fehler:true}); return false; }
  const p = E.pruefeDatei(d, VORLAGE);
  if(p.fehler.length){ meldung(p.fehler.join(" "), {fehler:true}); return false; }
  vgl = {state:p.daten, name:name};
  meldung("Comparison file loaded: "+name+" ("+p.daten.jahr+")");
  return true;
}

