/* =====================================================================
   BOOK (interface rebuilt on the Design Lab kit, 25.10.2026)
   Two halves. THE BOOKING MODEL (draft → lines → checks → bookings) is EVEN's booking logic, rule for rule; nothing in
   it reads or writes an element. THE VIEW below it is written on the kit: the booking card, the account and text
   pickers, the posting with the balance beam, the split, the spread, the checks, the stamp and the side panels.
   ===================================================================== */

/* ================================================================ THE BOOKING MODEL (rules of 40_book.js) */
let entwurf = null, bearbeitet = null, letztesDatum = null, fokusKonto = null, bucht = false, frischId = null;
const vt = { an: false, start: '', monate: '12', manuell: false };       // the spread: switched on, first month, months
const leereSplit = (b, t) => ({ k: '', b: b || '', t: t || '', fw: '', kurs: '' });
const leereZeile = () => ({ k: '', s: '', h: '', t: '', fw: '', kurs: '' });
const WT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const zahlFmt = n => isFinite(n) ? tsd(E.r2(n), 2) : '';
const kontoName = nr => KN[nr] || 'unknown account';
const kontenSortiert = () => E.konten(state).sort((a, b) => a.nr.localeCompare(b.nr, 'de', { numeric: true }));
const idNr = b => parseInt(String(b.id).replace(/\D/g, ''), 10) || 0;

function startDatum(){
  const t = heute();
  if (letztesDatum && letztesDatum.slice(0, 4) === String(state.jahr)) return letztesDatum;
  return t.slice(0, 4) === String(state.jahr) ? t : state.jahr + '-01-01';
}
function neuerEntwurf(){
  entwurf = { modus: 'schnell', datum: startDatum(), datumRoh: '', text: '', betrag: '', soll: '', haben: '', fw: '', kurs: '', splitAktiv: false, split: [], z: [leereZeile(), leereZeile()] };
  bearbeitet = null; Object.assign(vt, { an: false, start: '', monate: '12', manuell: false });
}
const entwurfLeer = () => !entwurf || (!bearbeitet && !entwurf.text && !entwurf.betrag && !entwurf.soll && !entwurf.haben && !entwurf.z.some(z => z.k || z.s || z.h));

/* a booking back into the form: quick entry where it fits (one debit, one credit, or one side split), else lines */
function entwurfAusBuchung(b){
  const soll = b.z.filter(z => (z[1] || 0) > 0 && !(z[2] || 0)), haben = b.z.filter(z => (z[2] || 0) > 0 && !(z[1] || 0));
  const sauber = soll.length + haben.length === b.z.length;
  const e = { modus: 'zeilen', datum: b.datum, datumRoh: '', text: b.text || '', betrag: '', soll: '', haben: '', fw: '', kurs: '', splitAktiv: false, split: [],
    z: b.z.map(z => ({ k: z[0], s: z[1] ? zahlFmt(z[1]) : '', h: z[2] ? zahlFmt(z[2]) : '', t: z[5] || '', fw: z[3] ? zahlFmt(z[3]) : '', kurs: z[4] ? String(z[4]) : '' })) };
  if (!sauber || b.eb) return e;
  const fwVon = z => z && z[3] ? { fw: zahlFmt(z[3]), kurs: String(z[4]) } : null;
  if (soll.length === 1 && haben.length === 1 && Math.abs(soll[0][1] - haben[0][2]) < .005 && !soll[0][5] && !haben[0][5]){
    const fx = fwVon(soll[0]) || fwVon(haben[0]) || { fw: '', kurs: '' };
    return Object.assign(e, { modus: 'schnell', betrag: zahlFmt(soll[0][1]), soll: soll[0][0], haben: haben[0][0], fw: fx.fw, kurs: fx.kurs });
  }
  const einzeln = soll.length === 1 ? 'soll' : (haben.length === 1 ? 'haben' : null);
  if (einzeln){
    const haupt = einzeln === 'soll' ? soll[0] : haben[0], rest = einzeln === 'soll' ? haben : soll;
    const summe = E.r2(rest.reduce((a, z) => a + (z[1] || 0) + (z[2] || 0), 0)), total = (haupt[1] || 0) + (haupt[2] || 0);
    if (Math.abs(summe - total) < .005){
      const fx = fwVon(haupt) || { fw: '', kurs: '' };
      return Object.assign(e, { modus: 'schnell', betrag: zahlFmt(total), soll: einzeln === 'soll' ? haupt[0] : '', haben: einzeln === 'haben' ? haupt[0] : '',
        fw: fx.fw, kurs: fx.kurs, splitAktiv: true,
        split: rest.map(z => ({ k: z[0], b: zahlFmt((z[1] || 0) + (z[2] || 0)), t: z[5] || b.text || '', fw: z[3] ? zahlFmt(z[3]) : '', kurs: z[4] ? String(z[4]) : '' })) });
    }
  }
  return e;
}
/* the base booking of a spread as it was entered: the accrual line(s) replaced by the expense or income accounts of
   the plan, so it can be spread anew (other first month, months, amount or accounts) */
function urBuchung(b){
  if (!b || !b.plan || b.plan.rolle !== 'basis') return null;
  const ein = Object.assign({}, state.einstellungen || {}), abgr = [ein.ara, ein.araJahr, ein.pra, ein.praJahr].filter(Boolean);
  let konten = b.plan.konten && typeof b.plan.konten === 'object' ? b.plan.konten : null;
  if (!konten){   // older spreads: the split per account from the releases booked so far
    const total = E.r2(b.z.reduce((a, z) => abgr.indexOf(z[0]) >= 0 ? a + (z[1] || 0) - (z[2] || 0) : a, 0));
    const summe = {}; let gesamt = 0;
    state.buchungen.filter(x => x.plan && x.plan.id === b.plan.id && x.plan.rolle === 'aufloesung').forEach(x => x.z.forEach(z => {
      if (E.istER(E.grp(ix, z[0]))){ const v = E.r2((z[1] || 0) - (z[2] || 0)); summe[z[0]] = E.r2((summe[z[0]] || 0) + v); gesamt = E.r2(gesamt + v); } }));
    if (!gesamt) return null;
    konten = {}; Object.keys(summe).forEach(k => { konten[k] = E.r2(total * summe[k] / gesamt); });
  }
  const z = b.z.filter(x => abgr.indexOf(x[0]) < 0).map(x => x.slice());
  Object.keys(konten).forEach(k => { const a = E.r2(konten[k]); if (a > 0) z.push([k, a, 0]); else if (a < 0) z.push([k, 0, -a]); });
  const s = E.r2(z.reduce((a, x) => a + (x[1] || 0) - (x[2] || 0), 0));
  if (Math.abs(s) >= .005 || !z.some(x => ix.km[x[0]] && E.istER(E.grp(ix, x[0])))) return null;
  return { datum: b.datum, beleg: b.beleg || '', text: b.plan.text || b.text || '', z };
}
function naechsteId(){
  const ids = new Set(state.buchungen.map(b => b.id));
  let n = state.buchungen.reduce((a, b) => Math.max(a, idNr(b)), 0) + 1;
  while (ids.has('b' + String(n).padStart(4, '0'))) n++;
  return 'b' + String(n).padStart(4, '0');
}

/* the lines the draft stands for */
function splitSeite(){
  const s = !!ix.km[entwurf.soll], hb = !!ix.km[entwurf.haben];
  if (s && !hb && !String(entwurf.haben || '').trim()) return 'haben';
  if (hb && !s && !String(entwurf.soll || '').trim()) return 'soll';
  return null;
}
function betragWert(){ const v = E.betragAusEingabe(entwurf.betrag); return isFinite(v) ? E.r2(v) : NaN; }
function abgeleitet(){
  const D = [];
  if (entwurf.modus === 'zeilen'){
    entwurf.z.forEach(z => {
      const s = E.betragAusEingabe(z.s), hb = E.betragAusEingabe(z.h);
      const x = { k: String(z.k || '').trim(), s: isFinite(s) ? E.r2(Math.abs(s)) : 0, h: isFinite(hb) ? E.r2(Math.abs(hb)) : 0, t: String(z.t || '').trim(), fw: E.betragAusEingabe(z.fw), kurs: E.zahl(z.kurs) };
      if (x.k || x.s || x.h) D.push(x);
    });
    return D;
  }
  const b = betragWert(), betr = isFinite(b) ? Math.abs(b) : 0;
  const fw = E.betragAusEingabe(entwurf.fw), kurs = E.zahl(entwurf.kurs);
  const sp = entwurf.splitAktiv ? splitSeite() : null;
  const haupt = (k, seite) => ({ k, s: seite === 's' ? betr : 0, h: seite === 'h' ? betr : 0, t: '', fw, kurs });
  if (!sp){
    if (entwurf.soll || betr) D.push(haupt(entwurf.soll, 's'));
    if (entwurf.haben || betr) D.push(haupt(entwurf.haben, 'h'));
    return D;
  }
  D.push(sp === 'soll' ? haupt(entwurf.haben, 'h') : haupt(entwurf.soll, 's'));
  entwurf.split.forEach(x => {
    const v = E.betragAusEingabe(x.b), a = isFinite(v) ? E.r2(Math.abs(v)) : 0;
    if (!x.k && !a) return;
    const t = String(x.t || '').trim();
    D.push({ k: String(x.k || '').trim(), s: sp === 'soll' ? a : 0, h: sp === 'haben' ? a : 0, t: t && t !== entwurf.text.trim() ? t : '', fw: E.betragAusEingabe(x.fw), kurs: E.zahl(x.kurs) });
  });
  return D;
}
function splitRest(){
  const b = betragWert(); if (!isFinite(b)) return NaN;
  return E.r2(Math.abs(b) - entwurf.split.reduce((a, x) => { const v = E.betragAusEingabe(x.b); return a + (isFinite(v) ? Math.abs(v) : 0); }, 0));
}
function quickMoeglich(){
  const D = abgeleitet().filter(z => z.k), s = D.filter(z => z.s && !z.h), hb = D.filter(z => z.h && !z.s);
  return D.length === s.length + hb.length && (s.length === 1 || hb.length === 1) && !D.some(z => z.fw > 0);
}
/* the split opens when one side is left empty and there is an amount */
function splitAn(){
  if (entwurf.splitAktiv || !splitSeite() || !(betragWert() > 0)) return false;
  entwurf.splitAktiv = true;
  if (!entwurf.split.length) entwurf.split = [leereSplit(zahlFmt(betragWert()), entwurf.text)];
  return true;
}
/* after the last field of a split line: the next line with what is left, or false when nothing is left */
function splitNaechste(i){
  const rest = splitRest(), x = entwurf.split[i];
  if (i === entwurf.split.length - 1 && x && x.k && isFinite(rest) && rest >= .005){ entwurf.split.push(leereSplit(zahlFmt(rest), entwurf.text)); return true; }
  return false;
}
function zuZeilen(){
  const D = abgeleitet();
  entwurf.z = D.length ? D.map(z => ({ k: z.k, s: z.s ? zahlFmt(z.s) : '', h: z.h ? zahlFmt(z.h) : '', t: z.t || '', fw: isFinite(z.fw) && z.fw ? zahlFmt(z.fw) : '', kurs: z.kurs ? String(z.kurs) : '' })) : [leereZeile(), leereZeile()];
  while (entwurf.z.length < 2) entwurf.z.push(leereZeile());
  entwurf.modus = 'zeilen';
}
/* back to quick entry: lines that fit (one side with one account) come along; otherwise date and text stay, the rest
   starts empty (the view asks before that) */
