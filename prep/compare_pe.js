// Compare engine.js (OBBBA scenario) with PolicyEngine results.
// Usage: node prep/compare_pe.js <pe_cases.json>
const E = require("../engine.js");
const states = require("../data/states.json");
const cases = require(require("path").resolve(process.argv[2]));
let worst = 0;
for (const c of cases) {
  const h = { fs: c.fs === "mfj" ? "mfj" : c.kids ? "hoh" : "single", kids: c.kids, age: c.age, spouse65: !!c.spouse65,
    wages: c.wages, tips: c.tips || 0, overtime: c.overtime || 0, bus: c.bus || 0, interest: c.interest || 0, taxex: c.taxex || 0, div: c.div || 0, kg: c.kg || 0,
    ss: c.ss || 0, pens: 0, home: 0, propTaxOverride: c.propTax || 0, mortInt: c.mortInt || 0, mortBal: 0,
    charity: 0, carInt: 0, state: c.state };
  const pre = E.prepare(h, states);
  const r = E.compute(h, E.SCENARIOS.obbba, pre);
  const d = r.total - c.pe_income_tax;
  worst = Math.max(worst, Math.abs(d));
  console.log([h.fs, c.kids, c.wages, c.state, c.tips||"", c.overtime||"", c.bus||"", c.kg||"", c.ss||""].join(",").padEnd(40),
    "ours", Math.round(r.total).toString().padStart(8), "PE", Math.round(c.pe_income_tax).toString().padStart(8),
    "diff", Math.round(d).toString().padStart(7), "| state ours", Math.round(pre.stateIncomeTax), "PE", Math.round(c.pe_state_tax),
    "| agi", Math.round(r.agi), Math.round(c.pe_agi));
}
console.log("worst abs diff", Math.round(worst));
