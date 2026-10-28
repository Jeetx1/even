/* =====================================================================
   ENGINE of the Financial Statements file
   Taken from that file: statements, cash flow, investments with
   forecast and the Excel workbook. Its own screens, charts and PDF
   were dropped on 28.10.2026 (EVEN draws its own). It reads its data
   through S: the same shape as there, but the reports are built from
   the bookings. Hooks into the app: S.toast, S.touch, S.go.
   ===================================================================== */
function FSKern(S){
"use strict";
const NF2 = {format: v => new Intl.NumberFormat("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2}).format(v).replace(/[\u2019\u0027\u00A0\u202F]/g, "'")};
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const nil = (v) => !isFinite(v) || Math.abs(v) < 0.005;

function fmt(v, force) { return nil(v) ? (force ? "0.00" : "–") : NF2.format(r2(v)).replace(/^-/, "\u2212"); }
function fmtPct(cur, cmp) {
  if (!isFinite(cur) || !isFinite(cmp) || Math.abs(cmp) < 0.005) return "";
  const p = ((cur - cmp) / Math.abs(cmp)) * 100;
  if (!isFinite(p)) return "";
  const s = Math.abs(p) >= 1000 ? ">999" : Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0);
  return (p >= 0 ? "+" : "−") + s + "%";
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const CUR = () => S.currency || "CHF";

/* ======================================================================
   Statement structures — built from the Structure page of the file
   (ENGINE.abschlussStruktur) and handed over in S.struktur. Nothing is
   hard-coded here any more; a group added on the Structure page shows
   up on every statement page, in the exports and in the cash flow.
   k: sec = section heading · g = group (drillable) · s = subtotal
      r = result line · t = grand total · sp = spacer
   ==================================================================== */
const STRUKTUR = S.struktur || {BS:[], IS:[], FONDS:{k:"s", id:"FONDS", l:"Cash and cash equivalents", of:[]}};
const BS = STRUKTUR.BS, IS = STRUKTUR.IS;

const GROUPS = {};
BS.concat(IS).forEach((n) => { if (n.id) GROUPS[n.id] = n; });
GROUPS.FONDS = STRUKTUR.FONDS;                 /* the cash groups, for the overview and the reports */
const GROUP_LIST = BS.concat(IS).filter((n) => n.k === "g");

/* ======================================================================
   Data access
   ==================================================================== */
const periods = () => Object.keys(S.reports).sort();
const rep = (p) => S.reports[p] || null;
const accVal = (p, a) => { const R = rep(p); return R && R.accounts[a] ? R.accounts[a] : 0; };
const nameOf = (a) => S.names[a] || "Account " + a;

function inRanges(a, ranges) {
  const n = +a;
  for (let i = 0; i < ranges.length; i++) if (n >= ranges[i][0] && n < ranges[i][1]) return true;
  return false;
}

/** account number -> group id, honouring manual overrides */
function groupOf(a) {
  if (S.overrides[a]) return S.overrides[a];
  for (const g of GROUP_LIST) if (g.r && inRanges(a, g.r)) return g.id;
  return null;
}

/** every account number seen across all stored reports, ascending */
function allAccounts() {
  const set = new Set();
  for (const p of periods()) for (const a in rep(p).accounts) set.add(a);
  const arr = Array.from(set);
  arr.sort((x, y) => +x - +y);
  return arr;
}

let ACC_BY_GROUP = null;
function accountsIn(gid) {
  if (!ACC_BY_GROUP) {
    ACC_BY_GROUP = {};
    for (const a of allAccounts()) {
      const g = groupOf(a);
      if (!g) continue;
      (ACC_BY_GROUP[g] = ACC_BY_GROUP[g] || []).push(a);
    }
  }
  return ACC_BY_GROUP[gid] || [];
}
function invalidate() { ACC_BY_GROUP = null; }

function profitOf(p) {
  const R = rep(p); if (!R) return 0;
  let s = 0;
  for (const a in R.accounts) if (+a >= 3000) s += R.accounts[a];
  return r2(s);
}

/** value of any structure node for a period */
function nodeVal(node, p) {
  if (!node) return 0;
  if (node.calc === "profit") return profitOf(p);
  if (node.of) return r2(node.of.reduce((s, id) => s + nodeVal(GROUPS[id], p), 0));
  if (node.r) return r2(accountsIn(node.id).reduce((s, a) => s + accVal(p, a), 0));
  return 0;
}

/* months covered by a YTD report (used for the run-rate figure) */
function monthsOf(p) {
  const R = rep(p); if (!R) return 12;
  if (R.basis === "FY") return 12;
  const m = /^\d{4}-(\d{2})$/.exec(p);
  return m ? +m[1] : 12;
}
function periodLabel(p) { const R = rep(p); return R ? (R.label || p) : "—"; }

/* ======================================================================
   Shared rendering helpers
   ==================================================================== */
function deltaCell(cur, cmp, invert) {
  const d = r2(cur - cmp);
  if (nil(d)) return '<td class="num dim chg">–</td><td class="num pct chg"></td>';
  const good = invert ? d < 0 : d > 0;
  const cls = good ? "pos" : "neg";
  return '<td class="num chg ' + cls + '">' + (d > 0 ? "+" : "−") + NF2.format(Math.abs(d)) +
    '</td><td class="num pct chg ' + cls + '">' + fmtPct(cur, cmp) + "</td>";
}
function valCell(v, cls) {
  const c = ["num"]; if (cls) c.push(cls);
  if (v < -0.005 && !cls) c.push("n-neg");
  return '<td class="' + c.join(" ") + '">' + fmt(v) + "</td>";
}
function resCell(v) {
  return '<td class="num ' + (v >= 0 ? "pos" : "neg") + '">' + fmt(v, true) + "</td>";
}

/**
 * Render a statement structure into a table.
 * opts: { showZeros, invertLeaf } — leaf sign colouring follows the group.
 */
function statementHTML(struct, p, c, showZeros, flat, summary) {
  const head =
    "<thead><tr>" +
    '<th class="acct">Acct</th><th>Position</th>' +
    '<th class="num">' + esc(periodLabel(p)) + "</th>" +
    '<th class="num">' + esc(periodLabel(c)) + "</th>" +
    '<th class="num chg">Change</th><th class="num chg">%</th>' +
    "</tr></thead>";

  const out = [];
  for (const n of struct) {
    if (n.k === "sp") { out.push(flat ? "" : '<tr class="r spacer"><td colspan="6"></td></tr>'); continue; }
    if (n.k === "sec") { out.push('<tr class="r sec"><td colspan="6">' + esc(n.l) + "</td></tr>"); continue; }

    const vc = nodeVal(n, p), vp = nodeVal(n, c);
    const accs = n.k === "g" && n.r ? accountsIn(n.id) : [];
    const shown = accs.filter((a) => showZeros || !nil(accVal(p, a)) || !nil(accVal(c, a)));

    if (n.k === "g") {
      if (!showZeros && nil(vc) && nil(vp) && !shown.length) continue;
      const kids = shown.length > 0 && !summary;
      out.push(
        '<tr class="r grp' + (kids && !flat ? "" : " flat") + '"' + (kids && !flat ? ' data-g="' + n.id + '"' : "") +
        '><td class="acct"></td>' +
        '<td class="lbl">' + (flat ? "" : '<span class="chev' + (kids ? "" : " none") + '">▸</span>') + esc(n.l) + "</td>" +
        valCell(vc) + valCell(vp) + deltaCell(vc, vp, n.inv) + "</tr>"
      );
      let i = 0;
      for (const a of (summary ? [] : shown)) {
        const av = accVal(p, a), bv = accVal(c, a);
        out.push(
          '<tr class="r leaf ' + (flat ? "" : "hide g-" + n.id) + '"' +
          (flat ? "" : ' style="animation-delay:' + Math.min(i++ * 18, 260) + 'ms"') + ">" +
          '<td class="acct">' + esc(a) + "</td>" +
          '<td class="lbl">' + esc(nameOf(a)) + "</td>" +
          valCell(av) + valCell(bv) + deltaCell(av, bv, n.inv) + "</tr>"
        );
      }
      continue;
    }

    const cls = n.k === "t" ? "tot" : n.k === "r" ? "res" : "sub";
    const cells = n.k === "r" || (n.k === "t" && n.sign)
      ? resCell(vc) + resCell(vp)
      : valCell(vc) + valCell(vp);
    out.push(
      '<tr class="r ' + cls + '"><td class="acct"></td><td class="lbl">' + esc(n.l) + "</td>" +
      cells + deltaCell(vc, vp, n.inv) + "</tr>"
    );
  }
  return head + "<tbody>" + out.join("") + "</tbody>";
}





/** market value of the investments ticked under Data & mapping */
function investedAt(p) {
  return r2(investments().filter((i) => i.include)
    .reduce((s2, i) => s2 + sumAt(p, i.pay) + sumAt(p, i.adj), 0));
}
const CF_CLASSES = {
  cash:    { l: "Cash and equivalents", def: [[1000, 1060]] },
  invest:  { l: "Investing", def: [[1060, 1080], [1400, 2000]] },
  opAsset: { l: "Operating — assets", def: [[1080, 1400]] },
  opLiab:  { l: "Operating — liabilities", def: [[2000, 2100], [2110, 2140], [2200, 2400], [2600, 2800]] },
  finLiab: { l: "Financing — debt", def: [[2100, 2110], [2140, 2200], [2400, 2600]] },
  equity:  { l: "Equity", def: [[2800, 3000]] },
};
const CF_ORDER = ["cash", "opAsset", "invest", "opLiab", "finLiab", "equity"];

/** cash flow class of an account: the override from Statement settings, else the setting of the
    account or its group on the Structure page (S.cfBase), else the number range for an account
    that is not in the chart at all (an imported closing) */
function cfClassOf(a) {
  if (S.cfOverrides[a]) return S.cfOverrides[a];
  if (S.cfBase && S.cfBase[a]) return S.cfBase[a];
  for (const k of CF_ORDER) if (inRanges(a, CF_CLASSES[k].def)) return k;
  return null;
}

const RE_ADJ = /auf-?\s*und\s*abwertung|aufwertungen|abwertungen|wertberichtigung|nicht realisiert|abschreibung|unreali[sz]ed|value adjustment/i;   // EVEN 26.10.2026: the template's English names too
const RE_PENS = /pensionskasse|vorsorge/i;
const RE_PENS_PL = /pensionskasse|pension fund|vorsorge/i;          // pension interest in 6900-6999
const RE_WB = /\bwb\b|wertberichtigung|kumulierte abschreibung/i;  // accumulated depreciation
/** a contra account under an asset: named WB / Wertberichtigung anywhere in the name,
    or an "Abschreibung…" account that never carries a debit balance */
function isContraAcct(a) {
  const n = nameOf(a);
  if (RE_WB.test(n)) return true;
  if (!/abschreib/i.test(n)) return false;
  const vals = Object.keys(S.reports || {}).map((k) => +((S.reports[k].accounts || {})[a] || 0));
  return vals.some((v) => v < 0) && vals.every((v) => v <= 0);
}
const isPensionAcct = (a) => +a >= 1490 && +a < 1500 && RE_PENS.test(nameOf(a));

/* policy switches — stored in the file, default on */
const cfGross = () => S.cfGross !== false;   // pension fund shown as invested
const cfChain = () => S.cfChain !== false;   // multi-year views chained through year-ends

/** balance sheet accounts whose movement never touches cash.
    In the gross view the pension fund is treated as a normal investment,
    so the automatic pension rule only applies in the strict view.
    Manual ticks under Data & mapping always win. */
function isNonCashAcct(a) {
  /* the pension fund follows the switch on the cash flow page, nothing else:
     on = a normal investment (cash), off = backed out as non-cash */
  if (isPensionAcct(a)) return !cfGross();
  S.ncOverrides = S.ncOverrides || {};
  if (a in S.ncOverrides) return !!S.ncOverrides[a];
  const n = nameOf(a);
  if (RE_ADJ.test(n)) return true;
  return false;
}

/** investing accounts that are shown together with a parent account:
    WB / accumulated-depreciation accounts roll into their asset
    (1509 -> 1500, 1521 -> 1520), and in the gross view the pension
    sub-accounts roll into the fund (1491.1 -> 1491). */
function cfFoldParent(invAcc) {
  const set = new Set(invAcc);
  const par = {};
  for (const a of invAcc) {
    let p = null;
    if (isContraAcct(a)) {
      const blk = Math.floor(+a / 10);
      const c = invAcc.filter((b) => b !== a && +b < +a && Math.floor(+b / 10) === blk && !isContraAcct(b));
      if (c.length) p = c.sort((x, y) => +y - +x)[0];
    } else if (cfGross() && isPensionAcct(a) && String(a).indexOf(".") > 0) {
      const base = String(a).split(".")[0];
      if (set.has(base)) p = base;
    }
    if (p) par[a] = p;
  }
  return par;
}

/** depreciation account -> asset account, by a shared word in the names
    ("Abschreibung Auto" -> "1520 Auto ...", "Abschreibungen Informatik" -> "1500 Informatik ...") */
const DEP_STOP = /^(abschreibung(en)?|abschr|wb|wertberichtigung(en)?|auf|und|inkl|etc|bis|über|ueber|jahre?|analog|restwert|aktivierung|chf|der|die|das|des|von|mit|ohne|planmässige?|ausserplanmässige?|netto|brutto)$/;
function nameTokens(a) {
  return String(nameOf(a) || "").toLowerCase().split(/[^a-zäöüéèàç]+/)
    .filter((t) => t.length >= 3 && !DEP_STOP.test(t));
}
function depTarget(d, heads, kids) {
  const tk = nameTokens(d);
  if (!tk.length) return null;
  const hit = (t, u) => t === u || (t.length >= 4 && u.startsWith(t)) || (u.length >= 4 && t.startsWith(u));
  for (const a of heads) {
    const at = [a].concat(kids[a] || []).reduce((s, x) => s.concat(nameTokens(x)), []);
    if (tk.some((t) => at.some((u) => hit(t, u)))) return a;
  }
  return null;
}

/** non-cash transactions (e.g. a car taken over on lease) that fall between
    the two reports: +1 forward, -1 when the comparison runs backwards */
function ncTxIn(p, c) {
  const a = rep(c), b = rep(p);
  if (!a || !b) return [];
  const lo = String(a.asOf), hi = String(b.asOf);
  return (S.ncTx || []).map((t) => {
    const d = String(t.date || "");
    const sg = lo < d && d <= hi ? 1 : hi < d && d <= lo ? -1 : 0;
    return sg ? { t, amt: r2(sg * (+t.amount || 0)) } : null;
  }).filter((o) => o && !nil(o.amt));
}
/** lease / loan accounts of one transaction shown as a single financing line */
function ncTxLiabFold() {
  const m = {};
  (S.ncTx || []).forEach((t) => (t.liab || []).forEach((l, i) => { if (i) m[l] = t.liab[0]; }));
  return m;
}

/** account label in the cash flow; a folded lease shows as one repayment line */
function cfLeafName(a) {
  const t = (S.ncTx || []).find((x) => (x.liab || []).length > 1 && String(x.liab[0]) === String(a));
  return t ? (t.label || nameOf(a)) + " (all lease accounts)" : nameOf(a);
}

/** true when both reports sit inside the same financial year */
function sameFY(p, c) {
  const a = rep(p), b = rep(c);
  if (!a || !b) return false;
  return String(a.asOf).slice(0, 4) === String(b.asOf).slice(0, 4);
}

/** movement of a P&L account between the two reports */
function plMove(a, p, c) {
  return sameFY(p, c) ? r2(accVal(p, a) - accVal(c, a)) : accVal(p, a);
}
function bsMove(a, p, c) { return r2(accVal(p, a) - accVal(c, a)); }

function plAccounts(lo, hi, test) {
  return allAccounts().filter((a) => {
    const n = +a;
    if (!(n >= lo && n < hi)) return false;
    return test ? test(a) : true;
  });
}
const isUnrealised = (a) =>
  /nicht realisiert/i.test(nameOf(a)) || [6945, 6946, 6955, 6956].indexOf(+a) >= 0;

function buildCFLeg(p, c) {
  const gross = cfGross();
  const bsAcc = allAccounts().filter((a) => +a < 3000);
  const byClass = { cash: [], invest: [], opAsset: [], opLiab: [], finLiab: [], equity: [] };
  for (const a of bsAcc) { const k = cfClassOf(a); if (k && byClass[k]) byClass[k].push(a); }

  const mv = (a) => bsMove(a, p, c);
  const sumMv = (arr) => r2(arr.reduce((s, a) => s + mv(a), 0));

  /* --- non-cash add-backs, taken from the income statement ------------ */
  const depAcc = plAccounts(6800, 6900);
  const unrAcc = plAccounts(6900, 7000, isUnrealised);
  const resAcc = plAccounts(3500, 4000)
    .concat(plAccounts(6900, 7000, (a) => RE_PENS_PL.test(nameOf(a)) && !isUnrealised(a)));
  const depreciation = r2(-depAcc.reduce((s, a) => s + plMove(a, p, c), 0));   // expense -> add back
  const unrealised   = r2(-unrAcc.reduce((s, a) => s + plMove(a, p, c), 0));   // gain -> deduct
  /* strict view: in-kind income (3500–3999) is deducted as non-cash.
     gross view: it stays in operating and the asset build-up shows in investing. */
  const restricted   = gross ? 0 : r2(-resAcc.reduce((s, a) => s + plMove(a, p, c), 0));
  const NC = r2(depreciation + unrealised + restricted);

  /* --- earnings between the two dates --------------------------------- */
  const eqTot = (x) => r2(nodeVal(GROUPS.EQ, x));
  /* capital contributions (Q2) are a flow account that rolls into Q1 at every
     year end, so across a year end the movement is the sum of each year's
     balance, not the difference of two balances */
  const eqFlow = (node, hi, lo) => {
    const a = rep(hi), b = rep(lo);
    if (!a || !b) return 0;
    if (String(b.asOf) > String(a.asOf)) return r2(-eqFlow(node, lo, hi));
    if (sameFY(hi, lo)) return r2(nodeVal(node, hi) - nodeVal(node, lo));
    const yl = +String(b.asOf).slice(0, 4), yh = +String(a.asOf).slice(0, 4);
    let s = nodeVal(node, hi);
    if (rep(yl + "-12")) s += nodeVal(node, yl + "-12") - nodeVal(node, lo);
    for (let y = yl + 1; y < yh; y++) if (rep(y + "-12")) s += nodeVal(node, y + "-12");
    return r2(s);
  };
  const capital = eqFlow(GROUPS.Q2, p, c);
  const earnings = r2(eqTot(p) - eqTot(c) - capital);

  /* --- working capital ------------------------------------------------ */
  const dOpAsset = sumMv(byClass.opAsset);
  const dOpLiab = sumMv(byClass.opLiab);
  const operating = r2(earnings + NC - dOpAsset + dOpLiab);

  /* --- investing ------------------------------------------------------ */
  const dInvest = sumMv(byClass.invest);
  const investing = r2(-(dInvest + NC));   /* non-cash transactions are added further down */
  const fold = cfFoldParent(byClass.invest);
  const kids = {};
  Object.keys(fold).forEach((k) => (kids[fold[k]] = kids[fold[k]] || []).push(k));
  const heads = byClass.invest.filter((a) => !fold[a]);
  /* depreciation goes back onto the asset it belongs to, so each asset line
     shows its real cash: purchases less disposal proceeds */
  const depOn = {};
  const depMatched = [];
  for (const d of depAcc) {
    const t = depTarget(d, heads, kids);
    if (!t) continue;
    depOn[t] = r2((depOn[t] || 0) - plMove(d, p, c));
    depMatched.push(d);
  }
  /* non-cash acquisitions: the asset and its financing never touched cash */
  const txs = ncTxIn(p, c);
  const txAsset = {}, txLiab = {};
  let ncTx = 0;
  for (const o of txs) {
    ncTx = r2(ncTx + o.amt);
    const as = o.t.asset ? (fold[o.t.asset] || String(o.t.asset)) : null;
    if (as) txAsset[as] = r2((txAsset[as] || 0) + o.amt);
    const l = (o.t.liab || [])[0];
    if (l) txLiab[l] = r2((txLiab[l] || 0) + o.amt);
  }
  const perAcct = heads
    .map((a) => {
      const nc = isNonCashAcct(a) ? mv(a) : 0;
      const kidMv = (kids[a] || []).reduce((s, k) => s + mv(k), 0);
      return { a, cash: r2(-(mv(a) - nc + kidMv + (depOn[a] || 0)) + (txAsset[a] || 0)) };
    })
    .filter((o) => !nil(o.cash));
  const attributed = r2(perAcct.reduce((s, o) => s + o.cash, 0));
  const residual = r2(investing + ncTx - attributed);

  /* --- financing ------------------------------------------------------ */
  const dFin = r2(sumMv(byClass.finLiab) - ncTx);
  const financing = r2(dFin + capital);
  const investingNet = r2(investing + ncTx);

  const net = r2(operating + investingNet + financing);
  /* a liability in the fund (credit card) carries its balance with the sign of
     a liability in the reports, so it counts against cash */
  const fondsWert = (x, a) => (+a >= 2000 ? -1 : 1) * accVal(x, a);
  const cashOpen = r2(byClass.cash.reduce((s, a) => s + fondsWert(c, a), 0));
  const cashClose = r2(byClass.cash.reduce((s, a) => s + fondsWert(p, a), 0));

  const drillPL = (arr, sign) => arr
    .map((a) => ({ a, v: r2(sign * plMove(a, p, c)) }))
    .filter((o) => !nil(o.v));
  const drillBS = (arr, sign) => arr
    .map((a) => ({ a, v: r2(sign * mv(a)) }))
    .filter((o) => !nil(o.v));

  /* --- what the untraced residual is made of ---------------------------
     The residual is the part of the non-cash add-backs that never met a
     matching asset account. Reversing every add-back taken out of
     investing and adding back every asset account already ticked as
     non-cash leaves exactly cf.residual, so a line that pairs off nets to
     zero and only the unmatched ones remain visible.                      */
  const depLeft = depAcc.filter((d) => depMatched.indexOf(d) < 0);
  const residDrill = drillPL(gross ? depLeft.concat(unrAcc) : depLeft.concat(unrAcc).concat(resAcc), 1)
    .concat(drillBS(heads.filter(isNonCashAcct), -1));

  return {
    gross,
    depreciation, unrealised, restricted, NC, earnings, capital,
    dOpAsset, dOpLiab, dFin, operating, investing: investingNet, financing, net,
    cashOpen, cashClose, residual, ncTx, txList: txs.map((o) => ({ label: o.t.label || "Non-cash transaction", amt: o.amt })),
    check: r2(cashClose - cashOpen - net),
    drills: {
      dep: drillPL(depAcc, -1),
      unr: drillPL(unrAcc, -1),
      res: gross ? [] : drillPL(resAcc, -1),
      opA: drillBS(byClass.opAsset, -1),
      opL: drillBS(byClass.opLiab, 1),
      fin: (() => {
        const lf = ncTxLiabFold(), m = {};
        byClass.finLiab.forEach((a) => { const k = lf[a] || a; m[k] = r2((m[k] || 0) + mv(a)); });
        Object.keys(txLiab).forEach((k) => { m[k] = r2((m[k] || 0) - txLiab[k]); });
        return Object.keys(m).sort((x, y) => +x - +y).map((a) => ({ a, v: m[a] })).filter((o) => !nil(o.v));
      })(),
      cap: drillBS(byClass.equity.filter((a) => +a >= 2820), 1),
      invOut: perAcct.filter((o) => o.cash < 0).map((o) => ({ a: o.a, v: o.cash })),
      invIn: perAcct.filter((o) => o.cash > 0).map((o) => ({ a: o.a, v: o.cash })),
      resid: residDrill,
    },
  };
}

/* ----------------------------------------------------------------------
   Chaining — when the two reports straddle a year-end, build the statement
   year by year through the stored year-end reports and add the sections.
   Every add-back then covers exactly its own financial year.
   -------------------------------------------------------------------- */
function chainPoints(p, c) {
  if (!cfChain()) return null;
  const R = rep(p), C = rep(c);
  if (!R || !C) return null;
  if (String(C.asOf) >= String(R.asOf)) return null;      /* reversed or equal: direct */
  const yc = +String(C.asOf).slice(0, 4), yp = +String(R.asOf).slice(0, 4);
  if (yp <= yc) return null;                              /* same year: direct is exact */
  const pts = [c];
  for (let y = yc; y < yp; y++) {
    const k = y + "-12";
    if (k === c || k === p) continue;
    if (k < c || k > p) continue;
    if (!S.reports[k]) return null;                       /* missing year-end: cannot chain */
    pts.push(k);
  }
  pts.push(p);
  return pts.length > 2 ? pts : null;
}

function buildCF(p, c) {
  const pts = chainPoints(p, c);
  if (!pts) { const cf = buildCFLeg(p, c); cf.legs = null; return cf; }
  const legs = [];
  for (let i = 1; i < pts.length; i++) legs.push(buildCFLeg(pts[i], pts[i - 1]));

  const cf = { gross: legs[0].gross, legs: pts };
  ["depreciation", "unrealised", "restricted", "NC", "earnings", "capital",
   "dOpAsset", "dOpLiab", "dFin", "operating", "investing", "financing", "net", "residual", "ncTx"]
    .forEach((k) => { cf[k] = r2(legs.reduce((s2, l) => s2 + l[k], 0)); });
  cf.txList = legs.reduce((s2, l) => s2.concat(l.txList || []), []);
  cf.cashOpen = legs[0].cashOpen;
  cf.cashClose = legs[legs.length - 1].cashClose;
  cf.check = r2(cf.cashClose - cf.cashOpen - cf.net);

  const merge = (name) => {
    const m = {};
    legs.forEach((l) => (l.drills[name] || []).forEach((o) => { m[o.a] = r2((m[o.a] || 0) + o.v); }));
    return Object.keys(m).sort((x, y) => +x - +y).map((a) => ({ a, v: m[a] })).filter((o) => !nil(o.v));
  };
  cf.drills = {};
  ["dep", "unr", "res", "opA", "opL", "fin", "cap", "resid"].forEach((n) => { cf.drills[n] = merge(n); });
  const invM = {};
  legs.forEach((l) => l.drills.invOut.concat(l.drills.invIn).forEach((o) => { invM[o.a] = r2((invM[o.a] || 0) + o.v); }));
  const invAll = Object.keys(invM).sort((x, y) => +x - +y).map((a) => ({ a, v: invM[a] })).filter((o) => !nil(o.v));
  cf.drills.invOut = invAll.filter((o) => o.v < 0);
  cf.drills.invIn = invAll.filter((o) => o.v > 0);
  return cf;
}

/** investment candidates: the financial-asset accounts of the investing class (S.invKandidaten from the file), else the classic ranges */
const INV_RANGES = [[1060, 1080], [1400, 1500]];
const invKandidaten = () => S.invKandidaten ? allAccounts().filter((a) => S.invKandidaten.indexOf(String(a)) >= 0) : allAccounts().filter((a) => inRanges(a, INV_RANGES));

function cleanLabel(n) {
  return String(n)
    .replace(/\s*\((Einzahlungen|inkl\.|Abschreibung|nicht realisiert|net deposits|deposits)[^)]*\)\s*$/i, "")
    .replace(/\s*,?\s*(Auf-?\s*und\s*Abwertung(en)?|Aufwertungen|Abwertungen|unreali[sz]ed gains)\b.*$/i, "")
    .trim();
}
const isAdjAcct = (a) => RE_ADJ.test(nameOf(a));
const isDeposit = (a) => /kaution|mietzins|rent(al)? deposit|security deposit/i.test(nameOf(a));   // not "net deposits" (EVEN 26.10.2026)
function hasBalance(a) {
  const ps = periods();
  return ps.length ? !nil(accVal(ps[ps.length - 1], a)) : false;
}

/** starting return assumption: pension funds are slow, crypto is not modelled */
function defaultReturn(nm) {
  return /pensionskasse/i.test(nm) ? 2 : /krypto|crypto|bitcoin/i.test(nm) ? 0 : 6;
}
/** back to the figures derived from the reports themselves */
function resetForecast() {
  if (!confirm("Put every monthly pay-in and return assumption back to the values derived from your reports, and the horizon back to 30 years?")) return;
  investments().forEach((i) => {
    i.monthly = observedMonthly(i);
    i.ret = defaultReturn(i.pay.map(nameOf).join(" ") + " " + i.label);
  });
  S.forecast.years = 30;
  S.touch(true);
  S.toast("Forecast back to its starting values", "good");
}
function detectInvestments() {
  const accts = invKandidaten();
  const list = [];
  let cur = null;
  for (const a of accts) {
    if (isAdjAcct(a) && cur) { cur.adj.push(a); continue; }
    const nm = nameOf(a);
    cur = {
      id: "i" + a,
      label: cleanLabel(nm) || nm,
      pay: [a],
      adj: [],
      include: !isDeposit(a) && hasBalance(a),
      monthly: null,
      ret: defaultReturn(nm),
    };
    list.push(cur);
  }
  return list;
}

function investments() {
  if (!S.investments || !S.investments.length) {
    S.investments = detectInvestments();
    S.investments.forEach((i) => { if (i.monthly === null) i.monthly = observedMonthly(i); });
  }
  return S.investments;
}

/** average monthly pay-in over the two most recent reports */
function observedMonthly(inv) {
  const ps = periods().filter((p) => p <= S.activePeriod);
  if (ps.length < 2) return 0;
  const b = ps[ps.length - 1], a = ps[ps.length - 2];
  const m = monthsBetween(rep(a).asOf, rep(b).asOf);
  if (!m) return 0;
  const d = inv.pay.reduce((s, x) => s + accVal(b, x) - accVal(a, x), 0);
  return Math.max(0, r2(d / m));
}
/* dates are calendar days: read and written in UTC (local time written back with toISOString can land on the day before) */
function monthsBetween(a, b) {
  const A = new Date(a + "T00:00:00Z"), B = new Date(b + "T00:00:00Z");
  return Math.max(0, Math.round((B - A) / (365.25 / 12 * 86400000)));
}
function addMonths(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
const sumAt = (p, accs) => r2(accs.reduce((s, a) => s + accVal(p, a), 0));
function buildSeries(set, years) {
  const ps = periods().filter((p) => p <= S.activePeriod);
  const hist = ps.map((p) => ({
    t: rep(p).asOf,
    label: periodLabel(p),
    pay: r2(set.reduce((s, i) => s + sumAt(p, i.pay), 0)),
    val: r2(set.reduce((s, i) => s + sumAt(p, i.pay) + sumAt(p, i.adj), 0)),
    fc: false,
  }));
  /* drop leading periods where nothing was invested yet */
  while (hist.length > 1 && nil(hist[0].val) && nil(hist[1].val)) hist.shift();

  const pts = hist.slice();
  const months = Math.round(years * 12);
  if (months > 0 && hist.length) {
    const last = hist[hist.length - 1];
    const state = set.map((i) => {
      const pv = sumAt(S.activePeriod, i.pay);
      return {
        v: pv + sumAt(S.activePeriod, i.adj),
        p: pv,
        c: Math.max(0, +i.monthly || 0),
        r: Math.pow(1 + (+i.ret || 0) / 100, 1 / 12) - 1,
      };
    });
    const step = months > 120 ? 3 : 1;
    for (let m = 1; m <= months; m++) {
      state.forEach((s) => { s.v = s.v * (1 + s.r) + s.c; s.p += s.c; });
      if (m % step === 0 || m === months) {
        pts.push({
          t: addMonths(last.t, m),
          label: "in " + (m / 12 >= 1 ? (m / 12).toFixed(m % 12 ? 1 : 0) + "y" : m + "m"),
          pay: r2(state.reduce((s, x) => s + x.p, 0)),
          val: r2(state.reduce((s, x) => s + x.v, 0)),
          fc: true,
        });
      }
    }
  }
  return pts;
}








function yearSeries() {
  const byYear = {};
  for (const p of periods()) {
    const y = p.slice(0, 4);
    if (!byYear[y] || p > byYear[y]) byYear[y] = p;
  }
  return Object.keys(byYear).sort().map((y) => {
    const p = byYear[y], inc = nodeVal(GROUPS.TI, p), res = nodeVal(GROUPS.NP, p);
    return {
      y, p, income: inc, expense: r2(inc - res), result: res,
      part: rep(p).basis !== "FY", months: monthsOf(p), label: periodLabel(p),
    };
  });
}

/** net worth at every stored report date */
function worthSeries() {
  return periods().map((p) => ({
    t: rep(p).asOf, p, label: periodLabel(p),
    worth: nodeVal(GROUPS.EQ, p),
    assets: nodeVal(GROUPS.TA, p),
    liab: nodeVal(GROUPS.TL, p),
  }));
}







const FORECAST_YEARS = [3, 10, 30];













const XL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const xlEnc = new TextEncoder();

/* ---- zip (stored, no compression) ------------------------------------ */
const XL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function xlCrc(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = XL_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function xlZip(files) {
  const parts = [], central = [];
  let off = 0;
  const d = new Date();
  const tm = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const name = xlEnc.encode(f.name), data = xlEnc.encode(f.data), crc = xlCrc(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: XL_MIME });
}

/* ---- styles ------------------------------------------------------------ */
const xesc = (s) => String(s == null ? "" : s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const XL_FMT = {
  num: [164, '#,##0.00;-#,##0.00;"–"'],
  chg: [165, '+#,##0.00;-#,##0.00;"–"'],
  pct: [166, '+0.0%;-0.0%;0.0%'],
  rate: [167, '0.0%'],
  inpct: [168, '0.00%'],
  yrs: [169, '0" years"'],
  mon: [170, '0" months"'],
};
function xlStyles() {
  const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ["<border><left/><right/><top/><bottom/><diagonal/></border>"], xfs = [];
  const idx = (list, xml) => { let i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return i; };
  const font = (o) => "<font>" + (o.b ? "<b/>" : "") + (o.i ? "<i/>" : "") + '<sz val="' + (o.sz || 10) + '"/>' +
    '<color rgb="' + (o.color || "FF101C2B") + '"/><name val="Calibri"/><family val="2"/></font>';
  idx(fonts, font({}));
  const cache = {};
  return {
    id(o) {
      const key = JSON.stringify(o);
      if (key in cache) return cache[key];
      const fo = idx(fonts, font(o));
      const fi = o.fill ? idx(fills, '<fill><patternFill patternType="solid"><fgColor rgb="' + o.fill + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
      const side = (k) => (o[k] ? "<" + k + ' style="' + o[k] + '"><color rgb="' + (o[k + "C"] || "FF9FB2CE") + '"/></' + k + ">" : "<" + k + "/>");
      const bo = o.top || o.bottom ? idx(borders, "<border><left/><right/>" + side("top") + side("bottom") + "<diagonal/></border>") : 0;
      const nf = o.fmt ? XL_FMT[o.fmt][0] : 0;
      const al = o.al || o.indent || o.wrap
        ? "<alignment" + (o.al ? ' horizontal="' + o.al + '"' : "") + (o.indent ? ' indent="' + o.indent + '"' : "") +
          (o.wrap ? ' wrapText="1" vertical="top"' : "") + "/>"
        : "";
      xfs.push('<xf numFmtId="' + nf + '" fontId="' + fo + '" fillId="' + fi + '" borderId="' + bo + '" xfId="0"' +
        ' applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"' + (al ? ' applyAlignment="1">' + al + "</xf>" : "/>"));
      return (cache[key] = xfs.length);   // +1: index 0 is the default xf
    },
    xml() {
      const nfs = Object.values(XL_FMT);
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="' + nfs.length + '">' + nfs.map((f) => '<numFmt numFmtId="' + f[0] + '" formatCode="' + xesc(f[1]) + '"/>').join("") + "</numFmts>" +
        '<fonts count="' + fonts.length + '">' + fonts.join("") + "</fonts>" +
        '<fills count="' + fills.length + '">' + fills.join("") + "</fills>" +
        '<borders count="' + borders.length + '">' + borders.join("") + "</borders>" +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="' + (xfs.length + 1) + '"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + xfs.join("") + "</cellXfs>" +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        "</styleSheet>";
    },
  };
}

/* ---- sheets -------------------------------------------------------------
   A cell is null, a number, a string, or { v, f, s }:
   v = cached value, f = formula without "=", s = style object.            */
const xlCol = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function xlSheet(name, widths) {
  return {
    name, widths, rows: [], freeze: 0,
    get next() { return this.rows.length + 1; },
    add(cells, opt) { this.rows.push({ cells: cells || [], opt: opt || {} }); return this.rows.length; },
  };
}
const xlRef = (sh, col, row) => "'" + sh.name.replace(/'/g, "''") + "'!" + col + row;

function xlSheetXML(sh, ST, first) {
  const out = [];
  let outline = false;
  sh.rows.forEach((r, i) => {
    const rn = i + 1;
    if (r.opt.level) outline = true;
    const cells = r.cells.map((c, j) => {
      if (c === null || c === undefined) return "";
      const o = typeof c === "object" ? c : { v: c };
      const ref = xlCol(j) + rn;
      const s = o.s ? ' s="' + ST.id(o.s) + '"' : "";
      if (o.f) {
        const f = "<f>" + xesc(o.f) + "</f>";
        if (typeof o.v === "number" && isFinite(o.v)) return '<c r="' + ref + '"' + s + ">" + f + "<v>" + o.v + "</v></c>";
        return '<c r="' + ref + '"' + s + ' t="str">' + f + "<v>" + xesc(o.v == null ? "" : o.v) + "</v></c>";
      }
      if (typeof o.v === "number") return isFinite(o.v) ? '<c r="' + ref + '"' + s + "><v>" + o.v + "</v></c>" : "";
      if (o.v === null || o.v === undefined || o.v === "") return s ? '<c r="' + ref + '"' + s + "/>" : "";
      return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(o.v) + "</t></is></c>";
    }).join("");
    out.push('<row r="' + rn + '"' + (r.opt.level ? ' outlineLevel="' + r.opt.level + '"' : "") +
      (r.opt.ht ? ' ht="' + r.opt.ht + '" customHeight="1"' : "") + ">" + cells + "</row>");
  });
  const pane = sh.freeze
    ? '<pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A' + (sh.freeze + 1) + '" sqref="A' + (sh.freeze + 1) + '"/>'
    : "";
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><outlinePr summaryBelow="0"/><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<sheetViews><sheetView showGridLines="0" workbookViewId="0"' + (first ? ' tabSelected="1"' : "") + ">" + pane + "</sheetView></sheetViews>" +
    '<sheetFormatPr defaultRowHeight="15"' + (outline ? ' outlineLevelRow="1"' : "") + "/>" +
    "<cols>" + sh.widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("") + "</cols>" +
    "<sheetData>" + out.join("") + "</sheetData>" +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>' +
    "</worksheet>";
}

function xlBook(sheets) {
  const ST = xlStyles();
  const sheetXml = sheets.map((sh, i) => xlSheetXML(sh, ST, i === 0));   // before styles: registers every style
  const NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  const files = [
    { name: "[Content_Types].xml", data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      "</Types>" },
    { name: "_rels/.rels", data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ' + NS + ">" +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      "</Relationships>" },
    { name: "docProps/core.xml", data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" + xesc((S.title || "") + " — Financial Statements " + periodLabel(S.activePeriod)) + "</dc:title>" +
      "<dc:creator>" + xesc(S.title || "") + "</dc:creator>" +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().slice(0, 19) + "Z</dcterms:created></cp:coreProperties>" },
    { name: "xl/workbook.xml", data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      sheets.map((s, i) => '<sheet name="' + xesc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") +
      '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ' + NS + ">" +
      sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>" },
  ];
  sheetXml.forEach((x, i) => files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: x }));
  files.push({ name: "xl/styles.xml", data: ST.xml() });
  return xlZip(files);
}

/* ---- look -------------------------------------------------------------- */
const XS = {
  title: { b: 1, sz: 14 },
  meta: { i: 1, color: "FF48566A" },
  note: { i: 1, color: "FF48566A", wrap: 1 },
  hd: { b: 1, color: "FF101C2B", fill: "FFE8EEF7" },
  hdR: { b: 1, color: "FF101C2B", fill: "FFE8EEF7", al: "right" },
  hdY: { b: 1, color: "FF101C2B", fill: "FFE8EEF7", al: "right", fmt: "yrs" },
  sec: { b: 1, color: "FF2F5E91", bottom: "thin", bottomC: "FFB8C4D4" },
  input: { color: "FF0000FF", fill: "FFFFF8E1", fmt: "num" },
  inputP: { color: "FF0000FF", fill: "FFFFF8E1", fmt: "inpct" },
};
/* one row kind (grp, leaf, sub, res, tot, plain) × one column kind */
function xs(kind, col) {
  const o = {};
  if (kind === "leaf") o.color = "FF101C2B";
  if (kind === "grp") o.b = 1;
  if (kind === "sub") { o.b = 1; o.fill = "FFEEF2F8"; o.top = "thin"; o.topC = "FF101C2B"; }
  if (kind === "res") { o.b = 1; o.fill = "FFEEF2F8"; o.top = "thin"; o.topC = "FF101C2B"; }
  if (kind === "tot") { o.b = 1; o.top = "thin"; o.topC = "FF101C2B"; o.bottom = "double"; o.bottomC = "FF101C2B"; }
  if (col === "acct") { o.color = "FF48566A"; o.al = "left"; }
  if (col === "lbl" && kind === "leaf") o.indent = 2;
  if (col === "num") o.fmt = "num";
  if (col === "chg") o.fmt = "chg";
  if (col === "pct") { o.fmt = "pct"; if (!o.color) o.color = "FF5E769D"; }
  if (col === "rate") o.fmt = "rate";
  return o;
}
const xlNum = (v, f, s) => ({ v: r2(v), f, s });
const xlSame = (a, b) => nil(r2(a - b));

/* ---- statement sheets (balance sheet, income statement) --------------- */
function xlStatement(sh, struct, p, c, showZeros, showVar, pos, ext) {
  sh.add([{ v: "Acct", s: XS.hd }, { v: "Position", s: XS.hd }, { v: periodLabel(p), s: XS.hdR }, { v: periodLabel(c), s: XS.hdR }]
    .concat(showVar ? [{ v: "Change", s: XS.hdR }, { v: "%", s: XS.hdR }] : []));
  sh.freeze = sh.rows.length;

  const varCells = (kind, rn, vc, vp) => showVar
    ? [xlNum(vc - vp, "C" + rn + "-D" + rn, xs(kind, "chg")),
       { v: nil(vp) ? "" : (vc - vp) / Math.abs(vp), f: 'IF(D' + rn + '=0,"",(C' + rn + "-D" + rn + ")/ABS(D" + rn + "))", s: xs(kind, "pct") }]
    : [];

  for (const n of struct) {
    if (n.k === "sp") { sh.add([]); continue; }
    if (n.k === "sec") { sh.add([{ v: "", s: XS.sec }, { v: n.l, s: XS.sec }, { v: "", s: XS.sec }, { v: "", s: XS.sec }].concat(showVar ? [{ v: "", s: XS.sec }, { v: "", s: XS.sec }] : [])); continue; }

    const vc = nodeVal(n, p), vp = nodeVal(n, c);
    if (n.k === "g") {
      const accs = n.r ? accountsIn(n.id) : [];
      const shown = accs.filter((a) => showZeros || !nil(accVal(p, a)) || !nil(accVal(c, a)));
      if (!showZeros && nil(vc) && nil(vp) && !shown.length) continue;
      const rn = sh.next;
      pos[n.id] = rn;
      let fc = null, fp = null;
      if (shown.length) {
        fc = "SUM(C" + (rn + 1) + ":C" + (rn + shown.length) + ")";
        fp = "SUM(D" + (rn + 1) + ":D" + (rn + shown.length) + ")";
      } else if (n.calc === "profit" && ext && ext.profit) {
        /* result for the period comes over from the income statement */
        if (xlSame(ext.profit.vc, vc)) fc = ext.profit.fc;
        if (xlSame(ext.profit.vp, vp)) fp = ext.profit.fp;
      }
      sh.add([{ v: "", s: xs("grp", "acct") }, { v: n.l, s: xs("grp", "lbl") }, xlNum(vc, fc, xs("grp", "num")), xlNum(vp, fp, xs("grp", "num"))]
        .concat(varCells("grp", rn, vc, vp)));
      for (const a of shown) {
        const av = accVal(p, a), bv = accVal(c, a), lr = sh.next;
        sh.add([{ v: +a == a ? +a : a, s: xs("leaf", "acct") }, { v: nameOf(a), s: xs("leaf", "lbl") }, xlNum(av, null, xs("leaf", "num")), xlNum(bv, null, xs("leaf", "num"))]
          .concat(varCells("leaf", lr, av, bv)), { level: 1 });
      }
      continue;
    }
    const kind = n.k === "t" ? "tot" : n.k === "r" ? "res" : "sub";
    const rn = sh.next;
    pos[n.id] = rn;
    const kids = n.of.filter((id) => pos[id]);
    const f = (col) => (kids.length ? kids.map((id) => col + pos[id]).join("+") : null);
    sh.add([{ v: "", s: xs(kind, "acct") }, { v: n.l, s: xs(kind, "lbl") }, xlNum(vc, f("C"), xs(kind, "num")), xlNum(vp, f("D"), xs(kind, "num"))]
      .concat(varCells(kind, rn, vc, vp)));
  }
}

/* ---- cash flow sheet ---------------------------------------------------- */
function xlCashFlow(sh, cf, p, c, bs, bsPos) {
  sh.add([{ v: "Acct", s: XS.hd }, { v: "Position", s: XS.hd }, { v: periodLabel(c) + " → " + periodLabel(p), s: XS.hdR }]);
  sh.freeze = sh.rows.length;
  const at = {};
  const sec = (l) => sh.add([{ v: "", s: XS.sec }, { v: l, s: XS.sec }, { v: "", s: XS.sec }]);
  const line = (key, kind, l, v, f) => {
    at[key] = sh.next;
    sh.add([{ v: "", s: xs(kind, "acct") }, { v: l, s: xs(kind, "lbl") }, xlNum(v, f, xs(kind, "num"))]);
  };
  const grp = (key, l, v, drill) => {
    const rn = sh.next;
    at[key] = rn;
    const d = drill || [];
    const f = d.length && xlSame(d.reduce((s, o) => s + o.v, 0), v) ? "SUM(C" + (rn + 1) + ":C" + (rn + d.length) + ")" : null;
    sh.add([{ v: "", s: xs("grp", "acct") }, { v: l, s: xs("grp", "lbl") }, xlNum(v, f, xs("grp", "num"))]);
    d.forEach((o) => sh.add([{ v: +o.a == o.a ? +o.a : o.a, s: xs("leaf", "acct") }, { v: cfLeafName(o.a), s: xs("leaf", "lbl") }, xlNum(o.v, null, xs("leaf", "num"))], { level: 1 }));
  };
  const sum = (keys) => keys.filter((k) => at[k]).map((k) => "C" + at[k]).join("+") || null;

  /* earnings = movement in equity less the capital movement shown under financing */
  const eqOK = bsPos.EQ && xlSame(nodeVal(GROUPS.EQ, p) - nodeVal(GROUPS.EQ, c) - cf.capital, cf.earnings);

  sec("Operating activities");
  const earnRow = sh.next;
  line("earn", "plain", "Result for the period", cf.earnings, null);
  grp("dep", "Depreciation and amortisation", cf.depreciation, cf.drills.dep);
  grp("unr", "Unrealised value changes on investments", cf.unrealised, cf.drills.unr);
  if (!cf.gross) grp("res", "Income from restricted assets (non-cash)", cf.restricted, cf.drills.res);
  line("adj", "sub", "Result adjusted for non-cash items", r2(cf.earnings + cf.NC), sum(["earn", "dep", "unr", "res"]));
  grp("opA", "Change in receivables, prepayments and other current assets", r2(-cf.dOpAsset), cf.drills.opA);
  grp("opL", "Change in short-term liabilities and accruals", cf.dOpLiab, cf.drills.opL);
  line("op", "res", "Cash flow from operating activities", cf.operating, sum(["adj", "opA", "opL"]));
  sh.add([]);
  sec("Investing activities");
  grp("invOut", "Investments", r2(cf.drills.invOut.reduce((s, o) => s + o.v, 0)), cf.drills.invOut);
  grp("invIn", "Divestments", r2(cf.drills.invIn.reduce((s, o) => s + o.v, 0)), cf.drills.invIn);
  if (!nil(cf.residual)) grp("resid", "Non-cash movements posted directly onto asset accounts", cf.residual, cf.drills.resid);
  line("inv", "res", "Cash flow from investing activities", cf.investing, sum(["invOut", "invIn", "resid"]));
  sh.add([]);
  sec("Financing activities");
  grp("fin", "Change in interest-bearing debt and loans", cf.dFin, cf.drills.fin);
  grp("cap", "Capital contributions and withdrawals", cf.capital, cf.drills.cap);
  line("fn", "res", "Cash flow from financing activities", cf.financing, sum(["fin", "cap"]));
  sh.add([]);
  line("net", "tot", "Net change in cash and cash equivalents", cf.net, sum(["op", "inv", "fn"]));
  /* a formula onto the balance sheet only when the fund is exactly one group there */
  const fondsRow = GROUPS.FONDS.of.length === 1 ? bsPos[GROUPS.FONDS.of[0]] : null;
  const cashP = fondsRow ? nodeVal(GROUPS.FONDS, p) : 0, cashC = fondsRow ? nodeVal(GROUPS.FONDS, c) : 0;
  line("open", "sub", "Cash at the beginning of the period", cf.cashOpen,
    fondsRow && xlSame(cashC, cf.cashOpen) ? xlRef(bs, "D", fondsRow) : null);
  line("close", "sub", "Cash at the end of the period", cf.cashClose,
    fondsRow && xlSame(cashP, cf.cashClose) ? xlRef(bs, "C", fondsRow) : null);
  line("chk", "plain", "Check — difference to the movement in cash (should be 0)", cf.check,
    "C" + at.close + "-C" + at.open + "-C" + at.net);

  if (eqOK) {
    sh.rows[earnRow - 1].cells[2].f = "(" + xlRef(bs, "C", bsPos.EQ) + "-" + xlRef(bs, "D", bsPos.EQ) + ")-C" + at.cap;
  }
  if (cf.legs) {
    sh.add([]);
    sh.add([null, { v: "Chained through " + cf.legs.map(periodLabel).join(" → ") + ", so every add-back covers its own financial year.", s: XS.note }]);
  }
  return at;
}

/* app hook (12 Oct 2026): cash flow sheet for the direct method from the bookings */
function xlCashFlowDirekt(sh, cf, p, c, bs, bsPos) {
  const [a, b] = cf.rueckwaerts ? [p, c] : [c, p];
  sh.add([{ v: "Acct", s: XS.hd }, { v: "Position", s: XS.hd }, { v: periodLabel(a) + " → " + periodLabel(b), s: XS.hdR }]);
  sh.freeze = sh.rows.length;
  const at = {};
  const sec = (l) => sh.add([{ v: "", s: XS.sec }, { v: l, s: XS.sec }, { v: "", s: XS.sec }]);
  const line = (key, kind, l, v, f) => {
    at[key] = sh.next;
    sh.add([{ v: "", s: xs(kind, "acct") }, { v: l, s: xs(kind, "lbl") }, xlNum(v, f, xs(kind, "num"))]);
  };
  const grp = (key, l, v, kids) => {
    const rn = sh.next;
    at[key] = rn;
    const d = kids || [];
    const f = d.length && xlSame(d.reduce((s, o) => s + o.v, 0), v) ? "SUM(C" + (rn + 1) + ":C" + (rn + d.length) + ")" : null;
    sh.add([{ v: "", s: xs("grp", "acct") }, { v: l, s: xs("grp", "lbl") }, xlNum(v, f, xs("grp", "num"))]);
    d.forEach((o) => sh.add([{ v: +o.a == o.a ? +o.a : o.a, s: xs("leaf", "acct") }, { v: nameOf(o.a), s: xs("leaf", "lbl") }, xlNum(o.v, null, xs("leaf", "num"))], { level: 1 }));
  };
  const sum = (keys) => keys.filter((k) => at[k]).map((k) => "C" + at[k]).join("+") || null;
  const part = (title, lines, key, label, total) => {
    sec(title);
    const keys = lines.map((x, i) => key + "_" + i);
    lines.forEach((x, i) => grp(keys[i], x.l, x.v, x.konten));
    line(key, "res", label, total, sum(keys));
    sh.add([]);
  };
  part("Operating activities", cf.bereiche.op, "op", "Cash flow from operating activities", cf.operating);
  part("Investing activities", cf.bereiche.inv, "inv", "Cash flow from investing activities", cf.investing);
  part("Financing activities", cf.bereiche.fin, "fn", "Cash flow from financing activities", cf.financing);
  if (!nil(cf.fx)) grp("fx", "Effect of exchange rate changes on cash", cf.fx, cf.bereiche.fx.reduce((s, l) => s.concat(l.konten), []));
  line("net", "tot", "Net change in cash" + (cf.mitSchulden ? " less credit card debt" : " and cash equivalents"), cf.change, sum(["op", "inv", "fn", "fx"]));
  const fund = cf.mitSchulden ? "Cash less credit card debt" : "Cash and cash equivalents";
  const fondsRow = GROUPS.FONDS.of.length === 1 ? bsPos[GROUPS.FONDS.of[0]] : null;
  const ref = (per, col) => !cf.mitSchulden && fondsRow && xlSame(nodeVal(GROUPS.FONDS, per), per === a ? cf.cashOpen : cf.cashClose) ? xlRef(bs, col, fondsRow) : null;
  line("open", "sub", fund + " at " + rep(a).asOf, cf.cashOpen, ref(a, a === p ? "C" : "D"));
  line("close", "sub", fund + " at " + rep(b).asOf, cf.cashClose, ref(b, b === p ? "C" : "D"));
  line("chk", "plain", "Check — difference to the movement in cash (should be 0)", cf.check, "C" + at.close + "-C" + at.open + "-C" + at.net);
  if ((cf.nichtGeld || []).length) {
    sh.add([]);
    sec("Non-cash transactions (not in the cash flow)");
    cf.nichtGeld.forEach((o) => sh.add([{ v: o.konten.join(" · "), s: xs("leaf", "acct") }, { v: o.l, s: xs("plain", "lbl") }, xlNum(o.betrag, null, xs("plain", "num"))]));
  }
  return at;
}

/* ---- investments sheet ------------------------------------------------ */
function xlInvestments(sh, p) {
  const set = investments().filter((i) => i.include);
  sh.add([{ v: "Snapshot as at " + rep(p).asOf, s: XS.sec }, { v: "", s: XS.sec }, { v: "", s: XS.sec }, { v: "", s: XS.sec }, { v: "", s: XS.sec }, { v: "", s: XS.sec }]);
  sh.add([{ v: "Acct", s: XS.hd }, { v: "Position", s: XS.hd }, { v: "Paid in", s: XS.hdR }, { v: "Value adjustment", s: XS.hdR }, { v: "Value", s: XS.hdR }, { v: "Return", s: XS.hdR }]);
  const snap = {};
  const first = sh.next;
  set.forEach((i) => {
    const a = sumAt(p, i.pay), b = sumAt(p, i.adj), rn = sh.next;
    snap[i.id] = rn;
    sh.add([{ v: i.pay.join(", "), s: xs("plain", "acct") }, { v: i.label, s: xs("plain", "lbl") },
      xlNum(a, null, xs("plain", "num")), xlNum(b, null, xs("plain", "chg")),
      xlNum(a + b, "C" + rn + "+D" + rn, xs("plain", "num")),
      { v: a ? b / a : "", f: 'IF(C' + rn + '=0,"",D' + rn + "/C" + rn + ")", s: xs("plain", "pct") }]);
  });
  const last = sh.next - 1, tr = sh.next;
  const pay = r2(set.reduce((s, i) => s + sumAt(p, i.pay), 0)), adj = r2(set.reduce((s, i) => s + sumAt(p, i.adj), 0));
  const S_ = (col) => (set.length ? "SUM(" + col + first + ":" + col + last + ")" : null);
  sh.add([{ v: "", s: xs("tot", "acct") }, { v: "Total", s: xs("tot", "lbl") }, xlNum(pay, S_("C"), xs("tot", "num")), xlNum(adj, S_("D"), xs("tot", "chg")),
    xlNum(pay + adj, S_("E"), xs("tot", "num")), { v: pay ? adj / pay : "", f: 'IF(C' + tr + '=0,"",D' + tr + "/C" + tr + ")", s: xs("tot", "pct") }]);
  sh.add([null, { v: "Positions ticked under Data & mapping. Paid in is the net contribution; the value adjustment is the unrealised gain or loss on its own account.", s: XS.note }], { ht: 30 });
  sh.add([]);

  /* forecast — blue cells are inputs, the horizon years in the header can be changed */
  const H = FORECAST_YEARS;
  const hdr = [{ v: "Acct", s: XS.hd }, { v: "Position", s: XS.hd }, { v: "Monthly pay-in", s: XS.hdR }, { v: "Return p.a.", s: XS.hdR }];
  H.forEach(() => hdr.push({ v: "Paid in", s: XS.hdR }, { v: "Value", s: XS.hdR }));
  sh.add([{ v: "Forecast — monthly contributions, monthly compounding", s: XS.sec }].concat(new Array(3 + H.length * 2).fill({ v: "", s: XS.sec })));
  const yr = sh.next;
  sh.add([{ v: "", s: XS.hd }, { v: "Horizon", s: XS.hd }, { v: "", s: XS.hd }, { v: "", s: XS.hd }]
    .concat(...H.map((y) => [{ v: y, s: XS.hdY }, { v: "", s: XS.hd }])));
  sh.add(hdr);
  const ff = sh.next;
  set.forEach((i) => {
    const rn = sh.next, sr = snap[i.id];
    const mo = +i.monthly || 0, ret = (+i.ret || 0) / 100;
    const cells = [{ v: i.pay.join(", "), s: xs("plain", "acct") }, { v: i.label, s: xs("plain", "lbl") },
      { v: r2(mo), s: XS.input }, { v: ret, s: XS.inputP }];
    H.forEach((y, k) => {
      const one = buildSeries([i], y), e = one[one.length - 1] || { pay: 0, val: 0 };
      const Y = xlCol(4 + k * 2) + "$" + yr;
      cells.push(
        xlNum(e.pay, "C" + sr + "+MAX(0,C" + rn + ")*12*" + Y, xs("plain", "num")),
        xlNum(e.val, "FV((1+D" + rn + ")^(1/12)-1,12*" + Y + ",-MAX(0,C" + rn + "),-E" + sr + ")", xs("plain", "num")));
    });
    sh.add(cells);
  });
  const fl = sh.next - 1, ftr = sh.next;
  const tot = [{ v: "", s: xs("tot", "acct") }, { v: "Total", s: xs("tot", "lbl") },
    xlNum(set.reduce((s, i) => s + (+i.monthly || 0), 0), set.length ? "SUM(C" + ff + ":C" + fl + ")" : null, xs("tot", "num")), { v: "", s: xs("tot", "num") }];
  H.forEach((y, k) => {
    const pts = buildSeries(set, y), e = pts[pts.length - 1] || { pay: 0, val: 0 };
    const cp = xlCol(4 + k * 2), cv = xlCol(5 + k * 2);
    tot.push(xlNum(e.pay, set.length ? "SUM(" + cp + ff + ":" + cp + fl + ")" : null, xs("tot", "num")),
      xlNum(e.val, set.length ? "SUM(" + cv + ff + ":" + cv + fl + ")" : null, xs("tot", "num")));
  });
  sh.add(tot);
  sh.add([null, { v: "A projection, not a promise: contributions and returns are held flat for the whole horizon. Taxes, fees and inflation are not modelled.", s: XS.note }], { ht: 30 });
  return { totalRow: tr, forecastTotal: ftr };
}

/* ---- overview sheet ----------------------------------------------------- */
function xlOverview(sh, p, c, showVar, refs) {
  const m = monthsOf(p);
  const H = [{ v: "Key figures", s: XS.hd }, { v: periodLabel(p), s: XS.hdR }, { v: periodLabel(c), s: XS.hdR }];
  if (showVar) H.push({ v: "Change", s: XS.hdR }, { v: "%", s: XS.hdR });
  const W = showVar ? 5 : 3;
  const secRow = (l) => sh.add([{ v: l, s: XS.sec }].concat(new Array(W - 1).fill({ v: "", s: XS.sec })));
  sh.add(H);
  sh.freeze = sh.rows.length;
  /* a key figure linked to its statement row */
  const link = (l, bold, sheet, row, vc, vp, addC, addP) => {
    const kind = bold ? "sub" : "plain", rn = sh.next;
    const fC = row ? xlRef(sheet, "C", row) + (addC ? "+" + addC.f : "") : null;
    const fP = row ? xlRef(sheet, "D", row) + (addP ? "+" + addP : "") : null;
    const cells = [{ v: l, s: xs(kind, "lbl") }, xlNum(vc, fC, xs(kind, "num")), xlNum(vp, fP, xs(kind, "num"))];
    if (showVar) cells.push(xlNum(vc - vp, "B" + rn + "-C" + rn, xs(kind, "chg")),
      { v: nil(vp) ? "" : (vc - vp) / Math.abs(vp), f: 'IF(C' + rn + '=0,"",(B' + rn + "-C" + rn + ")/ABS(C" + rn + "))", s: xs(kind, "pct") });
    sh.add(cells);
  };
  const bs = refs.bs, is = refs.is, B = refs.bsPos, I = refs.isPos;
  const v = (id, x) => nodeVal(GROUPS[id], x);
  secRow("Balance sheet");
  link("Total assets", true, bs, B.TA, v("TA", p), v("TA", c));
  link("Total current assets", false, bs, B.CA, v("CA", p), v("CA", c));
  link("Total non-current assets", false, bs, B.NCA, v("NCA", p), v("NCA", c));
  link("Total liabilities", true, bs, B.TL, v("TL", p), v("TL", c));
  link("Equity — net worth", true, bs, B.EQ, v("EQ", p), v("EQ", c));
  const invP = investedAt(p), invC = investedAt(c);
  const cashRow = sh.next;
  link("Cash, equivalents and investments", false, bs, B.A1, v("A1", p) + invP, v("A1", c) + invC,
    { f: xlRef(refs.inv, "E", refs.invPos.totalRow) }, String(invC));
  if (!B.A1) {   /* no cash line on the balance sheet — keep the plain figures */
    sh.rows[cashRow - 1].cells[1].f = xlRef(refs.inv, "E", refs.invPos.totalRow);
    sh.rows[cashRow - 1].cells[2].f = null;
  }
  secRow("Income statement (" + m + " month" + (m === 1 ? "" : "s") + ")");
  link("Total income", true, is, I.TI, v("TI", p), v("TI", c));
  link("Gross result", false, is, I.GR, v("GR", p), v("GR", c));
  link("EBITDA", false, is, I.EBITDA, v("EBITDA", p), v("EBITDA", c));
  link("EBIT", false, is, I.EBIT, v("EBIT", p), v("EBIT", c));
  link("Result for the period", true, is, I.NP, v("NP", p), v("NP", c));
  const tiR = sh.next - 5, npR = sh.next - 1;
  sh.add([{ v: "Savings rate", s: xs("plain", "lbl") },
    { v: v("TI", p) ? v("NP", p) / v("TI", p) : 0, f: "IF(B" + tiR + "=0,0,B" + npR + "/B" + tiR + ")", s: xs("plain", "rate") },
    { v: v("TI", c) ? v("NP", c) / v("TI", c) : 0, f: "IF(C" + tiR + "=0,0,C" + npR + "/C" + tiR + ")", s: xs("plain", "rate") }]
    .concat(showVar ? [{ v: "", s: xs("plain", "chg") }, { v: "", s: xs("plain", "pct") }] : []));
  if (refs.cf) {
    const cf = refs.cf, at = refs.cfAt;
    secRow("Cash flow " + rep(c).asOf + " → " + rep(p).asOf);
    [["Cash flow from operating activities", cf.operating, at.op, 0],
     ["Cash flow from investing activities", cf.investing, at.inv, 0],
     ["Cash flow from financing activities", cf.financing, at.fn, 0],
     ["Net change in cash and cash equivalents", cf.net, at.net, 1]].forEach((r) => {
      const kind = r[3] ? "sub" : "plain";
      sh.add([{ v: r[0], s: xs(kind, "lbl") }, xlNum(r[1], xlRef(refs.cfSh, "C", r[2]), xs(kind, "num"))]);
    });
  }
  sh.add([]);

  /* by financial year — latest report of each year */
  const ys = yearSeries();
  sh.add([{ v: "Financial year", s: XS.hd }, { v: "Income", s: XS.hdR }, { v: "Expenses", s: XS.hdR }, { v: "Result", s: XS.hdR }, { v: "Savings rate", s: XS.hdR }]);
  ys.forEach((d) => {
    const rn = sh.next;
    sh.add([{ v: d.y + (d.part ? " · " + d.months + " months" : ""), s: xs("plain", "lbl") },
      xlNum(d.income, null, xs("plain", "num")), xlNum(d.expense, null, xs("plain", "num")),
      xlNum(d.result, "B" + rn + "-C" + rn, xs("plain", "num")),
      { v: d.income ? d.result / d.income : 0, f: "IF(B" + rn + "=0,0,D" + rn + "/B" + rn + ")", s: xs("plain", "rate") }]);
  });
  sh.add([]);

  /* net worth at every stored report */
  const ws = worthSeries();
  sh.add([{ v: "Report", s: XS.hd }, { v: "Total assets", s: XS.hdR }, { v: "Total liabilities", s: XS.hdR }, { v: "Net worth", s: XS.hdR }, { v: "Change", s: XS.hdR }]);
  ws.forEach((d, i) => {
    const rn = sh.next;
    const worthF = xlSame(d.assets - d.liab, d.worth) ? "B" + rn + "-C" + rn : null;
    sh.add([{ v: d.t + " · " + d.label, s: xs("plain", "lbl") },
      xlNum(d.assets, null, xs("plain", "num")), xlNum(d.liab, null, xs("plain", "num")),
      xlNum(d.worth, worthF, xs("plain", "num")),
      i ? xlNum(d.worth - ws[i - 1].worth, "D" + rn + "-D" + (rn - 1), xs("plain", "chg")) : { v: "", s: xs("plain", "chg") }]);
  });
}

/* ---- assemble + save ------------------------------------------------------ */
function xlTitle(sh, title, meta) {
  sh.add([{ v: title, s: XS.title }], { ht: 22 });
  sh.add([{ v: meta, s: XS.meta }]);
  sh.add([]);
}

function buildXLSX() {
  const p = S.activePeriod, c = S.comparePeriod;
  const showVar = S.showVariance !== false;
  const R = rep(p), m = monthsOf(p);
  const who = (S.title || "") + " · " + CUR();

  const ov = xlSheet("Overview", [44, 17, 17, 17, 11]);
  const bs = xlSheet("Balance sheet", [9, 52, 17, 17, 16, 10]);
  const is = xlSheet("Income statement", [9, 52, 17, 17, 16, 10]);
  const cfSh = p === c ? null : xlSheet("Cash flow", [9, 60, 20]);
  const inv = xlSheet("Investments", [14, 38, 16, 16, 16, 16, 16, 16, 16, 16]);

  const bsPos = {}, isPos = {};
  xlTitle(is, "Income statement", (R.basis === "YTD" ? "Year to date, " + m + " month" + (m === 1 ? "" : "s") + " to " : "Full year to ") + R.asOf + " · compared with " + periodLabel(c) + " · " + who);
  xlStatement(is, IS, p, c, !!S.zerosIS, showVar, isPos);

  xlTitle(bs, "Balance sheet", "As at " + R.asOf + " · compared with " + periodLabel(c) + " (" + rep(c).asOf + ") · " + who);
  xlStatement(bs, BS, p, c, !!S.zerosBS, showVar, bsPos, {
    profit: isPos.NP ? { vc: nodeVal(GROUPS.NP, p), vp: nodeVal(GROUPS.NP, c), fc: xlRef(is, "C", isPos.NP), fp: xlRef(is, "D", isPos.NP) } : null,
  });

  let cf = null, cfAt = null;
  if (cfSh && S.cfDirekt) {          /* app hook (12 Oct 2026): cash flow from the bookings, direct method */
    const d = S.cfDirekt(p, c);
    xlTitle(cfSh, "Cash flow statement", "Direct method, from the bookings · " + d.von + " → " + d.bis + " · " + who);
    cfAt = xlCashFlowDirekt(cfSh, d, p, c, bs, bsPos);
    cf = Object.assign({}, d, { net: d.change });
  } else if (cfSh) {
    cf = buildCF(p, c);
    xlTitle(cfSh, "Cash flow statement", "Indirect method · " + rep(c).asOf + " → " + R.asOf + " · " + who);
    cfAt = xlCashFlow(cfSh, cf, p, c, bs, bsPos);
  }

  xlTitle(inv, "Financial investments", "As at " + R.asOf + " · blue cells are inputs — change them and the forecast follows · " + who);
  const invPos = xlInvestments(inv, p);

  xlTitle(ov, "Overview", periodLabel(p) + " as at " + R.asOf + " · compared with " + periodLabel(c) + " · " + who);
  xlOverview(ov, p, c, showVar, { bs, is, inv, invPos, bsPos, isPos, cf, cfAt, cfSh });

  return xlBook([ov, bs, is].concat(cfSh ? [cfSh] : [], [inv]));
}




return {S, BS, IS, GROUPS, periods, rep, accVal, nameOf, groupOf, allAccounts, accountsIn, invalidate,
  profitOf, nodeVal, monthsOf, periodLabel, statementHTML, investedAt, investments,
  buildCF, cfClassOf, fmt, fmtPct, nil, r2, CUR,
  buildSeries, resetForecast, yearSeries, worthSeries, buildXLSX};
}
if(typeof module !== "undefined") module.exports = {FSKern};