function zuSchnell(){
  const D = abgeleitet().filter(z => z.k && (z.s || z.h)), alt = entwurf;
  const e = quickMoeglich() && D.length
    ? entwurfAusBuchung({ text: alt.text, datum: alt.datum, z: D.map(z => [z.k, z.s, z.h, isFinite(z.fw) ? z.fw : 0, z.kurs || 0, z.t]) })
    : null;
  entwurf = e && e.modus === 'schnell' ? e
    : { modus: 'schnell', datum: '', datumRoh: '', text: '', betrag: '', soll: '', haben: '', fw: '', kurs: '', splitAktiv: false, split: [], z: [leereZeile(), leereZeile()] };
  ['datum', 'datumRoh', 'text', 'eb', 'plan', 'neuVerteilen'].forEach(k => { if (alt[k] !== undefined) entwurf[k] = alt[k]; });
}
/* would quick entry lose something? (lines with amounts that do not fit one debit and one credit side) */
const schnellVerliert = () => !quickMoeglich() && abgeleitet().some(z => z.k || z.s || z.h);

/* the spread: a spread being booked anew runs in the year of its own booking date, under its plan id */
const respread = () => !!(bearbeitet && entwurf && entwurf.neuVerteilen);
const vtStand = () => respread() && E.istDatum(entwurf.datum) ? Object.assign({}, state, { jahr: parseInt(entwurf.datum.slice(0, 4), 10) }) : state;
function verteilungsVorschau(D){
  if (!vt.an || (bearbeitet && !respread())) return null;
  return E.verteilung(vtStand(), ix, { id: respread() && entwurf.plan ? entwurf.plan.id : undefined, datum: entwurf.datum, text: entwurf.text,
    start: vt.start, monate: vt.monate, zeilen: D.filter(z => ix.km[z.k]).map(z => [z.k, z.s, z.h, 0, 0, z.t]) });
}
function respreadGesperrt(){
  if (!respread() || !entwurf.plan) return null;
  const b = state.buchungen.find(x => x.plan && x.plan.id === entwurf.plan.id && istGeschlossen(String(x.datum).slice(0, 4)));
  return b ? String(b.datum).slice(0, 4) : null;
}

/* the checks: errors stop the booking, warnings only say something; each error may name the field to go to */
function pruefe(){
  const D = abgeleitet(), p = [];
  let soll = 0, haben = 0; D.forEach(z => { soll = E.r2(soll + z.s); haben = E.r2(haben + z.h); });
  const diff = E.r2(soll - haben);
  if (!E.istDatum(entwurf.datum)) p.push(['fehler', 'Enter a valid date.', '#bu-datum']);
  else if (istGeschlossen(entwurf.datum.slice(0, 4))) p.push(['fehler', 'The year ' + entwurf.datum.slice(0, 4) + ' is closed. Reopen it under Years and closings to book in it.', '#bu-datum']);
  else if (entwurf.datum.slice(0, 4) !== String(state.jahr)) p.push(['warn', 'The date is outside the selected year ' + state.jahr + '; the booking goes into ' + entwurf.datum.slice(0, 4) + '.']);
  const alt = bearbeitet ? state.buchungen.find(x => x.id === bearbeitet) : null;
  if (alt && istGeschlossen(String(alt.datum).slice(0, 4))) p.push(['fehler', 'This booking belongs to the closed year ' + String(alt.datum).slice(0, 4) + '. You can copy it, but not change it.']);
  else if (respreadGesperrt()) p.push(['fehler', 'Part of this spread lies in the closed year ' + respreadGesperrt() + ', so it cannot be booked anew. Reopen that year first.']);
  if (entwurf.modus === 'schnell'){
    const b = betragWert();
    if (String(entwurf.betrag).trim() === '') p.push(['fehler', 'Enter an amount.', '#bu-betrag']);
    else if (!isFinite(b)) p.push(['fehler', 'The amount cannot be read.', '#bu-betrag']);
    else if (b <= 0) p.push(['fehler', 'The amount must be positive; swap debit and credit instead.', '#bu-betrag']);
    const ks = String(entwurf.soll || '').trim(), kh = String(entwurf.haben || '').trim();
    if (!ks && !kh) p.push(['fehler', 'Choose a debit and a credit account.', '#bu-soll']);
    else if (ks && !ix.km[ks]) p.push(['fehler', 'Unknown debit account ' + ks + '.', '#bu-soll']);
    else if (kh && !ix.km[kh]) p.push(['fehler', 'Unknown credit account ' + kh + '.', '#bu-haben']);
    else if (!ks || !kh){
      if (!entwurf.splitAktiv) p.push(['fehler', !ks ? 'Choose a debit account, or split the debit side.' : 'Choose a credit account, or split the credit side.', !ks ? '#bu-soll' : '#bu-haben']);
      else {
        const rest = splitRest();
        entwurf.split.forEach((x, i) => { if (x.k && !ix.km[x.k]) p.push(['fehler', 'Unknown account ' + x.k + ' in split line ' + (i + 1) + '.', '[data-sp="' + i + '"][data-f="k"]']);
          else if (!x.k && isFinite(E.betragAusEingabe(x.b)) && E.betragAusEingabe(x.b)) p.push(['fehler', 'Split line ' + (i + 1) + ' needs an account.', '[data-sp="' + i + '"][data-f="k"]']); });
        if (isFinite(rest) && Math.abs(rest) >= .005) p.push(['fehler', rest > 0 ? 'Still ' + tsd(rest, 2) + ' to split.' : 'The split lines exceed the amount by ' + tsd(-rest, 2) + '.', null]);
      }
    }
    if (ks && kh && ks === kh) p.push(['warn', 'Debit and credit are the same account.']);
  } else {
    const unbekannt = D.filter(z => z.k && !ix.km[z.k]).map(z => z.k);
    if (unbekannt.length) p.push(['fehler', 'Unknown account: ' + unbekannt.join(', ') + '.']);
    if (D.some(z => !z.k && (z.s || z.h))) p.push(['fehler', 'A line with an amount has no account.']);
    if (D.filter(z => ix.km[z.k] && (z.s || z.h)).length < 2) p.push(['fehler', 'A booking needs at least two lines with amounts.']);
    if (Math.abs(diff) >= .005) p.push(['fehler', 'Debit and credit differ by ' + tsd(diff, 2) + '.']);
  }
  if (!(entwurf.text || '').trim()) p.push(['warn', 'Without a text the booking is hard to find later.']);
  D.forEach(z => { const k = ix.km[z.k]; if (k && k.wkz && (z.s || z.h) && !(z.fw > 0)) p.push(['warn', 'No ' + k.wkz + ' amount for ' + k.nr + '; its currency balance will be off.']); });
  const v = verteilungsVorschau(D);
  if (v){ if (!v.ok) v.fehler.forEach(x => p.push(['fehler', x])); else v.warnungen.forEach(x => p.push(['warn', x])); }
  const fehler = p.some(x => x[0] === 'fehler') || !soll || Math.abs(diff) >= .005;
  return { p, fehler, soll, haben, diff, D, vt: v };
}

/* booking: one transaction through aendere(), so one undo takes it back whole */
function buchenIntern(r){
  r = r || pruefe(); if (r.fehler) return null;
  const zeilen = r.D.filter(z => ix.km[z.k] && (z.s || z.h)).map(z => {
    const x = [z.k, z.s, z.h], k = ix.km[z.k], hatFW = k.wkz && z.fw > 0 && z.kurs > 0;
    if (hatFW || z.t){ x.push(hatFW ? E.r2(Math.abs(z.fw)) : 0); x.push(hatFW ? z.kurs : 0); }
    if (z.t) x.push(z.t);
    return x;
  });
  const kopf = { datum: entwurf.datum, beleg: '', text: (entwurf.text || '').trim() };
  let text = '', ok = false, anlage = null;
  if (bearbeitet && respread()){
    /* a spread booked anew: every booking of the old plan goes, the new plan is booked under the same plan id (the base
       keeps its booking id); later years that had releases get them again from the new plan */
    const alt = state.buchungen.find(b => b.id === bearbeitet), pid = alt.plan.id, J = parseInt(kopf.datum.slice(0, 4), 10);
    const vorher = state.buchungen.filter(b => b.plan && b.plan.id === pid).length - 1;
    const spaeter = state.buchungen.filter(b => b.plan && b.plan.id === pid && parseInt(String(b.datum).slice(0, 4), 10) > J)
      .map(b => parseInt(b.datum.slice(0, 4), 10)).filter((y, i, a) => a.indexOf(y) === i).sort();
    let v = null;
    if (vt.an){
      v = E.verteilung(vtStand(), ix, { id: pid, datum: kopf.datum, text: kopf.text, beleg: alt.beleg || '', start: vt.start, monate: vt.monate, zeilen: zeilen.map(z => z.slice()) });
      if (!v.ok){ toast(v.fehler.join(' '), { type: 'error' }); return null; }
      v.vorschau.forEach(x => { const y = parseInt(x.monat.slice(0, 4), 10); if (y > J && y <= Math.max(state.jahr, J) && spaeter.indexOf(y) < 0) spaeter.push(y); });
      spaeter.sort();
    }
    let neu = 0;
    ok = aendere(v ? 'Spread booked anew' : 'Spread turned into a normal booking', () => {
      state.buchungen = state.buchungen.filter(b => !(b.plan && b.plan.id === pid));
      if (v){
        if (v.basis) state.buchungen.push(Object.assign({ id: alt.id }, v.basis, alt.beleg ? { beleg: alt.beleg } : {}));
        v.aufloesungen.forEach(a => { state.buchungen.push(Object.assign({ id: naechsteId() }, a)); neu++; });
        if (v.uebertrag){ state.buchungen.push(Object.assign({ id: naechsteId() }, v.uebertrag)); neu++; }
        spaeter.forEach(Y => { if (istGeschlossen(Y)) return;
          E.spreadsFortfuehren(state, ix, Y).bookings.filter(b => b.plan.id === pid).forEach(b => { state.buchungen.push(Object.assign({ id: naechsteId() }, b)); neu++; }); });
      } else state.buchungen.push(Object.assign({ id: alt.id }, kopf, { z: zeilen }, alt.beleg ? { beleg: alt.beleg } : {}));
    });
    text = v ? 'Spread booked anew: ' + vorher + ' old bookings replaced by ' + neu + (spaeter.length ? ' (incl. ' + spaeter.join(', ') + ')' : '')
             : 'Saved as a normal booking; ' + vorher + ' spread bookings removed';
  } else if (bearbeitet){
    const id = bearbeitet;
    ok = aendere('Booking changed', () => {
      const i = state.buchungen.findIndex(b => b.id === id), alt = state.buchungen[i];
      const neu = Object.assign({ id }, kopf, { z: zeilen }); if (alt.beleg) neu.beleg = alt.beleg;
      if (alt.eb) neu.eb = true; if (alt.plan) neu.plan = alt.plan;
      state.buchungen[i] = neu;
    });
    text = 'Saved';
  } else if (r.vt && r.vt.ok){
    const v = E.verteilung(state, ix, { datum: kopf.datum, text: kopf.text, start: vt.start, monate: vt.monate, zeilen: zeilen.map(z => z.slice()) });
    if (!v.ok){ toast(v.fehler.join(' '), { type: 'error' }); return null; }
    ok = aendere('Spread booked', () => {
      if (v.basis) state.buchungen.push(Object.assign({ id: naechsteId() }, v.basis));
      v.aufloesungen.forEach(a => state.buchungen.push(Object.assign({ id: naechsteId() }, a)));
      if (v.uebertrag) state.buchungen.push(Object.assign({ id: naechsteId() }, v.uebertrag));
    });
    text = 'Spread booked: ' + ((v.basis ? 1 : 0) + v.aufloesungen.length + (v.uebertrag ? 1 : 0)) + ' bookings' + (v.rest ? ', ' + tsd(v.rest, 2) + ' carried into ' + (state.jahr + 1) : '');
  } else {
    ok = aendere('Booking recorded', () => { state.buchungen.push(Object.assign({ id: naechsteId() }, kopf, { z: zeilen })); });
    text = 'Booked: ' + (kopf.text || 'no text') + ', ' + tsd(r.soll, 2);
    /* a purchase on a fixed-asset account: the register asks for the details */
    const az = zeilen.find(z => (z[1] || 0) > 0.005 && E.anlageKonto(ix, z[0]));
    if (az) anlage = { konto: az[0], kosten: az[1], datum: kopf.datum, text: kopf.text };
  }
  if (!ok) return null;
  letztesDatum = kopf.datum;
  frischId = bearbeitet || state.buchungen[state.buchungen.length - 1].id;
  return { text, anlage };
}

