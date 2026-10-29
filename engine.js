// Federal income tax engine for tax year 2026 under three regimes:
//   expired - TCJA individual provisions expire (law before the OBBBA passed)
//   tcja    - 2025 TCJA rules continue with normal indexing (no OBBBA)
//   obbba   - law as enacted (OBBBA, P.L. 119-21)
// Works in the browser (window.TaxEngine) and in Node (module.exports).
(function (root) {
  "use strict";

  // Factor from 2017 to 2026 dollars (chained CPI). Calibrated so the pre-TCJA
  // standard deduction lands on the $8,350 / $16,700 Tax Foundation reports.
  const F17 = 1.315;
  // Factor from 2018 to 2026 dollars, implied by 2026 IRS bracket thresholds.
  const F18 = 1.2811;
  const r50 = (x) => Math.floor(x / 50) * 50;
  const by = (single, mfj, hoh) => ({ single, mfj, hoh: hoh === undefined ? single : hoh });
  const idx17 = (o) => by(r50(o.single * F17), r50(o.mfj * F17), r50(o.hoh * F17));

  const OBBBA_STARTS = by(
    [0, 12400, 50400, 105700, 201775, 256225, 640600],
    [0, 24800, 100800, 211400, 403550, 512450, 768700],
    [0, 17700, 67450, 105700, 201750, 256200, 640600]
  );
  const TCJA_RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  const LTCG_2026 = { t15: by(49450, 98900, 66200), t20: by(545500, 613700, 579600) };

  const pre17 = by(
    [0, 9325, 37950, 91900, 191650, 416700, 418400],
    [0, 18650, 75900, 153100, 233350, 416700, 470700],
    [0, 13350, 50800, 131200, 212500, 416700, 444550]
  );
  const EXPIRED_STARTS = by(...["single", "mfj", "hoh"].map((k) => pre17[k].map((x) => r50(x * F17))));

  // Parameter groups. Each scenario is a full set; hybrids (for the "what drove
  // the change" breakdown) are built by swapping whole groups.
  const SCENARIOS = {
    expired: {
      rates: {
        rates: [0.10, 0.15, 0.25, 0.28, 0.33, 0.35, 0.396],
        starts: EXPIRED_STARTS,
        // Pre-TCJA capital gains rates key off the ordinary brackets.
        ltcg: {
          t15: by(EXPIRED_STARTS.single[2], EXPIRED_STARTS.mfj[2], EXPIRED_STARTS.hoh[2]),
          t20: by(EXPIRED_STARTS.single[6], EXPIRED_STARTS.mfj[6], EXPIRED_STARTS.hoh[6]),
        },
      },
      stdex: {
        std: idx17(by(6350, 12700, 9350)),
        aged: by(r50(1550 * F17), r50(1250 * F17)),
        exemption: r50(4050 * F17),
        phaseThr: idx17(by(261500, 313800, 287650)), // PEP and Pease
      },
      ctc: { amount: 1000, refundCap: 1000, earnedThr: 3000, phaseThr: by(75000, 110000, 75000) },
      itemized: { saltCap: Infinity, mortCap: 1e6, pease: true, charityFloor: 0, limit237: false },
      amt: {
        ex: idx17(by(54300, 84500, 54300)),
        po: idx17(by(120700, 160900, 120700)),
        poRate: 0.25,
        br28: r50(187800 * F17),
      },
      qbi: { rate: 0 },
      newded: null,
    },
    tcja: {
      rates: {
        rates: TCJA_RATES,
        starts: by(
          [0, r50(9525 * F18), r50(38700 * F18), ...OBBBA_STARTS.single.slice(3)],
          [0, 2 * r50(9525 * F18), 2 * r50(38700 * F18), ...OBBBA_STARTS.mfj.slice(3)],
          [0, r50(13600 * F18), r50(51800 * F18), ...OBBBA_STARTS.hoh.slice(3)]
        ),
        ltcg: LTCG_2026,
      },
      stdex: {
        std: by(r50(12000 * F18), 2 * r50(12000 * F18), r50(18000 * F18)),
        aged: by(2050, 1650),
        exemption: 0,
        phaseThr: null,
      },
      ctc: { amount: 2000, refundCap: 1700, earnedThr: 2500, phaseThr: by(200000, 400000) },
      itemized: { saltCap: 10000, mortCap: 750000, pease: false, charityFloor: 0, limit237: false },
      amt: {
        ex: by(90100, 140200),
        po: by(r50(500000 * F18), r50(1000000 * F18)),
        poRate: 0.25,
        br28: 244500,
      },
      qbi: { rate: 0.2 },
      newded: null,
    },
    obbba: {
      rates: { rates: TCJA_RATES, starts: OBBBA_STARTS, ltcg: LTCG_2026 },
      stdex: { std: by(16100, 32200, 24150), aged: by(2050, 1650), exemption: 0, phaseThr: null },
      ctc: { amount: 2200, refundCap: 1700, earnedThr: 2500, phaseThr: by(200000, 400000) },
      itemized: {
        saltCap: 40400, saltPhaseThr: 505000, saltPhaseRate: 0.3, saltFloor: 10000,
        mortCap: 750000, pease: false, charityFloor: 0.005, limit237: true,
      },
      amt: { ex: by(90100, 140200), po: by(500000, 1000000), poRate: 0.5, br28: 244500 },
      qbi: { rate: 0.2 },
      newded: {
        senior: 6000, seniorThr: by(75000, 150000), seniorRate: 0.06,
        tipsCap: 25000, otCap: by(12500, 25000), tipsOtThr: by(150000, 300000), tipsOtRate: 0.1,
        carCap: 10000, carThr: by(100000, 200000), carRate: 0.2,
        charityNI: by(1000, 2000),
      },
    },
  };

  const GROUPS = [
    { key: "rates", label: "Tax rates & brackets" },
    { key: "stdex", label: "Standard deduction & exemptions" },
    { key: "ctc", label: "Child Tax Credit" },
    { key: "itemized", label: "SALT & itemized deduction rules" },
    { key: "amt", label: "Alternative Minimum Tax" },
    { key: "qbi", label: "Business income (QBI) deduction" },
    { key: "newded", label: "New deductions (seniors, tips, overtime, car loans)" },
  ];

  // EITC is the same under all three regimes (TCJA did not change it beyond indexing).
  const EITC = {
    phaseInRate: [0.0765, 0.34, 0.40, 0.45],
    earnedAmt: [8680, 13020, 18290, 18290],
    max: [664, 4427, 7316, 8231],
    poRate: [0.0765, 0.1598, 0.2106, 0.2106],
    poStart: by([10860, 23890, 23890, 23890], [18140, 31160, 31160, 31160]),
    investLimit: 12200,
  };
  const NIIT = { rate: 0.038, thr: by(200000, 250000) };
  // Share of ordinary dividends that are qualified (IRS SOI puts it near 80%).
  const QUALIFIED_DIV_SHARE = 0.8;

  function bracketTax(income, starts, rates) {
    let tax = 0;
    for (let i = 0; i < rates.length; i++) {
      const lo = starts[i];
      const hi = i + 1 < starts.length ? starts[i + 1] : Infinity;
      if (income <= lo) break;
      tax += (Math.min(income, hi) - lo) * rates[i];
    }
    return tax;
  }

  // Preferential-rate income stacked on top of ordinary income.
  function prefTax(ordinary, pref, t15, t20) {
    const top = ordinary + pref;
    const in0 = Math.max(0, Math.min(top, t15) - ordinary);
    const in15 = Math.max(0, Math.min(top, t20) - Math.max(ordinary, t15));
    const in20 = pref - in0 - in15;
    return 0.15 * in15 + 0.2 * Math.max(0, in20);
  }

  function taxableSocialSecurity(ss, otherIncome, fs) {
    if (ss <= 0) return 0;
    const b1 = fs === "mfj" ? 32000 : 25000;
    const b2 = fs === "mfj" ? 44000 : 34000;
    const prov = otherIncome + 0.5 * ss;
    if (prov <= b1) return 0;
    if (prov <= b2) return Math.min(0.5 * (prov - b1), 0.5 * ss);
    return Math.min(0.85 * ss, 0.85 * (prov - b2) + Math.min(0.5 * ss, 0.5 * (b2 - b1)));
  }

  function eitc(h, agi, earned, invest) {
    if (invest > EITC.investLimit || earned <= 0) return 0;
    const k = Math.min(h.kids, 3);
    if (k === 0 && (h.age < 25 || h.age >= 65)) return 0;
    const phased = Math.min(EITC.phaseInRate[k] * earned, EITC.max[k]);
    const start = EITC.poStart[h.fs === "mfj" ? "mfj" : "single"][k];
    return Math.max(0, phased - EITC.poRate[k] * Math.max(0, Math.max(agi, earned) - start));
  }

  function stateIncomeTax(h, st, stateAgi) {
    if (!st) return 0;
    let tax = 0;
    if (st.capGains) {
      const g = Math.max(0, h.kg);
      for (let i = 0; i < st.capGains.length; i++) {
        const [lo, rate] = st.capGains[i];
        const hi = i + 1 < st.capGains.length ? st.capGains[i + 1][0] : Infinity;
        tax += Math.max(0, Math.min(g, hi) - lo) * rate;
      }
    }
    const sched = h.fs === "mfj" ? st.mfj : st.single;
    if (sched && sched.length) {
      const m = h.fs === "mfj" ? 1 : 0;
      let ded = 0, credit = 0;
      if (st.stdCredit) credit += st.std[m]; else ded += st.std[m];
      const personal = st.ex[m], dep = st.ex[2] * h.kids;
      if (st.exCredit[m]) credit += personal; else ded += personal;
      if (st.exCredit[2]) credit += dep; else ded += dep;
      const ti = Math.max(0, stateAgi - ded);
      tax += Math.max(0, bracketTax(ti, sched.map((b) => b[0]), sched.map((b) => b[1])) - credit);
    }
    return tax + st.local * Math.max(0, stateAgi);
  }

  // Rough general sales tax deduction (IRS optional table shape): taxable
  // purchases grow less than proportionally with income.
  const salesTaxBase = (agi) => 55 * Math.pow(Math.max(agi, 0), 0.55);

  // Scenario-independent pieces: AGI, state/local taxes.
  function prepare(h, states) {
    const wages = h.wages + h.tips + h.overtime;
    const capLoss = Math.max(h.kg, -3000);
    // Deduction for half of self-employment tax (2026 Social Security wage base $184,500).
    const seNet = Math.max(0, h.bus) * 0.9235;
    const seTax = 0.124 * Math.min(seNet, Math.max(0, 184500 - wages)) + 0.029 * seNet;
    const taxex = h.taxex || 0;
    const nonSS = wages + h.bus - seTax / 2 + h.interest + h.div + capLoss + h.pens;
    // Tax-exempt interest counts toward the Social Security provisional income test.
    const taxSS = taxableSocialSecurity(h.ss, nonSS + taxex, h.fs);
    const agi = nonSS + taxSS;
    const st = states ? states[h.state] : null;
    const stateIncome = h.stateTaxOverride != null ? h.stateTaxOverride : stateIncomeTax(h, st, nonSS);
    const salesTax = st ? st.sales * salesTaxBase(agi) : 0;
    const propTax = h.propTaxOverride != null ? h.propTaxOverride : (st ? st.prop * h.home : 0);
    return {
      agi, taxSS, wages, seDed: seTax / 2,
      earned: wages + seNet - seTax / 2,
      stateIncomeTax: stateIncome,
      salt: Math.max(stateIncome, salesTax) + propTax,
      propTax, salesTax,
      pref: QUALIFIED_DIV_SHARE * h.div + Math.max(0, h.kg),
      invest: h.interest + h.div + Math.max(0, h.kg), // net investment income (NIIT)
      eitcInvest: h.interest + taxex + h.div + Math.max(0, h.kg),
    };
  }

  function compute(h, P, pre) {
    const fs = h.fs;
    const { agi } = pre;
    const persons = fs === "mfj" ? 2 : 1;
    const nAged = (h.age >= 65 ? 1 : 0) + (fs === "mfj" && h.spouse65 ? 1 : 0);
    const R = P.rates, S = P.stdex, I = P.itemized, N = P.newded;
    const out = { agi };

    // Itemized deductions
    let saltCap = I.saltCap;
    if (I.saltPhaseThr) saltCap = Math.max(I.saltFloor, saltCap - I.saltPhaseRate * Math.max(0, agi - I.saltPhaseThr));
    const salt = Math.min(pre.salt, saltCap);
    const mort = h.mortBal > I.mortCap ? h.mortInt * I.mortCap / h.mortBal : h.mortInt;
    const charity = Math.max(0, h.charity - I.charityFloor * agi);
    let itemized = salt + mort + charity;
    let pease = 0;
    if (I.pease && S.phaseThr) {
      pease = Math.min(0.03 * Math.max(0, agi - S.phaseThr[fs]), 0.8 * itemized);
    }
    itemized -= pease;
    const std = S.std[fs] + nAged * S.aged[fs === "mfj" ? "mfj" : "single"];

    // Personal exemptions (with PEP phase-out)
    let exemptions = 0;
    if (S.exemption) {
      exemptions = S.exemption * (persons + h.kids);
      if (S.phaseThr && agi > S.phaseThr[fs]) {
        const pct = Math.min(1, Math.ceil((agi - S.phaseThr[fs]) / 2500) * 0.02);
        exemptions *= 1 - pct;
      }
    }

    // OBBBA's new below-the-line deductions
    const nd = { senior: 0, tips: 0, overtime: 0, car: 0, charityNI: 0 };
    if (N) {
      const k = fs === "mfj" ? "mfj" : "single";
      nd.senior = nAged * Math.max(0, N.senior - N.seniorRate * Math.max(0, agi - N.seniorThr[k]));
      const toRed = N.tipsOtRate * Math.max(0, agi - N.tipsOtThr[k]);
      nd.tips = Math.max(0, Math.min(h.tips, N.tipsCap) - toRed);
      // Only the premium half of time-and-a-half pay qualifies.
      nd.overtime = Math.max(0, Math.min(h.overtime / 3, N.otCap[k]) - toRed);
      nd.car = Math.max(0, Math.min(h.carInt, N.carCap) - N.carRate * Math.max(0, agi - N.carThr[k]));
    }

    let useItemized = itemized > std;
    // 2/37 limit for the 37% bracket
    let limit237 = 0;
    const belowLine = nd.senior + nd.tips + nd.overtime + nd.car;
    if (useItemized && I.limit237) {
      const top = R.starts[fs][R.starts[fs].length - 1];
      const tiNoLimit = Math.max(0, agi - itemized - exemptions - belowLine);
      limit237 = (2 / 37) * Math.min(itemized, Math.max(0, tiNoLimit + itemized - top));
      if (itemized - limit237 <= std) useItemized = false;
    }
    if (!useItemized && N) nd.charityNI = Math.min(h.charity, N.charityNI[fs === "mfj" ? "mfj" : "single"]);
    const deduction = useItemized ? itemized - limit237 : std;

    const tiPreQbi = Math.max(0, agi - deduction - exemptions - belowLine - nd.charityNI);
    const netCapGain = Math.min(tiPreQbi, pre.pref);
    let qbi = 0;
    if (P.qbi.rate && h.bus > 0) {
      qbi = Math.min(P.qbi.rate * (h.bus - pre.seDed),P.qbi.rate * Math.max(0, tiPreQbi - netCapGain));
      if (N && h.bus >= 1000) qbi = Math.max(qbi, Math.min(400, tiPreQbi)); // OBBBA minimum deduction
    }
    const ti = Math.max(0, tiPreQbi - qbi);
    const pref = Math.min(ti, pre.pref);
    const ordinary = ti - pref;
    const regular = bracketTax(ordinary, R.starts[fs], R.rates) +
      prefTax(ordinary, pref, R.ltcg.t15[fs], R.ltcg.t20[fs]);

    // AMT: no standard deduction, exemptions or SALT; Pease/2-37 not applied.
    const A = P.amt;
    const amtItem = useItemized ? itemized + pease - salt : 0;
    const amti = Math.max(0, agi - amtItem - belowLine - nd.charityNI - qbi);
    const amtEx = Math.max(0, A.ex[fs] - A.poRate * Math.max(0, amti - A.po[fs]));
    const amtBase = Math.max(0, amti - amtEx);
    const amtPref = Math.min(amtBase, pre.pref);
    const amtOrd = amtBase - amtPref;
    const tmt = 0.26 * Math.min(amtOrd, A.br28) + 0.28 * Math.max(0, amtOrd - A.br28) +
      prefTax(amtOrd, amtPref, R.ltcg.t15[fs], R.ltcg.t20[fs]);
    const amt = Math.max(0, tmt - regular);

    // Child Tax Credit
    const C = P.ctc;
    let ctcTotal = h.kids * C.amount;
    const thr = C.phaseThr[fs];
    if (agi > thr) ctcTotal = Math.max(0, ctcTotal - Math.ceil((agi - thr) / 1000) * 50);
    const liability = regular + amt;
    const ctcNonref = Math.min(ctcTotal, liability);
    const ctcRef = Math.min(ctcTotal - ctcNonref, h.kids * C.refundCap,
      0.15 * Math.max(0, pre.earned - C.earnedThr));

    const eic = eitc(h, agi, pre.earned, pre.eitcInvest);
    const niit = NIIT.rate * Math.max(0, Math.min(pre.invest, agi - NIIT.thr[fs === "mfj" ? "mfj" : "single"]));

    const total = regular + amt - ctcNonref - ctcRef - eic + niit;
    return Object.assign(out, {
      useItemized, std, itemizedRaw: salt + mort + charity, saltAllowed: useItemized ? salt : 0,
      pease, limit237, deduction, exemptions, qbi, ...nd, ti, regular, amt,
      ctc: ctcNonref + ctcRef, eitc: eic, niit, total,
    });
  }

  function hybrid(base, other, keys) {
    const p = Object.assign({}, base);
    keys.forEach((k) => { p[k] = other[k]; });
    return p;
  }

  // Tax under each regime plus a sequential breakdown from `from` to `to`.
  function analyze(h, states, from, to) {
    const pre = prepare(h, states);
    const res = {};
    for (const k of Object.keys(SCENARIOS)) res[k] = compute(h, SCENARIOS[k], pre);
    const steps = [];
    let cur = SCENARIOS[from];
    let prevTax = res[from].total;
    for (const g of GROUPS) {
      cur = hybrid(cur, SCENARIOS[to], [g.key]);
      const t = compute(h, cur, pre).total;
      steps.push({ key: g.key, label: g.label, delta: t - prevTax });
      prevTax = t;
    }
    return { pre, res, steps };
  }

  const api = { SCENARIOS, GROUPS, prepare, compute, analyze, stateIncomeTax, taxableSocialSecurity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TaxEngine = api;
})(typeof self !== "undefined" ? self : this);
