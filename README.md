# OBBBA Tax Calculator

A mobile-friendly page that compares a household's 2026 federal income tax under the One Big Beautiful Bill Act (OBBBA) with two counterfactuals:

- **No bill passed**: the 2017 TCJA individual provisions expire after 2025.
- **2025 rules continue**: TCJA as of 2025, indexed for inflation, without the OBBBA's additions.

Details the user doesn't enter (other income, home value, mortgage) come from about 80 similar households in the Federal Reserve's 2025 Survey of Consumer Finances. Each household is run through the tax engine, and the page shows the typical result and the full range.

## Files

- `index.html`: the page (inputs, charts, methodology)
- `engine.js`: federal tax engine with the three regimes as parameter sets, plus a simplified state income tax for the SALT deduction
- `data/scf.json`: one row per SCF family (implicates averaged), in 2026 dollars
- `data/states.json`: 2026 state income tax schedules, property tax rates, and local and sales tax rates
- `prep/build_data.py`: builds both data files from the source downloads
- `prep/pe_cases.py`, `prep/compare_pe.js`: validate the engine against PolicyEngine-US

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Rebuild the data

Download the sources:

- SCF summary extract: https://www.federalreserve.gov/econres/files/scfp2025s.zip (`rscfp2025.dta`)
- SCF full public data: https://www.federalreserve.gov/econres/files/scf2025s.zip (`p25i6.dta`)
- Tax Foundation 2026 state income tax table: https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/
- Property tax rates by state: `data/dw_7B1MN.csv` (Tax Foundation, 2024 ACS)

```bash
python -I prep/build_data.py rscfp2025.dta p25i6.dta 2026-State-Individual-Income-Tax-Rates-Brackets.xlsx data/dw_7B1MN.csv data
```

## Validate against PolicyEngine

The PolicyEngine check covers the OBBBA scenario only. The two counterfactual parameter sets are estimates (pre-2018 amounts carried forward with chained CPI) and were checked by hand.

```bash
pip install policyengine-us   # Python 3.11+
python prep/pe_cases.py pe_cases.json
node prep/compare_pe.js pe_cases.json
```

This is an illustrative estimate, not tax advice.