/* ================================================================ THE VIEW */
const BEWEGUNG = !REDUCED;
const stichtag = () => E.istDatum(entwurf && entwurf.datum) ? entwurf.datum : (heute().slice(0, 4) === String(state.jahr) ? heute() : state.jahr + '-12-31');
/* balance shown for an account: debit-positive for assets and expenses, credit-positive for liabilities, equity and income */
function saldoVon(nr, s){ const g = ix.gm[(ix.km[nr] || {}).grp], v = s[nr] || 0; return g && (g.s === 'P' || (g.s === 'E' && g.vz < 0)) ? -v : v; }

/* ---------------------------------------------------------------- pickers: accounts and earlier texts, a kit menu at the field */
let picker = null;                                   // the one open picker: {input, menu, zu}
function pickerZu(){ if (picker){ const p = picker; picker = null; p.zu(); } }
function pickerPlatz(menu, input){
  const r = input.getBoundingClientRect(), vh = window.innerHeight, vw = document.documentElement.clientWidth;
  const w = Math.min(Math.max(r.width, 360), vw - 16);
  menu.style.width = w + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
  const below = vh - r.bottom - 14, above = r.top - 14, up = below < 220 && above > below;
  menu.classList.toggle('is-up', up);
  menu.style.top = up ? 'auto' : (r.bottom + 6) + 'px';
  menu.style.bottom = up ? (vh - r.top + 6) + 'px' : 'auto';
  menu.style.maxHeight = Math.max(120, Math.min(360, up ? above : below)) + 'px';
}
function imBlick(menu){
  const on = menu.querySelector('.is-active'); if (!on) return;
  if (on.offsetTop < menu.scrollTop) menu.scrollTop = on.offsetTop - 6;
  else if (on.offsetTop + on.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = on.offsetTop + on.offsetHeight - menu.clientHeight + 6;
}
document.addEventListener('pointerdown', e => { if (picker && !picker.menu.contains(e.target) && !picker.input.contains(e.target)) pickerZu(); }, true);
window.addEventListener('scroll', e => { if (picker && !picker.menu.contains(e.target)){ if (picker.platz) picker.platz(); else pickerPlatz(picker.menu, picker.input); } }, true);
window.addEventListener('resize', () => pickerZu());
/* one picker per field: the menu, mouse picks on press, touch only on a tap (so the list scrolls under the finger) */
function pickerMenu(input, klasse, zu){
  const menu = h('div', { class: 'menu ev-pick ' + (klasse || ''), role: 'listbox' });
  menu.addEventListener('touchstart', () => { menu.dataset.touch = '1'; }, { passive: true });
  document.body.appendChild(menu);
  picker = { input, menu, zu };
  return menu;
}
function pickerEintrag(i, aktiv, kids, waehle){
  const b = h('button', { type: 'button', role: 'option', tabindex: '-1', class: 'menu__item' + (i === aktiv ? ' is-active' : ''), 'aria-selected': i === aktiv ? 'true' : 'false' }, kids);
  b.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse'){ e.preventDefault(); waehle(i); } });
  b.addEventListener('click', e => { e.preventDefault(); waehle(i); });
  return b;
}

/* the account picker: on focus the whole chart with the current account marked; typing a number finds by number first,
   otherwise by name or group. Enter or Tab takes it; nothing typed keeps the account; an emptied field clears it */
function kontoWahl(input, beiWahl, aktuell){
  let menu = null, treffer = [], aktiv = 0, getippt = false;
  const zu = () => { if (menu){ menu.remove(); menu = null; } };
  function suche(){
    const roh = getippt ? input.value.trim() : '', erstes = roh.split(/\s+/)[0];
    const q = /^\d[\d.]*$/.test(erstes) ? erstes : roh, qn = norm(q);
    let alle = kontenSortiert();
    if (q){
      const a = alle.filter(k => k.nr.indexOf(q) === 0);
      const b = alle.filter(k => k.nr.indexOf(q) !== 0 && (norm(k.name).indexOf(qn) >= 0 || norm((ix.gm[k.grp] || {}).t).indexOf(qn) >= 0));
      alle = a.concat(b);
    }
    return alle.slice(0, getippt ? 60 : 400);
  }
  function zeichne(){
    treffer = suche();
    if (!getippt){ const jetzt = aktuell ? aktuell() : ''; const i = treffer.findIndex(k => k.nr === jetzt); aktiv = i >= 0 ? i : 0; }
    aktiv = Math.min(aktiv, Math.max(0, treffer.length - 1));
    if (!menu || !menu.isConnected){ pickerZu(); menu = pickerMenu(input, 'ev-pick--konto', zu); }
    const s = E.saldoPer(state, stichtag());
    menu.innerHTML = '';
    if (!treffer.length) menu.appendChild(h('div', { class: 'ev-pick__leer' }, ['No account found. Add it under Accounts.']));
    treffer.forEach((k, i) => {
      const g = ix.gm[k.grp], v = saldoVon(k.nr, s);
      menu.appendChild(pickerEintrag(i, aktiv, [h('span', { class: 'nr' }, [k.nr]), h('span', { class: 'nm' }, [k.name, k.wkz ? h('span', { class: 'chip ev-chip-sm' }, [k.wkz]) : null]),
        h('span', { class: 'v' + (v < -0.005 ? ' neg' : '') }, [tsd(v, 2)]), h('span', { class: 'g' }, [g ? g.t : ''])], waehle));
    });
    pickerPlatz(menu, input); imBlick(menu);
  }
  function waehle(i){ const k = treffer[i]; if (!k) return; pickerZu(); getippt = false; beiWahl(k); }
  input.addEventListener('focus', () => { getippt = false; zeichne(); if (input.select) input.select(); });
  input.addEventListener('pointerdown', () => { if (document.activeElement === input && !menu){ getippt = false; zeichne(); } });
  input.addEventListener('input', () => { getippt = true; aktiv = 0; zeichne(); });
  input.addEventListener('blur', () => setTimeout(() => { if (menu && !menu.dataset.touch && document.activeElement !== input && picker && picker.input === input) pickerZu(); }, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown'){ e.preventDefault(); if (!menu) zeichne(); aktiv = Math.min(aktiv + 1, treffer.length - 1); zeichne(); return; }
    if (e.key === 'ArrowUp'){ if (!menu) return; e.preventDefault(); aktiv = Math.max(aktiv - 1, 0); zeichne(); return; }
    if (!menu) return;
    if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); pickerZu(); return; }
    const roh = input.value.trim();
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)){
      if (!getippt){ pickerZu(); return; }                           // nothing typed: keep the current account
      if (!roh){ pickerZu(); beiWahl(null); return; }                 // field emptied on purpose
      const exakt = treffer.findIndex(k => k.nr === roh.split(/\s+/)[0]);
      if (exakt >= 0){ if (e.key === 'Enter') e.preventDefault(); e.__gewaehlt = true; waehle(exakt); return; }
      if (treffer.length){ if (e.key === 'Enter') e.preventDefault(); e.__gewaehlt = true; waehle(aktiv); }
    }
  });
}

/* earlier booking texts, proposed while typing. Arrow down picks one, Enter or Tab takes it. New: when debit and
   credit are still empty, they come along from the latest booking with that text */
