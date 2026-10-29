"""Build the compact data files the calculator page embeds.

Usage:
  python -I prep/build_data.py <rscfp2025.dta> <p25i6.dta> <state_income_tax_2026.xlsx> <property_tax_rates.csv> <out_dir>

Inputs:
  - 2025 SCF summary extract (Stata), federalreserve.gov/econres/files/scfp2025s.zip
  - 2025 SCF full public data set (Stata), federalreserve.gov/econres/files/scf2025s.zip,
    for income items the summary extract combines (interest vs. dividends,
    Social Security vs. pensions)
  - Tax Foundation 2026 state individual income tax rates & brackets (xlsx)
  - Tax Foundation 2024 effective property tax rates by state (datawrapper 7B1MN csv)

Outputs (in out_dir):
  - scf.json     one row per SCF family (5 implicates averaged), 2026 dollars
  - states.json  income tax schedule, property tax rate, local & sales tax by state
"""
import json
import re
import sys

import numpy as np
import pandas as pd

# SCF income is calendar-2024 income in 2025 dollars; move to 2026 dollars.
INCOME_INFLATOR = 1.027
HOME_INFLATOR = 1.02
# The full public file reports 2024 dollars; the summary extract inflates them
# to 2025 dollars by this factor.
FULL_TO_SUMMARY = 1.027027
# Social Security payment frequency codes -> payments per year (X5307/X5312).
SS_FREQ = {4: 12, 5: 4, 6: 1, 12: 6}

SCF_FIELDS = ["w", "age", "mar", "own", "inc", "wage", "bus", "int", "taxex", "div",
              "kg", "ss", "pens", "home", "mort"]


def annual_ss(amount, freq):
    return amount * freq.map(lambda f: SS_FREQ.get(int(f), 12)).where(amount > 0, 0)


def build_scf(summary_path, full_path):
    df = pd.read_stata(summary_path)
    full = pd.read_stata(full_path, columns=["y1", "x5306", "x5307", "x5311", "x5312",
                                             "x5706", "x5708", "x5710"])
    full["ss"] = annual_ss(full.x5306, full.x5307) + annual_ss(full.x5311, full.x5312)
    full = full.rename(columns={"x5706": "taxex", "x5708": "int", "x5710": "div"})
    for c in ["ss", "taxex", "int", "div"]:
        full[c] = full[c].clip(lower=0) * FULL_TO_SUMMARY
    df = df.merge(full[["y1", "ss", "taxex", "int", "div"]], on="y1", validate="1:1")

    num = ["wgt", "age", "income", "wageinc", "bussefarminc", "int", "taxex", "div",
           "kginc", "ssretinc", "ss", "houses", "nh_mort"]
    g = df.groupby("yy1")
    fam = g[num].mean()
    fam["wgt"] = g["wgt"].sum()  # summary-extract WGT is already divided by 5
    fam["married"] = g["married"].agg(lambda s: s.mode().iloc[0])
    fam["own"] = (g["hhouses"].mean() >= 0.5).astype(int)

    # Reported Social Security can't exceed the summary's SS + pension + withdrawals
    # total; everything else in that total is a pension or account withdrawal.
    ss = np.minimum(fam.ss, fam.ssretinc.clip(lower=0))
    pens = fam.ssretinc.clip(lower=0) - ss

    out = pd.DataFrame({
        "w": fam.wgt.round(0),
        "age": fam.age.round(0),
        "mar": (fam.married == 1).astype(int),
        "own": fam.own,
        "inc": fam.income * INCOME_INFLATOR,
        "wage": fam.wageinc.clip(lower=0) * INCOME_INFLATOR,
        "bus": fam.bussefarminc * INCOME_INFLATOR,
        "int": fam["int"] * INCOME_INFLATOR,
        "taxex": fam.taxex * INCOME_INFLATOR,
        "div": fam["div"] * INCOME_INFLATOR,
        "kg": fam.kginc * INCOME_INFLATOR,
        "ss": ss * INCOME_INFLATOR,
        "pens": pens * INCOME_INFLATOR,
        "home": fam.houses * HOME_INFLATOR * fam.own,
        "mort": fam.nh_mort * fam.own,
    })
    # Transfers (mostly non-taxable) are dropped from the tax base but kept in
    # total income, so "inc" stays comparable to what users type in.
    out = out[out.inc > 1000]
    for c in SCF_FIELDS[4:]:
        out[c] = (out[c] / 10).round(0).astype(int) * 10
    out = out.sort_values("inc")
    return {"fields": SCF_FIELDS, "rows": out[SCF_FIELDS].astype(int).values.tolist()}


