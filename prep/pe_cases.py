"""Compute 2026 federal income tax with PolicyEngine-US for a grid of households.
Usage: python prep/pe_cases.py <out.json>"""
import json, sys, itertools
from policyengine_us import Simulation

def situation(c):
    people = {"head": {"age": {"2026": c["age"]}, "employment_income": {"2026": c["wages"] + c.get("tips", 0) + c.get("overtime", 0)},
                       "tip_income": {"2026": c.get("tips", 0)},
                       "fsla_overtime_premium": {"2026": c.get("overtime", 0) / 3},
                       "long_term_capital_gains": {"2026": c.get("kg", 0)},
                       "social_security": {"2026": c.get("ss", 0)},
                       "taxable_interest_income": {"2026": c.get("interest", 0)},
                       "tax_exempt_interest_income": {"2026": c.get("taxex", 0)},
                       "qualified_dividend_income": {"2026": 0.8 * c.get("div", 0)},
                       "non_qualified_dividend_income": {"2026": 0.2 * c.get("div", 0)},
                       "real_estate_taxes": {"2026": c.get("propTax", 0)},
                       "self_employment_income": {"2026": c.get("bus", 0)},
                       "deductible_mortgage_interest": {"2026": c.get("mortInt", 0)}}}
    members = ["head"]
    if c["fs"] == "mfj":
        people["spouse"] = {"age": {"2026": 70 if c.get("spouse65") else c["age"]}}
        members.append("spouse")
    for i in range(c["kids"]):
        people[f"kid{i}"] = {"age": {"2026": 8}}
        members.append(f"kid{i}")
    return {"people": people,
            "tax_units": {"tu": {"members": members}},
            "families": {"f": {"members": members}},
            "spm_units": {"s": {"members": members}},
            "marital_units": {"m": {"members": members[:2]}} if c["fs"] == "mfj" else {"m": {"members": ["head"]}},
            "households": {"h": {"members": members, "state_code": {"2026": c["state"]}}}}

cases = []
for fs, kids, wages, state in itertools.product(["single", "mfj"], [0, 2], [25000, 60000, 120000, 250000, 600000], ["TX", "CA"]):
    cases.append({"fs": fs, "kids": kids, "wages": wages, "age": 40, "state": state})
cases += [
    {"fs": "mfj", "kids": 0, "wages": 0, "age": 70, "spouse65": True, "ss": 40000, "kg": 30000, "state": "TX"},
    {"fs": "single", "kids": 0, "wages": 45000, "tips": 15000, "age": 30, "state": "TX"},
    {"fs": "mfj", "kids": 1, "wages": 90000, "overtime": 15000, "age": 35, "state": "TX"},
    {"fs": "mfj", "kids": 2, "wages": 300000, "propTax": 15000, "mortInt": 24000, "age": 45, "state": "NJ"},
    {"fs": "mfj", "kids": 0, "wages": 0, "bus": 200000, "age": 50, "state": "TX"},
    {"fs": "mfj", "kids": 0, "wages": 120000, "interest": 8000, "div": 25000, "kg": 15000, "age": 50, "state": "TX"},
    {"fs": "mfj", "kids": 0, "wages": 0, "age": 70, "spouse65": True, "ss": 45000, "interest": 6000, "taxex": 12000, "div": 10000, "age": 70, "state": "TX"},
    {"fs": "single", "kids": 0, "wages": 250000, "interest": 20000, "div": 60000, "kg": 40000, "age": 45, "state": "TX"},
    {"fs": "single", "kids": 0, "wages": 1500000, "kg": 500000, "propTax": 30000, "age": 55, "state": "NY"},
]
out = []
for c in cases:
    sim = Simulation(situation=situation(c))
    out.append({**c, "pe_income_tax": float(sim.calculate("income_tax", 2026)[0]),
                "pe_state_tax": float(sim.calculate("state_income_tax", 2026)[0]),
                "pe_agi": float(sim.calculate("adjusted_gross_income", 2026)[0])})
json.dump(out, open(sys.argv[1], "w"), indent=1)
print(len(out), "cases")