function textVorschlag(input){
  let menu = null, treffer = [], aktiv = -1;
  const zu = () => { if (menu){ menu.remove(); menu = null; } aktiv = -1; };
  function kandidaten(roh){
    const q = norm(roh.trim()); if (q.length < 2) return [];
    const m = new Map();
    state.buchungen.forEach(b => {
      const t = String(b.text || '').trim(); if (!t || b.eb || (b.plan && b.plan.rolle === 'aufloesung')) return;
      const n = norm(t), i = n.indexOf(q); if (i < 0 || n === q) return;
      const rang = i === 0 ? 0 : (/[\s\-\/(.,]/.test(n.charAt(i - 1)) ? 1 : 2), x = m.get(n);
      if (!x || b.datum > x.datum) m.set(n, { text: t, datum: b.datum, rang, n: (x ? x.n : 0) + 1, bf: buchungsform(b) });
      else x.n++;
    });
    return Array.from(m.values()).sort((a, b) => a.rang - b.rang || (a.datum < b.datum ? 1 : -1)).slice(0, 8);
  }
  function zeichne(){
    treffer = kandidaten(input.value);
    if (!treffer.length){ if (picker && picker.input === input) pickerZu(); else zu(); return; }
    aktiv = Math.min(aktiv, treffer.length - 1);
    if (!menu || !menu.isConnected){ pickerZu(); menu = pickerMenu(input, 'ev-pick--text', zu); }
    const q = norm(input.value.trim());
    menu.innerHTML = '';
    treffer.forEach((x, i) => {
      const n = norm(x.text), p = n.indexOf(q), mitMark = p >= 0 && n.length === x.text.length;
      const t = mitMark ? [x.text.slice(0, p), h('mark', {}, [x.text.slice(p, p + q.length)]), x.text.slice(p + q.length)] : [x.text];
      menu.appendChild(pickerEintrag(i, aktiv, [h('span', { class: 't' }, t),
        h('span', { class: 'kz' }, [(x.bf.sollNr || 'Split') + ' → ' + (x.bf.habenNr || 'Split') + ' · ' + dateLong(x.datum) + (x.n > 1 ? ' · ' + x.n + '×' : '')])], waehle));
    });
    pickerPlatz(menu, input); imBlick(menu);
  }
  function nimm(x){
    input.value = x.text; entwurf.text = x.text;
    const bf = x.bf;
    if (entwurf.modus === 'schnell' && !entwurf.soll && !entwurf.haben && bf.sollNr && bf.habenNr && ix.km[bf.sollNr] && ix.km[bf.habenNr]){
      entwurf.soll = bf.sollNr; entwurf.haben = bf.habenNr; fokusKonto = bf.habenNr;
      setzeKontofeld('#bu-soll', entwurf.soll); setzeKontofeld('#bu-haben', entwurf.haben);
      $('#bu-text-info').textContent = 'Accounts from ' + dateLong(x.datum); renderFW(); renderVerlauf();
    }
    aktualisiere();
  }
  function waehle(i){ const x = treffer[i]; if (!x) return; pickerZu(); nimm(x); input.focus(); }
  input.addEventListener('input', () => { aktiv = -1; zeichne(); });
  input.addEventListener('blur', () => setTimeout(() => { if (menu && !menu.dataset.touch && document.activeElement !== input && picker && picker.input === input) pickerZu(); }, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown'){ if (!menu) zeichne(); if (!menu) return; e.preventDefault(); aktiv = Math.min(aktiv + 1, treffer.length - 1); zeichne(); return; }
    if (!menu) return;
    if (e.key === 'ArrowUp'){ e.preventDefault(); aktiv = Math.max(aktiv - 1, -1); zeichne(); return; }
    if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); pickerZu(); return; }
    if ((e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) && aktiv >= 0){
      const x = treffer[aktiv]; e.stopImmediatePropagation(); pickerZu();
      if (e.key === 'Enter') e.preventDefault();
      nimm(x); return;                                                // Tab: take it and move on
    }
    if (e.key === 'Tab' || e.key === 'Enter') pickerZu();
  });
}