STATE_ABBR = {
    "Ala.": "AL", "Alaska": "AK", "Ariz.": "AZ", "Ark.": "AR", "Calif.": "CA",
    "Colo.": "CO", "Conn.": "CT", "Del.": "DE", "Fla.": "FL", "Ga.": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Ill.": "IL", "Ind.": "IN", "Iowa": "IA",
    "Kans.": "KS", "Ky.": "KY", "La.": "LA", "Maine": "ME", "Md.": "MD",
    "Mass.": "MA", "Mich.": "MI", "Minn.": "MN", "Miss.": "MS", "Mo.": "MO",
    "Mont.": "MT", "Nebr.": "NE", "Nev.": "NV", "N.H.": "NH", "N.J.": "NJ",
    "N.M.": "NM", "N.Y.": "NY", "N.C.": "NC", "N.D.": "ND", "Ohio": "OH",
    "Okla.": "OK", "Ore.": "OR", "Pa.": "PA", "R.I.": "RI", "S.C.": "SC",
    "S.D.": "SD", "Tenn.": "TN", "Tex.": "TX", "Utah": "UT", "Vt.": "VT",
    "Va.": "VA", "Wash.": "WA", "W.Va.": "WV", "Wis.": "WI", "Wyo.": "WY",
    "D.C.": "DC",
}
STATE_NAME = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee",
    "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
}
# Average local income tax as % of AGI (Tax Foundation footnote a, 2023 data).
LOCAL_RATE = {"AL": 0.0007, "IN": 0.0035, "IA": 0.0008, "KY": 0.0093, "MD": 0.024,
              "MI": 0.0016, "MO": 0.0018, "NY": 0.016, "OH": 0.012, "OR": 0.0018,
              "PA": 0.0099}
# Combined state + average local sales tax rates (approx., 2025).
SALES_RATE = {
    "AL": .0929, "AK": .0182, "AZ": .0852, "AR": .0946, "CA": .0885, "CO": .0786,
    "CT": .0635, "DE": 0, "FL": .07, "GA": .0742, "HI": .045, "ID": .0603, "IL": .0886,
    "IN": .07, "IA": .0694, "KS": .0865, "KY": .06, "LA": .1011, "ME": .055, "MD": .06,
    "MA": .0625, "MI": .06, "MN": .0804, "MS": .0706, "MO": .0839, "MT": 0, "NE": .0697,
    "NV": .0824, "NH": 0, "NJ": .066, "NM": .0762, "NY": .0853, "NC": .07, "ND": .0704,
    "OH": .0724, "OK": .0899, "OR": 0, "PA": .0634, "RI": .07, "SC": .0749, "SD": .0611,
    "TN": .0956, "TX": .082, "UT": .0725, "VT": .0636, "VA": .0577, "WA": .0943,
    "WV": .0659, "WI": .057, "WY": .0544, "DC": .06,
}


def _amount(v):
    """Parse a deduction/exemption cell -> (kind, value): kind 'ded' or 'credit'."""
    s = str(v).strip()
    if s in ("", "nan", "n.a.", "n.a", "none"):
        return ("ded", 0)
    m = re.match(r"\$?([\d,]+)\s*credit", s)
    if m:
        return ("credit", float(m.group(1).replace(",", "")))
    return ("ded", float(s.replace(",", "").replace("$", "")))


def build_states(xlsx, prop_csv):
    df = pd.read_excel(xlsx, "2026", header=None)
    states, cur = {}, None
    for _, r in df.iloc[2:219].iterrows():
        label = str(r[0]).strip()
        if label not in ("nan", "") and not label.startswith("("):
            key = label.split(" (")[0].strip()
            abbr = STATE_ABBR[key]
            cur = states[abbr] = {"single": [], "mfj": [], "raw": r.values[7:12]}
            if str(r[1]).strip() == "none":
                continue
        if cur is None:
            continue
        for col_rate, col_br, fs in ((1, 3, "single"), (4, 6, "mfj")):
            try:
                rate, br = float(r[col_rate]), float(r[col_br])
            except (TypeError, ValueError):
                continue
            if not np.isnan(rate) and not np.isnan(br):
                cur[fs].append([br, rate])

    prop = pd.read_csv(prop_csv, sep=None, engine="python")
    prop_rate = {r["name"].strip(): float(str(r["2024 rate"]).strip("%")) / 100
                 for _, r in prop.iterrows()}

    out = {}
    for abbr, s in states.items():
        sd_s, sd_m, ex_s, ex_m, ex_d = (_amount(v) for v in s["raw"])
        entry = {
            "name": STATE_NAME[abbr],
            "single": s["single"], "mfj": s["mfj"],
            "std": [sd_s[1], sd_m[1]], "stdCredit": sd_s[0] == "credit",
            "ex": [ex_s[1], ex_m[1], ex_d[1]],
            # per item: 1 = nonrefundable credit, 0 = deduction (single, couple, dependent)
            "exCredit": [int(x[0] == "credit") for x in (ex_s, ex_m, ex_d)],
            "prop": prop_rate.get(STATE_NAME[abbr], 0.009),
            "local": LOCAL_RATE.get(abbr, 0),
            "sales": SALES_RATE[abbr],
        }
        if abbr == "WA":  # capital gains only: 7% over $278k, 9% over $1M
            entry.update(single=[], mfj=[], std=[0, 0], capGains=[[278000, 0.07], [1278000, 0.09]])
        out[abbr] = entry
    assert len(out) == 51, len(out)
    return out


def main():
    scf_path, full_path, xlsx, prop_csv, out_dir = sys.argv[1:6]
    scf = build_scf(scf_path, full_path)
    with open(f"{out_dir}/scf.json", "w") as f:
        json.dump(scf, f, separators=(",", ":"))
    st = build_states(xlsx, prop_csv)
    with open(f"{out_dir}/states.json", "w") as f:
        json.dump(st, f, separators=(",", ":"))
    print(f"scf rows: {len(scf['rows'])}, states: {len(st)}")


if __name__ == "__main__":
    main()