/* ---------------------------------------------------------------- the booking card */
function setzeKontofeld(sel, nr){
  const el = $(sel); if (document.activeElement === el) return;
  const k = ix.km[nr]; el.value = k ? nr + ' ' + k.name : (nr || '');
  el.closest('.field').classList.toggle('is-error', !!nr && !k);
}
/* under an account field: its group and currency, and its balance on the booking date */
function kontoInfo(nr, el){
  if (!el) return;
  el.innerHTML = ''; el.classList.remove('neg');
  if (!nr) return;
  const k = ix.km[nr];
  if (!k){ el.textContent = 'unknown account'; el.classList.add('neg'); return; }
  const g = ix.gm[k.grp], s = E.saldoPer(state, stichtag()), v = saldoVon(nr, s);
  el.appendChild(h('span', {}, [(g ? g.t : '') + (k.wkz ? ', ' + k.wkz : '')]));
  el.appendChild(h('b', { class: v < -0.005 ? 'neg' : '' }, [(g && g.s === 'E' ? 'Year ' : 'Balance ') + tsd(v, 2)]));
}
function renderBuchen(){
  if (!entwurf) neuerEntwurf();
  const b = bearbeitet ? state.buchungen.find(x => x.id === bearbeitet) : null, zu = !!(b && istGeschlossen(String(b.datum).slice(0, 4)));
  const imJahrN = state.buchungen.filter(x => String(x.datum).slice(0, 4) === String(state.jahr)).length;
  $('#eyebrow').textContent = 'Financial year ' + state.jahr + (istGeschlossen(state.jahr) ? ' · closed' : '') + ' · ' + imJahrN + ' bookings';
  $('#bu-titel').textContent = bearbeitet ? 'Edit booking' : 'New booking';
  $('#bu-sub').textContent = bearbeitet ? (b ? dateLong(b.datum) + ' · ' + (b.text || 'no text') : '') : (Kit.TOUCH ? 'Book is ready once the checks are clear' : 'Enter books · Tab moves on · Ctrl/Cmd + Z undoes');
  let banner = '';
  if (zu) banner = 'This booking belongs to the closed year ' + String(b.datum).slice(0, 4) + '. It can be viewed and copied, not changed.';
  else if (b && b.eb) banner = 'This is the opening balance. Changes affect every opening balance of the year.';
  else if (b && b.plan && (b.plan.rolle === 'abschreibung' || b.plan.rolle === 'abgang')){
    /* the fixed-asset register's bookings: depreciation for one month (or a range, booked yearly) and the disposal */
    const a = (state.anlagen || []).find(x => x.id === b.plan.id), name = a ? '“' + a.text + '”' : 'a fixed asset';
    banner = b.plan.rolle === 'abgang' ? 'Disposal of ' + name + ', booked by the fixed-asset register. Changes only affect this booking.'
      : 'Depreciation of ' + name + ' (' + (b.plan.ab && b.plan.ab !== b.plan.nr ? 'months ' + b.plan.ab + '–' : 'month ') + b.plan.nr + ' of ' + b.plan.von + '), booked by the fixed-asset register. Changes only affect this booking; the schedule is changed under Fixed assets.';
  }
  else if (b && b.plan && b.plan.rolle === 'uebertrag') banner = 'Carry-over of a spread into the next year. Changes only affect this booking.';
  else if (b && b.plan && b.plan.rolle === 'aufloesung') banner = 'Part of a spread (month ' + b.plan.nr + ' of ' + b.plan.von + '). Changes only affect this booking.';
  else if (b && b.plan && respread()){
    const n = state.buchungen.filter(x => x.plan && x.plan.id === b.plan.id && x.id !== b.id).length, st = String(b.plan.start || b.datum);
    banner = 'Spread over ' + b.plan.monate + ' months from ' + MONATE[+st.slice(5, 7) - 1] + ' ' + st.slice(0, 4) + '. Change the first month, the months, the amount or the accounts and save: its '
      + n + ' other booking' + (n === 1 ? '' : 's') + ' (releases and carry-over) are replaced by the new plan. Switch the spread off to book it as a normal booking.';
  }
  else if (b && b.plan) banner = 'Base booking of a spread over ' + b.plan.monate + ' months. The monthly releases stay as they are.';
  const bn = $('#bu-banner'); bn.textContent = banner; bn.hidden = !banner;
  const schnell = entwurf.modus === 'schnell', seg = $('#bu-modus');
  seg.style.setProperty('--i', schnell ? 0 : 1);
  $$('button', seg).forEach(x => { const on = (x.dataset.modus === 'schnell') === schnell; x.classList.toggle('is-active', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
  $('#bu-schnell').hidden = !schnell; $('#bu-zeilen').hidden = schnell;
  $('#maske').classList.toggle('is-lines', !schnell);
  if (document.activeElement !== $('#bu-datum')) $('#bu-datum').value = E.istDatum(entwurf.datum) ? dateLong(entwurf.datum) : (entwurf.datumRoh || '');
  if (document.activeElement !== $('#bu-text')) $('#bu-text').value = entwurf.text;
  $('#bu-text-info').textContent = '';
  if (schnell){
    if (document.activeElement !== $('#bu-betrag')) $('#bu-betrag').value = entwurf.betrag;
    setzeKontofeld('#bu-soll', entwurf.soll); setzeKontofeld('#bu-haben', entwurf.haben);
    renderFW(); renderSplit();
  } else renderZeilenmodus();
  $('#bu-del').hidden = !bearbeitet || zu; $('#bu-kopie').hidden = !bearbeitet;
  $('#bu-reset').textContent = bearbeitet ? 'New booking' : 'Clear';
  $('#bu-verteilung-box').hidden = !!bearbeitet && (!respread() || zu);
  if (vt.an && !vt.start) vt.start = (entwurf.datum || '').slice(0, 7);
  $('#vt-an').checked = vt.an; $('#vt-panel').hidden = !vt.an;
  if (document.activeElement !== $('#vt-start')) $('#vt-start').value = vt.start;
  if (document.activeElement !== $('#vt-monate')) $('#vt-monate').value = vt.monate;
  aktualisiere();
  renderVerlauf(); renderPlaene(); renderLetzte();
}
/* foreign currency: the amount in the account's currency and the rate; the CHF amount follows */
function renderFW(){
  const box = $('#bu-fw'), ks = ix.km[entwurf.soll], kh = ix.km[entwurf.haben], w = (ks && ks.wkz) || (kh && kh.wkz);
  box.innerHTML = '';
  if (!w){ entwurf.fw = ''; box.hidden = true; return; }
  box.hidden = false;
  if (ks && kh && ks.wkz && kh.wkz && ks.wkz !== kh.wkz){ box.appendChild(h('p', { class: 'note' }, ['Two different currencies: switch to Lines to record both foreign amounts.'])); return; }
  if (!entwurf.kurs) entwurf.kurs = String(state.kurse[w] || '');
  const fwIn = h('input', { class: 'input num', id: 'bu-fwbetrag', inputmode: 'decimal', autocomplete: 'off', value: entwurf.fw });
  const kursIn = h('input', { class: 'input num', id: 'bu-kurs', inputmode: 'decimal', autocomplete: 'off', value: entwurf.kurs });
  box.appendChild(h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'bu-fwbetrag' }, ['Amount in ' + w]), fwIn]));
  box.appendChild(h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'bu-kurs' }, ['Rate']), kursIn]));
  box.appendChild(h('p', { class: 'note' }, [state.waehrung + ' amount = ' + w + ' amount × rate']));
  const rechne = () => { const a = E.betragAusEingabe(entwurf.fw), r = E.zahl(entwurf.kurs);
    if (isFinite(a) && a && isFinite(r) && r){ entwurf.betrag = zahlFmt(Math.abs(a) * r); $('#bu-betrag').value = entwurf.betrag; } aktualisiere(); };
  fwIn.addEventListener('input', () => { entwurf.fw = fwIn.value; rechne(); });
  kursIn.addEventListener('input', () => { entwurf.kurs = kursIn.value; rechne(); });
  [fwIn, kursIn].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); enter(); } }));
}
function restKlasse(rest){ return !isFinite(rest) ? '' : (Math.abs(rest) < .005 ? 'is-zero' : (rest > 0 ? 'is-open' : 'is-over')); }
/* the split side: one line per account, the remaining amount counts down to zero */
function renderSplit(fokus){
  const box = $('#bu-split'), sp = entwurf.splitAktiv ? splitSeite() : null;
  box.innerHTML = '';
  if (!sp){ box.hidden = true; return; }
  box.hidden = false;
  const fw = entwurf.split.some(x => ix.km[x.k] && ix.km[x.k].wkz), rest = splitRest();
  box.appendChild(h('div', { class: 'ev-split__head' }, [h('span', {}, [h('b', {}, ['Split the ' + (sp === 'soll' ? 'debit' : 'credit') + ' side']), ' of ' + tsd(betragWert() || 0, 2)]),
    h('span', { class: 'chip ev-rest ' + restKlasse(rest), id: 'bu-rest' }, ['Remaining ' + (isFinite(rest) ? tsd(rest, 2) : '–')])]));
  entwurf.split.forEach((x, i) => {
    const k = ix.km[x.k], wkz = k && k.wkz;
    const feld = (f, attrs) => h('input', Object.assign({ class: 'input' + (f === 'b' || f === 'fw' || f === 'kurs' ? ' num' : ''), 'data-sp': i, 'data-f': f, autocomplete: 'off' }, attrs));
    const kIn = feld('k', { value: k ? x.k + ' ' + k.name : x.k, placeholder: 'Account', 'aria-label': 'Account, split line ' + (i + 1) });
    const zeile = h('div', { class: 'ev-split__row' + (fw ? ' has-fx' : '') }, [
      h('div', { class: 'field' + (x.k && !k ? ' is-error' : '') }, [kIn, h('span', { class: 'field__hint ev-kinfo', 'data-spinfo': i })]),
      fw ? feld('fw', { value: x.fw, disabled: wkz ? null : true, placeholder: wkz || '', 'aria-label': 'Foreign amount' }) : null,
      fw ? feld('kurs', { value: x.kurs, disabled: wkz ? null : true, placeholder: wkz ? String(state.kurse[wkz] || '') : '', 'aria-label': 'Rate' }) : null,
      feld('b', { value: x.b, inputmode: 'decimal', 'aria-label': 'Amount, split line ' + (i + 1) }),
      feld('t', { value: x.t, placeholder: 'Line text', 'aria-label': 'Text, split line ' + (i + 1) }),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', tabindex: '-1', 'aria-label': 'Remove split line ' + (i + 1), html: icon('x', 14),
        onclick: () => { entwurf.split.splice(i, 1); if (!entwurf.split.length) entwurf.splitAktiv = false; renderSplit(); aktualisiere(); } })]);
    box.appendChild(zeile);
  });
  $$('#bu-split input').forEach(inp => {
    const i = +inp.dataset.sp, f = inp.dataset.f;
    if (f === 'k'){
      kontoWahl(inp, k => {
        const x = entwurf.split[i]; if (!x) return;
        x.k = k ? k.nr : ''; fokusKonto = x.k || fokusKonto;
        if (k && k.wkz && !x.kurs) x.kurs = String(state.kurse[k.wkz] || '');
        inp.value = k ? k.nr + ' ' + k.name : ''; inp.closest('.field').classList.remove('is-error');
        const brauchtFW = entwurf.split.some(y => ix.km[y.k] && ix.km[y.k].wkz);
        if (brauchtFW !== !!$('#bu-split .has-fx')) renderSplit({ i, f: 'b' });
        kontoInfo(x.k, $('[data-spinfo="' + i + '"]')); aktualisiere(); renderVerlauf();
      }, () => (entwurf.split[i] || {}).k);
      inp.addEventListener('input', () => { const t = inp.value.trim().split(/\s+/)[0]; entwurf.split[i].k = /^\d[\d.]*$/.test(t) ? t : inp.value.trim(); aktualisiere(); });
      kontoInfo(entwurf.split[i].k, $('[data-spinfo="' + i + '"]'));
    } else {
      inp.addEventListener('input', () => {
        const x = entwurf.split[i]; x[f] = inp.value;
        if (f === 'fw' || f === 'kurs'){ const a = E.betragAusEingabe(x.fw), r = E.zahl(x.kurs);
          if (isFinite(a) && a && isFinite(r) && r){ x.b = zahlFmt(Math.abs(a) * r); const el = $('[data-sp="' + i + '"][data-f="b"]'); if (el) el.value = x.b; } }
        aktualisiereRest(); aktualisiere();
      });
      if (f === 'b') inp.addEventListener('blur', () => { const x = entwurf.split[i], v = E.betragAusEingabe(x && x.b); if (isFinite(v) && x){ x.b = zahlFmt(Math.abs(v)); inp.value = x.b; } });
    }
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.__gewaehlt && !e.defaultPrevented){ e.preventDefault(); if (splitNaechste(i)){ renderSplit({ i: i + 1, f: 'k' }); aktualisiere(); } else enter(); return; }
      if (e.key === 'Tab' && !e.shiftKey && f === 't' && splitNaechste(i)){ e.preventDefault(); renderSplit({ i: i + 1, f: 'k' }); aktualisiere(); }
    });
  });
  if (fokus){ const el = $('#bu-split [data-sp="' + fokus.i + '"][data-f="' + fokus.f + '"]'); if (el){ el.focus(); if (el.select) el.select(); } }
}
function aktualisiereRest(){
  const el = $('#bu-rest'); if (!el) return;
  const rest = splitRest();
  el.textContent = 'Remaining ' + (isFinite(rest) ? tsd(rest, 2) : '–'); el.className = 'chip ev-rest ' + restKlasse(rest);
}
/* lines: any number of accounts, each with debit or credit */
function renderZeilenmodus(fokus){
  const box = $('#bu-zeilen'), fw = entwurf.z.some(z => ix.km[z.k] && ix.km[z.k].wkz);
  box.innerHTML = '';
  box.appendChild(h('div', { class: 'ev-lines__head' }, [h('span', {}, ['Account']), h('span', { class: 'r' }, ['Debit']), h('span', { class: 'r' }, ['Credit']), h('span', {}, ['Line text']), h('span')]));
  entwurf.z.forEach((z, i) => {
    const k = ix.km[z.k], wkz = k && k.wkz;
    const feld = (f, attrs) => h('input', Object.assign({ class: 'input' + (f === 'k' || f === 't' ? '' : ' num'), 'data-zl': i, 'data-f': f, autocomplete: 'off' }, attrs));
    box.appendChild(h('div', { class: 'ev-lines__row' }, [
      h('div', { class: 'field' + (z.k && !k ? ' is-error' : '') }, [feld('k', { value: k ? z.k + ' ' + k.name : z.k, placeholder: 'Account', 'aria-label': 'Account, line ' + (i + 1) }),
        h('span', { class: 'field__hint ev-kinfo', 'data-zlinfo': i }),
        wkz ? h('div', { class: 'ev-lines__fx' }, [feld('fw', { value: z.fw, placeholder: wkz, 'aria-label': 'Foreign amount' }), feld('kurs', { value: z.kurs || state.kurse[wkz] || '', placeholder: 'Rate', 'aria-label': 'Rate' })]) : null]),
      feld('s', { value: z.s, inputmode: 'decimal', placeholder: 'Debit', 'aria-label': 'Debit, line ' + (i + 1) }),
      feld('h', { value: z.h, inputmode: 'decimal', placeholder: 'Credit', 'aria-label': 'Credit, line ' + (i + 1) }),
      feld('t', { value: z.t, placeholder: 'optional', 'aria-label': 'Line text, line ' + (i + 1) }),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', tabindex: '-1', 'aria-label': 'Remove line ' + (i + 1), html: icon('x', 14),
        onclick: () => { if (entwurf.z.length > 2) entwurf.z.splice(i, 1); else entwurf.z[i] = leereZeile(); renderZeilenmodus(); aktualisiere(); } })]));
  });
  box.appendChild(h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => { entwurf.z.push(leereZeile()); renderZeilenmodus({ i: entwurf.z.length - 1, f: 'k' }); aktualisiere(); } }, ['Add line']));
  $$('#bu-zeilen input').forEach(inp => {
    const i = +inp.dataset.zl, f = inp.dataset.f;
    if (f === 'k'){
      kontoWahl(inp, k => { const z = entwurf.z[i]; if (!z) return; const warFW = !!(ix.km[z.k] || {}).wkz;
        z.k = k ? k.nr : ''; fokusKonto = z.k || fokusKonto; inp.value = k ? k.nr + ' ' + k.name : ''; inp.closest('.field').classList.remove('is-error');
        if (!!(k || {}).wkz !== warFW) renderZeilenmodus({ i, f: 's' }); else kontoInfo(z.k, $('[data-zlinfo="' + i + '"]'));
        aktualisiere(); renderVerlauf(); }, () => (entwurf.z[i] || {}).k);
      inp.addEventListener('input', () => { const t = inp.value.trim().split(/\s+/)[0]; entwurf.z[i].k = /^\d[\d.]*$/.test(t) ? t : inp.value.trim(); aktualisiere(); });
      kontoInfo(entwurf.z[i].k, $('[data-zlinfo="' + i + '"]'));
    } else {
      inp.addEventListener('input', () => {
        const z = entwurf.z[i]; z[f] = inp.value;
        if ((f === 's' || f === 'h') && isFinite(E.betragAusEingabe(inp.value)) && E.betragAusEingabe(inp.value)){
          const g = f === 's' ? 'h' : 's'; z[g] = ''; const el = $('[data-zl="' + i + '"][data-f="' + g + '"]'); if (el) el.value = ''; }
        if (f === 'fw' || f === 'kurs'){ const a = E.betragAusEingabe(z.fw), r = E.zahl(z.kurs || state.kurse[(ix.km[z.k] || {}).wkz]);
          if (isFinite(a) && a && isFinite(r) && r){ const seite = (E.betragAusEingabe(z.h) && !E.betragAusEingabe(z.s)) ? 'h' : 's';
            z[seite] = zahlFmt(Math.abs(a) * r); z[seite === 's' ? 'h' : 's'] = '';
            ['s', 'h'].forEach(x => { const el = $('[data-zl="' + i + '"][data-f="' + x + '"]'); if (el) el.value = z[x]; }); } }
        aktualisiere();
      });
      if (f === 's' || f === 'h') inp.addEventListener('blur', () => { const z = entwurf.z[i], v = E.betragAusEingabe(z && z[f]);
        if (isFinite(v) && z && z[f] !== ''){ z[f] = zahlFmt(Math.abs(v)); inp.value = z[f]; } });
    }
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.__gewaehlt && !e.defaultPrevented){ e.preventDefault(); enter(); } });
  });
  if (fokus){ const el = $('#bu-zeilen [data-zl="' + fokus.i + '"][data-f="' + fokus.f + '"]'); if (el) el.focus(); }
}

/* the balance beam: tilts toward the heavier side, level and green once debit equals credit */
function waage(r){
  const w = $('#bu-waage');
  if (!w.querySelector('svg')){
    w.innerHTML = '<svg width="112" height="50" viewBox="0 0 132 58" aria-hidden="true">'
      + '<path d="M66 56 L58 56 L66 46 L74 56 Z" fill="currentColor" opacity=".35"/><line x1="66" y1="20" x2="66" y2="47" stroke="currentColor" stroke-width="1.5" opacity=".5"/>'
      + '<g class="ev-beam__arm"><line x1="14" y1="20" x2="118" y2="20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
      + '<path d="M20 20 L12 36 M20 20 L28 36 M8 36 Q20 44 32 36" fill="none" stroke="currentColor" stroke-width="1.4"/>'
      + '<path d="M112 20 L104 36 M112 20 L120 36 M100 36 Q112 44 124 36" fill="none" stroke="currentColor" stroke-width="1.4"/></g>'
      + '<circle cx="66" cy="20" r="3" fill="currentColor"/></svg>'
      + '<div class="ev-beam__vals"><span>Debit</span><b id="w-s"></b><span>Credit</span><b id="w-h"></b></div><div class="ev-beam__verdict" id="w-u"></div>';
  }
  const max = Math.max(r.soll, r.haben, 1), winkel = Math.max(-11, Math.min(11, -(r.diff / max) * 14));
  $('.ev-beam__arm', w).style.transform = 'rotate(' + winkel.toFixed(2) + 'deg)';
  const gleich = Math.abs(r.diff) < .005 && r.soll > 0;
  w.className = 'ev-beam' + (gleich ? ' is-even' : (r.soll || r.haben ? ' is-off' : ''));
  $('#w-s').textContent = tsd(r.soll, 2); $('#w-h').textContent = tsd(r.haben, 2);
  $('#w-u').textContent = gleich ? 'Balanced' : (r.soll || r.haben ? 'Difference ' + tsd(r.diff, 2) : '');
}
function aktualisiere(){
  const r = pruefe();
  /* the hints under date and amount */
  const di = $('#bu-datum-info');
  if (E.istDatum(entwurf.datum)){ const d = new Date(entwurf.datum + 'T12:00:00Z'); di.textContent = WT[d.getUTCDay()] + ' ' + dateLong(entwurf.datum); di.classList.remove('neg'); $('#bu-datum').closest('.field').classList.remove('is-error'); }
  else { di.textContent = entwurf.datumRoh ? 'not a date' : ''; di.classList.toggle('neg', !!entwurf.datumRoh); $('#bu-datum').closest('.field').classList.toggle('is-error', !!entwurf.datumRoh); }
  const bi = $('#bu-betrag-info'), roh = String(entwurf.betrag || ''), v = betragWert();
  bi.textContent = roh && !isFinite(v) ? 'cannot read' : (/[+*\/]|\d-\d/.test(roh) && isFinite(v) ? '= ' + tsd(v, 2) : '');
  bi.classList.toggle('neg', !!roh && !isFinite(v));
  if (entwurf.modus === 'schnell'){ kontoInfo(entwurf.soll, $('#bu-soll-info')); kontoInfo(entwurf.haben, $('#bu-haben-info')); }
  /* the posting: debit to credit, as it will be booked */
  const soll = r.D.filter(z => z.s && ix.km[z.k]), haben = r.D.filter(z => z.h && ix.km[z.k]);
  const seite = (liste, titel) => h('div', { class: 'ev-post__side' }, [h('div', { class: 'ev-post__title' }, [titel])].concat(liste.length ? liste.map(z =>
    h('div', { class: 'ev-post__line' }, [h('span', {}, [h('b', {}, [z.k]), ' ' + kontoName(z.k), z.t ? h('small', {}, [' · ' + z.t]) : null]), h('span', { class: 'n' }, [tsd(z.s || z.h, 2)])]))
    : [h('div', { class: 'ev-post__none' }, ['–'])]));
  const satz = $('#bu-satz'); satz.innerHTML = '';
  if (soll.length || haben.length){ satz.appendChild(seite(soll, 'Debit')); satz.appendChild(h('div', { class: 'ev-post__to' }, ['to'])); satz.appendChild(seite(haben, 'Credit')); }
  else satz.appendChild(h('p', { class: 'ev-post__empty' }, ['The posting appears here once accounts and an amount are entered.']));
  /* the beam weighs what the posting shows: lines with a known account only */
  const sS = E.r2(soll.reduce((a, z) => a + z.s, 0)), sH = E.r2(haben.reduce((a, z) => a + z.h, 0));
  waage({ soll: sS, haben: sH, diff: E.r2(sS - sH) });
  /* the spread: what goes where, month by month */
  if (vt.an && (!bearbeitet || respread())){
    const vj = vtStand().jahr, ein = state.einstellungen, x = r.vt;
    const ertrag = x && x.ok && x.basis && x.basis.z.some(z => (z[0] === x.praJahr || z[0] === x.pra) && z[2]);
    const jk = x && x.ok ? (ertrag ? x.praJahr : x.araJahr) : '', fk = x && x.ok ? (ertrag ? x.pra : x.ara) : '';
    $('#vt-erklaerung').textContent = x && x.ok && x.nurAufloesung
      ? 'The amount already sits on the accrual account, so only the monthly releases are booked.'
      : x && x.ok && jk !== fk
        ? 'The amount first goes to ' + jk + ' (' + kontoName(jk) + ') and is released at each month end. On 31.12.' + vj + ' the months still to come move to ' + fk + ' (' + kontoName(fk) + '), so ' + jk + ' ends the year at zero.'
        : 'The amount first goes to ' + ein.ara + ' (' + kontoName(ein.ara) + ') and is released at each month end. Months after 31.12.' + vj + ' stay there.';
    const vv = $('#vt-vorschau'); vv.innerHTML = '';
    if (x && x.ok){
      const tb = h('tbody'); x.vorschau.forEach(m => tb.appendChild(h('tr', {}, [h('td', {}, [MONATE[+m.monat.slice(5) - 1] + ' ' + m.monat.slice(0, 4)]), h('td', { class: 'd' }, [m.gebucht ? dateLong(m.datum) : '–']),
        h('td', { class: 'num' }, [tsd(m.betrag, 2)]), h('td', {}, [h('span', { class: 'chip ev-chip-sm ' + (m.gebucht ? 'is-ok' : 'is-warn') }, [m.gebucht ? 'booked now' : (x.uebertrag ? 'carried to ' : 'stays on ') + fk])])])));
      vv.appendChild(h('div', { class: 'ev-scroll ev-vt__table' }, [h('table', { class: 'table' }, [h('thead', {}, [h('tr', {}, ['Month', 'Released on', 'Amount', ''].map((t, i) => h('th', { class: i === 2 ? 'num' : '' }, [h('span', { class: 'th-sort' }, [t])])))]), tb])]));
      vv.appendChild(h('p', { class: 'note' }, [x.aufloesungen.length + ' releases will be booked.' + (x.uebertrag ? ' On 31.12.' + vj + ', ' + tsd(x.uebertrag.z[0][1], 2) + ' move from ' + jk + ' to ' + fk + ' for ' + (vj + 1) + '.' : '')
        + (x.rest && !x.uebertrag ? ' At 31.12.' + vj + ', ' + tsd(x.rest, 2) + ' remain on ' + (x.basis && x.basis.z.some(z => z[0] === x.pra && z[2]) ? x.pra : x.ara) + '.' : '') + (!x.rest ? ' Nothing remains deferred.' : '')]));
    }
  }
  /* the checks: the problems, or one calm line */
  const sym = { warn: 'alert', fehler: 'x' }, probleme = r.p, box = $('#bu-pruefungen');
  box.innerHTML = '';
  (probleme.length ? probleme : [['ok', 'Ready to book.']]).forEach(x => box.appendChild(h('div', { class: 'ev-check is-' + x[0] }, [h('span', { class: 'ev-check__i', html: icon(sym[x[0]] || 'check', 12) }), h('span', {}, [x[1]])])));
  /* the button says what will happen */
  const knopf = $('#bu-ok'), warBereit = knopf.classList.contains('is-ready');
  knopf.disabled = r.fehler; knopf.classList.toggle('is-ready', !r.fehler);
  if (!r.fehler && !warBereit && BEWEGUNG){ knopf.classList.remove('is-new'); void knopf.offsetWidth; knopf.classList.add('is-new'); }
  if (r.fehler) knopf.classList.remove('is-new');
  const nVt = r.vt && r.vt.ok ? (r.vt.basis ? 1 : 0) + r.vt.aufloesungen.length + (r.vt.uebertrag ? 1 : 0) : 0;
  $('.btn__label', knopf).textContent = bearbeitet ? (respread() ? (nVt ? 'Save and spread anew (' + nVt + ' bookings)' : 'Save as a normal booking') : 'Save changes')
    : (nVt ? 'Book spread (' + nVt + ' bookings)' : 'Book');
}

/* ---------------------------------------------------------------- the side panels */
/* recent bookings on the account in focus (the last one picked), with its balance; a click copies, Edit opens */
function renderVerlauf(){
  const k = [fokusKonto, entwurf && entwurf.soll, entwurf && entwurf.haben].find(nr => nr && ix.km[nr]);
  const titel = $('#bu-verlauf-titel'), sEl = $('#bu-verlauf-saldo'), box = $('#bu-verlauf');
  let liste;
  if (k){ titel.textContent = 'Recent on ' + k + ' ' + kontoName(k); liste = state.buchungen.filter(b => b.z.some(z => z[0] === k)); }
  else { titel.textContent = 'Recent bookings'; liste = state.buchungen.slice(); }
  $('#bu-zumKonto').hidden = !k; $('#bu-zumKonto').onclick = () => { hbKonto = k; zeige('hauptbuch'); };
  sEl.innerHTML = '';
  if (k){
    const g = ix.gm[ix.km[k].grp], ende = state.jahr + '-12-31', t = heute(), per = t.slice(0, 4) === String(state.jahr) ? t : ende;
    const jetzt = E.r2(saldoVon(k, E.saldoPer(state, per))), amEnde = E.r2(saldoVon(k, E.saldoPer(state, ende)));
    sEl.appendChild(h('div', { class: 'ev-bal-now' }, [h('span', {}, [(g && g.s === 'E' ? 'Year to date' : 'Balance'), h('small', {}, ['at ' + dateLong(per)])]),
      h('b', { class: jetzt < -0.005 ? 'neg' : '' }, [tsd(jetzt, 2)])]));
    if (per !== ende && Math.abs(amEnde - jetzt) >= .005) sEl.appendChild(h('p', { class: 'note' }, ['incl. later bookings to ' + dateLong(ende) + ': ' + tsd(amEnde, 2)]));
  }
  liste = liste.slice().sort((a, b) => a.datum === b.datum ? String(b.id).localeCompare(String(a.id)) : (a.datum < b.datum ? 1 : -1)).slice(0, 12);
  box.innerHTML = '';
  if (!liste.length){ box.appendChild(h('p', { class: 'note' }, [k ? 'No bookings on this account yet.' : 'Nothing booked yet.'])); return; }
  liste.forEach(b => {
    const bf = buchungsform(b), zk = k ? b.z.filter(z => z[0] === k) : [];
    const betr = k ? E.r2(zk.reduce((a, z) => a + (z[1] || 0) - (z[2] || 0), 0)) : bf.betrag;
    const text = (k && zk[0] && zk[0][5]) || b.text || '(no text)';
    const zeile = h('div', { class: 'ev-recent' + (b.id === frischId ? ' is-new' : ''), tabindex: '0', role: 'button', title: 'Copy into the form', 'aria-label': 'Copy booking ' + text }, [
      h('span', { class: 'd' }, [dateLong(b.datum).slice(0, 6)]), h('span', { class: 't' }, [text]), h('span', { class: 'n' }, [tsd(betr, 2)]),
      h('span', { class: 'k' }, [(bf.sollNr || 'Split') + ' → ' + (bf.habenNr || 'Split')]),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', tabindex: '-1', onclick: e => { e.stopPropagation(); ladeEntwurf(b.id); } }, ['Edit'])]);
    zeile.onclick = () => kopiereBuchung(b.id);
    zeile.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); kopiereBuchung(b.id); } };
    box.appendChild(zeile);
  });
}
/* the spreads of the year, and what earlier years still have to release into it */
function renderPlaene(){
  const box = $('#bu-plaene'), J = state.jahr, zu = istGeschlossen(J);
  const fort = zu ? { plaene: [], bookings: [] } : E.spreadsFortfuehren(state, ix, J), fortA = zu ? { anlagen: [], bookings: [] } : E.anlagenFortfuehren(state, ix, J);
  box.innerHTML = '';
  const teile = [];
  if (fort.plaene.length) teile.push(fort.plaene.length + ' spread' + (fort.plaene.length > 1 ? 's' : '') + ' (' + fort.bookings.length + ' releases, ' + tsd(fort.plaene.reduce((s, p) => s + p.betrag, 0), 2) + ')');
  if (fortA.anlagen.length) teile.push(fortA.anlagen.length + ' fixed asset' + (fortA.anlagen.length > 1 ? 's' : '') + ' (' + fortA.bookings.length + ' depreciation booking' + (fortA.bookings.length > 1 ? 's' : '') + ', ' + tsd(fortA.anlagen.reduce((s, a) => s + a.betrag, 0), 2) + ')');
  if (teile.length) box.appendChild(h('div', { class: 'ev-offer' }, [h('span', {}, ['Not booked yet in ' + J + ': ' + teile.join(' and ') + '.']),
    h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: () => fortfuehren(fort, fortA) }, ['Book them'])]));
  const imJahrIds = new Set(state.buchungen.filter(b => b.plan && b.plan.id && String(b.datum).slice(0, 4) === String(J)).map(b => b.plan.id));
  const pl = E.plaene(state, ix).filter(p => String(p.datum || '').slice(0, 4) === String(J) || imJahrIds.has(p.id)).sort((a, b) => (b.rest > .005) - (a.rest > .005));
  if (!pl.length){ if (!teile.length) box.appendChild(h('p', { class: 'note' }, ['No spreads in ' + J + '. Switch on “Spread over months” in the form to spread an amount.'])); return; }
  pl.forEach(p => box.appendChild(h('div', { class: 'ev-plan', role: 'button', tabindex: '0', title: 'Open the spread', onclick: () => { if (p.basisId) ladeEntwurf(p.basisId); },
    onkeydown: e => { if (e.key === 'Enter' && p.basisId) ladeEntwurf(p.basisId); } }, [
    h('span', { class: 't' }, [(p.text || 'Spread').replace(/ \(\d+\/\d+\)$/, ''), String(p.datum || '').slice(0, 4) !== String(J) ? h('span', { class: 'chip ev-chip-sm' }, ['from ' + String(p.datum).slice(0, 4)]) : null]),
    h('span', { class: 'n' }, [tsd(p.total, 2)]),
    h('div', { class: 'progress', style: { '--p': (p.monate ? p.gebucht / p.monate : 0).toFixed(3) } }, [h('i')]),
    h('span', { class: 'm' }, [p.gebucht + ' of ' + p.monate + ' months released' + (p.rest > .005 ? ' · ' + tsd(p.rest, 2) + ' left' : ' · complete')])])));
}
async function fortfuehren(fort, fortA){
  const J = state.jahr, n = fort.bookings.length + fortA.bookings.length;
  const tabelle = (kopf, zeilen, total) => '<div class="ev-scroll"><table class="table ev-modal-table"><thead><tr>' + kopf.map((t, i) => '<th class="' + (i > 1 ? 'num' : '') + '"><span class="th-sort">' + t + '</span></th>').join('') + '</tr></thead><tbody>'
    + zeilen.join('') + '<tr class="sum"><td><b>Total</b></td><td></td><td class="num"><b>' + tsd(total, 2) + '</b></td>' + (kopf.length > 3 ? '<td></td>' : '') + '</tr></tbody></table></div>';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let liste = '';
  if (fort.plaene.length) liste += tabelle(['Spread', 'Months in ' + J, 'Released in ' + J, 'Left after'], fort.plaene.map(p => '<tr><td>' + esc(p.text) + '</td><td>' + p.monate + ' (' + esc(p.von.slice(5)) + '–' + esc(p.bis.slice(5)) + ')</td><td class="num">' + tsd(p.betrag, 2) + '</td><td class="num">' + (p.rest > .005 ? tsd(p.rest, 2) : '–') + '</td></tr>'), fort.plaene.reduce((s, p) => s + p.betrag, 0));
  if (fortA.anlagen.length) liste += tabelle(['Fixed asset', 'Months in ' + J, 'Depreciation ' + J], fortA.anlagen.map(a => '<tr><td>' + esc(a.text) + '</td><td>' + a.monate + ' (' + esc(a.von.slice(5)) + '–' + esc(a.bis.slice(5)) + ')</td><td class="num">' + tsd(a.betrag, 2) + '</td></tr>'), fortA.anlagen.reduce((s, a) => s + a.betrag, 0));
  const ok = await frage('Book the rest of ' + J + '?', (fort.plaene.length ? 'Spread releases go against ' + esc(state.einstellungen.ara || '1300') + ' / ' + esc(state.einstellungen.pra || '2300') + ' at each month end, under the spread’s own plan. ' : '')
    + (fortA.anlagen.length ? 'Depreciation goes against the contra account of each asset, under the asset’s own plan. ' : '') + 'One undo takes it all back.' + liste,
    [{ text: 'Cancel', wert: false, art: 'leicht' }, { text: 'Book ' + n + ' booking' + (n === 1 ? '' : 's'), wert: true }]);
  if (!ok) return;
  if (aendere('Continued into ' + J, () => { fort.bookings.concat(fortA.bookings).forEach(b => state.buchungen.push(Object.assign({ id: naechsteId() }, b))); })){
    render(false); toast(n + ' bookings made for ' + J + '.', { type: 'success', action: { text: 'Undo', fn: rueckgaengig } });
  }
}
/* the last 20 bookings entered, whatever the account or year */
function renderLetzte(){
  const liste = state.buchungen.filter(b => !(b.plan && b.plan.rolle === 'aufloesung')).sort((a, b) => idNr(b) - idNr(a) || (a.datum < b.datum ? 1 : -1)).slice(0, 20);
  const box = $('#bu-letzte'); box.innerHTML = '';
  if (!liste.length){ box.appendChild(h('p', { class: 'note' }, ['Nothing booked yet.'])); return; }
  const tb = h('tbody'); liste.forEach(b => buchungsZeilen(b, { an: b.id === bearbeitet, frisch: b.id === frischId }).forEach(tr => tb.appendChild(tr)));
  box.appendChild(h('div', { class: 'ev-scroll' }, [h('table', { class: 'table ev-buchungen' }, [buchungsKopf(), tb])]));
}

/* ---------------------------------------------------------------- open, copy, book, delete */
function ladeEntwurf(id){
  const b = state.buchungen.find(x => x.id === id); if (!b) return;
  bearbeitet = id; Object.assign(vt, { an: false, start: '', monate: '12', manuell: false });
  const ur = urBuchung(b);
  entwurf = entwurfAusBuchung(ur || b); entwurf.eb = !!b.eb; entwurf.plan = b.plan || null;
  if (ur){ entwurf.neuVerteilen = true; Object.assign(vt, { an: true, start: b.plan.start || b.datum.slice(0, 7), monate: String(b.plan.monate || 12), manuell: true }); }
  if (String(b.datum).slice(0, 4) !== String(state.jahr) && E.istDatum(b.datum)){ P.jahr = state.jahr = parseInt(b.datum.slice(0, 4), 10); baueKontrollen(); }
  if (PAGE !== 'buchen') zeige('buchen'); else { renderBuchen(); window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }); }
}
function kopiereBuchung(id){
  const b = state.buchungen.find(x => x.id === id); if (!b) return;
  const datum = (entwurf && E.istDatum(entwurf.datum) && !bearbeitet) ? entwurf.datum : startDatum();
  entwurf = entwurfAusBuchung(urBuchung(b) || b); entwurf.datum = datum; delete entwurf.eb; delete entwurf.plan;
  /* a copy brings the text and the accounts (split and lines included), never the amounts: they are typed anew */
  Object.assign(entwurf, { betrag: '', fw: '', kurs: '' });
  entwurf.split.forEach(x => Object.assign(x, { b: '', fw: '', kurs: '' }));
  entwurf.z.forEach(z => Object.assign(z, { s: '', h: '', fw: '', kurs: '' }));
  bearbeitet = null; Object.assign(vt, { an: false, start: '', monate: '12', manuell: false });
  if (PAGE !== 'buchen') zeige('buchen'); else renderBuchen();
  const t = $(entwurf.modus === 'schnell' ? '#bu-betrag' : '#bu-text'); if (t){ t.focus(); if (t.select) t.select(); }
  toast('Copied without the amount. Enter it, then book.');
}
function siegel(){
  if (!BEWEGUNG || !Kit.isOn('stamp')) return;
  const s = $('#siegel'), m = $('#maske');
  s.classList.remove('los'); m.classList.remove('is-booked'); void s.getBoundingClientRect();
  s.classList.add('los'); m.classList.add('is-booked');
}
function enter(){
  if (entwurf.modus === 'schnell' && !entwurf.splitAktiv && splitAn()){ renderSplit({ i: 0, f: 'k' }); aktualisiere(); return; }
  const r = pruefe();
  if (!r.fehler){ buchen(r); return; }
  const x = r.p.find(y => y[0] === 'fehler');
  if (x && x[2]){ const el = $(x[2]); if (el){ el.focus(); if (el.select) el.select(); return; } }
  if (x) toast(x[1], { type: 'error' });
}
function buchen(r){
  if (bucht) return; bucht = true;
  let erg = null;
  try { erg = buchenIntern(r); } finally { bucht = false; }
  if (!erg) return;
  siegel();
  neuerEntwurf();
  render(false);
  toast(erg.text, { type: 'success', action: { text: 'Undo', fn: rueckgaengig } });
  if (erg.anlage){ const buchung = frischId; setTimeout(() => anlageDialog(Object.assign({ ausBuchung: true, buchung }, erg.anlage)), 450); }
  const d = $('#bu-datum'); if (d){ d.focus(); if (d.select) d.select(); }
}
async function loeschen(){
  if (!bearbeitet) return;
  const b = state.buchungen.find(x => x.id === bearbeitet); if (!b) return;
  let wahl;
  if (b.plan && (b.plan.rolle === 'abschreibung' || b.plan.rolle === 'abgang')){
    /* a booking of the fixed-asset register: only this one; the asset itself is ended or removed under Fixed assets */
    const a = (state.anlagen || []).find(x => x.id === b.plan.id), ab = b.plan.rolle === 'abgang';
    wahl = await frage(ab ? 'Delete this disposal booking?' : 'Delete this depreciation booking?',
      esc(b.text || 'No text') + ', ' + dateLong(b.datum) + ', ' + tsd(buchungsform(b).betrag, 2) + '. It belongs to ' + (a ? '“' + esc(a.text) + '”' : 'a fixed asset') + ' in the register under Fixed assets'
        + (ab ? ', which stays marked as disposed of.' : ': its month becomes open again, and Book offers to book it.') + ' Undo brings it back.',
      [{ text: 'Cancel', wert: null, art: 'leicht' }, { text: 'Delete', wert: 'eine', art: 'gefahr' }]);
  } else if (b.plan){
    const alle = state.buchungen.filter(x => x.plan && x.plan.id === b.plan.id);
    wahl = await frage('Delete a booking of a spread?', 'This booking belongs to a spread of ' + alle.length + ' bookings.',
      [{ text: 'Cancel', wert: null, art: 'leicht' }, { text: 'Delete only this one', wert: 'eine', art: 'leicht' }, { text: 'Delete the whole spread', wert: 'alle', art: 'gefahr' }]);
  } else {
    wahl = await frage('Delete this booking?', esc(b.text || 'No text') + ', ' + dateLong(b.datum) + ', ' + tsd(buchungsform(b).betrag, 2) + '. Undo brings it back.',
      [{ text: 'Cancel', wert: null, art: 'leicht' }, { text: 'Delete', wert: 'eine', art: 'gefahr' }]);
  }
  if (!wahl) return;
  const id = bearbeitet, plan = b.plan ? b.plan.id : null;
  if (!aendere(wahl === 'alle' ? 'Spread deleted' : 'Booking deleted', () => { state.buchungen = state.buchungen.filter(x => wahl === 'alle' ? !(x.plan && x.plan.id === plan) : x.id !== id); })) return;
  neuerEntwurf(); render(false);
  toast(wahl === 'alle' ? 'Spread deleted' : 'Booking deleted', { action: { text: 'Undo', fn: rueckgaengig } });
}
/* after an undo the booking being edited may be gone: then start a new one */
function buchenNachUndo(){ if (bearbeitet && !state.buchungen.some(b => b.id === bearbeitet)) neuerEntwurf(); }
/* another year: an untouched form follows it */
function jahrGewechselt(){ if (entwurfLeer()) neuerEntwurf(); }

/* ---------------------------------------------------------------- wiring (once) */
function initBuchen(){
  /* the seal: guilloché rings around a check mark (the stamp effect turns them once) */
  const rosette = (cx, cy, rho, amp, k, ph) => { let d = ''; for (let i = 0; i <= 360; i++){ const t = i / 360 * Math.PI * 2, r = rho + amp * Math.sin(k * t + ph);
    d += (i ? 'L' : 'M') + (cx + r * Math.cos(t)).toFixed(2) + ' ' + (cy + r * Math.sin(t)).toFixed(2); } return d + 'Z'; };
  let ringe = ''; for (let j = 0; j < 6; j++) ringe += '<path d="' + rosette(100, 100, 72 + j * 3.6, 3, 36, j * .5) + '"/>';
  $('#siegel').innerHTML = '<defs><linearGradient id="sf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--seal-ring-1)"/><stop offset=".5" style="stop-color:var(--seal-ring-2)"/><stop offset="1" style="stop-color:var(--seal-ring-1)"/></linearGradient></defs>'
    + '<circle cx="100" cy="100" r="96" style="fill:var(--seal-bg)"/><g class="ring" fill="none" stroke="url(#sf)" stroke-width="1">' + ringe + '</g>'
    + '<circle cx="100" cy="100" r="62" style="fill:var(--seal-face);stroke:var(--seal-ring-1)" stroke-width="1.5"/>'
    + '<path d="M84 92l11 11 22-24" fill="none" style="stroke:var(--seal-ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<text x="100" y="128" text-anchor="middle" font-size="15" font-weight="700" style="fill:var(--seal-ink);font-family:var(--font-ui)" letter-spacing="1">Booked</text>';

  $('#bu-datum').addEventListener('input', e => {
    const iso = E.datumAusEingabe(e.target.value, entwurf.datum || startDatum());
    entwurf.datumRoh = e.target.value; entwurf.datum = iso || '';
    if (vt.an && !vt.manuell && iso){ vt.start = iso.slice(0, 7); $('#vt-start').value = vt.start; }
    aktualisiere();
  });
  $('#bu-datum').addEventListener('blur', e => { if (E.istDatum(entwurf.datum)) e.target.value = dateLong(entwurf.datum); });
  $('#bu-text').addEventListener('input', e => {
    const alt = entwurf.text; entwurf.text = e.target.value; $('#bu-text-info').textContent = '';
    entwurf.split.forEach((x, i) => { if (x.t === alt){ x.t = entwurf.text; const el = $('#bu-split [data-sp="' + i + '"][data-f="t"]'); if (el) el.value = x.t; } });
    aktualisiere();
  });
  $('#bu-betrag').addEventListener('input', e => {
    const alt = betragWert(); entwurf.betrag = e.target.value;
    if (entwurf.splitAktiv && entwurf.split.length === 1 && Math.abs((E.betragAusEingabe(entwurf.split[0].b) || 0) - (alt || 0)) < .005){
      entwurf.split[0].b = isFinite(betragWert()) ? zahlFmt(betragWert()) : ''; const el = $('#bu-split [data-sp="0"][data-f="b"]'); if (el) el.value = entwurf.split[0].b; }
    aktualisiereRest(); aktualisiere();
  });
  $('#bu-betrag').addEventListener('blur', e => { const v = betragWert(); if (isFinite(v) && entwurf.betrag !== ''){ entwurf.betrag = zahlFmt(v); e.target.value = entwurf.betrag; } });
  ['#bu-datum', '#bu-betrag'].forEach(s => $(s).addEventListener('focus', e => { if (e.target.select) e.target.select(); }));
  const hauptKonto = (sel, feld) => {
    const el = $(sel);
    kontoWahl(el, k => {
      entwurf[feld] = k ? k.nr : ''; fokusKonto = entwurf[feld] || fokusKonto;
      el.value = k ? k.nr + ' ' + k.name : ''; el.closest('.field').classList.remove('is-error');
      if (k && k.wkz && !entwurf.kurs) entwurf.kurs = String(state.kurse[k.wkz] || '');
      if (splitSeite() === null) entwurf.splitAktiv = false;
      renderFW(); renderSplit(); aktualisiere(); renderVerlauf();
    }, () => entwurf[feld]);
    el.addEventListener('input', () => { const t = el.value.trim().split(/\s+/)[0]; entwurf[feld] = /^\d[\d.]*$/.test(t) ? t : el.value.trim(); aktualisiere(); });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.__gewaehlt && !e.defaultPrevented){ e.preventDefault(); enter(); return; }
      /* Tab out of the credit field with only one side filled: the split opens right here and takes the focus. At once,
         not after the browser's own Tab, which would first move to the next field far down the page and scroll there */
      if (e.key === 'Tab' && !e.shiftKey && feld === 'haben' && !entwurf.splitAktiv && splitSeite() && betragWert() > 0){
        e.preventDefault(); if (splitAn()){ renderSplit({ i: 0, f: 'k' }); aktualisiere(); } }
    });
    el.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement === el) return;
      if (feld === 'haben' && document.activeElement !== $('#bu-soll') && !entwurf.splitAktiv && splitSeite() && betragWert() > 0){
        const vorher = document.activeElement; if (splitAn()){ renderSplit(); aktualisiere(); } if (vorher && vorher !== document.body && !vorher.closest('#bu-split')) vorher.focus(); }
    }, 140));
  };
  hauptKonto('#bu-soll', 'soll');
  hauptKonto('#bu-haben', 'haben');
  textVorschlag($('#bu-text'));
  ['#bu-datum', '#bu-text', '#bu-betrag'].forEach(s => $(s).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.defaultPrevented){ e.preventDefault(); enter(); } }));
  const setzeDatum = iso => { entwurf.datum = iso; entwurf.datumRoh = ''; $('#bu-datum').value = dateLong(iso); aktualisiere(); };
  $('#bu-heute').onclick = () => setzeDatum(heute());
  $('#bu-monatsende').onclick = () => setzeDatum(E.monatsende((E.istDatum(entwurf.datum) ? entwurf.datum : heute()).slice(0, 7)));
  $('#bu-ok').onclick = enter;
  $('#bu-kopie').onclick = () => { if (bearbeitet) kopiereBuchung(bearbeitet); };
  $('#bu-reset').onclick = () => { neuerEntwurf(); renderBuchen(); $('#bu-datum').focus(); };
  $('#bu-del').onclick = loeschen;
  $$('#bu-modus button').forEach(b => b.onclick = async () => {
    if ((b.dataset.modus === 'schnell') === (entwurf.modus === 'schnell')) return;
    if (entwurf.modus === 'schnell') zuZeilen();
    else {
      if (schnellVerliert() && !await frage('Back to quick entry?', 'These lines do not fit one debit and one credit account, so quick entry cannot show them. Date and text stay; the lines are cleared.',
        [{ text: 'Keep the lines', wert: false, art: 'leicht' }, { text: 'Clear the lines', wert: true, art: 'gefahr' }])) return;
      zuSchnell();
    }
    $('#bu-modus').dispatchEvent(new CustomEvent('dl:seg', { bubbles: true }));
    renderBuchen();
  });
  $('#vt-an').onchange = e => { vt.an = e.target.checked; $('#vt-panel').hidden = !vt.an; if (vt.an && !vt.start){ vt.start = (entwurf.datum || '').slice(0, 7); $('#vt-start').value = vt.start; } aktualisiere(); };
  $('#vt-start').addEventListener('input', e => { vt.start = e.target.value; vt.manuell = true; aktualisiere(); });
  $('#vt-monate').addEventListener('input', e => { vt.monate = e.target.value; aktualisiere(); });
}
