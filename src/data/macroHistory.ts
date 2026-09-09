import type { MacroHistory } from '../engine/types'

/**
 * Macro history for the rand, inflation and asset returns. Verified against public sources as at
 * 2026-09-09 — see research/macro.md for the full narrative, fact tables and per-figure sourcing/
 * confidence notes (several figures, especially pre-2023 medical-aid/electricity series and the
 * long-run asset-return table, are explicitly flagged there as estimates). Exchange rates are annual
 * averages (USD/ZAR); CPI is annual average % change.
 */
const usdZar: [number, number][] = [
  [1994, 3.55], [1995, 3.63], [1996, 4.30], [1997, 4.61], [1998, 5.53], [1999, 6.11], [2000, 6.94],
  [2001, 8.60], [2002, 10.54], [2003, 7.56], [2004, 6.45], [2005, 6.36], [2006, 6.77], [2007, 7.05],
  [2008, 8.26], [2009, 8.47], [2010, 7.32], [2011, 7.26], [2012, 8.21], [2013, 9.65], [2014, 10.85],
  [2015, 12.76], [2016, 14.71], [2017, 13.31], [2018, 13.23], [2019, 14.45], [2020, 16.46],
  [2021, 14.79], [2022, 16.36], [2023, 18.45], [2024, 18.33], [2025, 17.88],
  // 2026: not a full-year average yet — spot traded ~16.0-16.5 through H1-H2 2026 after SA's Oct 2025
  // FATF exit and the 2025/26 Fitch/S&P rating upgrades; used here as a placeholder for the partial year.
  [2026, 16.2],
]

const saCpi: [number, number][] = [
  [1994, 8.9], [1995, 8.7], [1996, 7.4], [1997, 8.6], [1998, 6.9], [1999, 5.2], [2000, 5.4], [2001, 5.7],
  [2002, 9.2], [2003, 5.8], [2004, 1.4], [2005, 3.4], [2006, 4.7], [2007, 7.1], [2008, 11.5], [2009, 7.1],
  [2010, 4.3], [2011, 5.0], [2012, 5.6], [2013, 5.7], [2014, 6.1], [2015, 4.6], [2016, 6.3], [2017, 5.3],
  [2018, 4.6], [2019, 4.1], [2020, 3.3], [2021, 4.5], [2022, 6.9], [2023, 6.0], [2024, 4.4],
  // 2025 confirmed by Stats SA as the lowest annual average since 2004 (1.4%).
  [2025, 3.2],
  // 2026: not a full annual average yet (Stats SA publishes it in Jan 2027). Monthly y/y prints to July
  // 2026 were 3.1 (Mar), 4.0 (Apr), 4.5 (May), 5.0 (Jun, a 2-year high on fuel prices), 4.3 (Jul) —
  // year-to-date average ~4.2, used here as an ESTIMATE pending the final Stats SA figure.
  [2026, 4.2],
]

const usCpi: [number, number][] = [
  [1994, 2.6], [1995, 2.8], [1996, 3.0], [1997, 2.3], [1998, 1.6], [1999, 2.2], [2000, 3.4], [2001, 2.8],
  [2002, 1.6], [2003, 2.3], [2004, 2.7], [2005, 3.4], [2006, 3.2], [2007, 2.8], [2008, 3.8], [2009, -0.4],
  [2010, 1.6], [2011, 3.2], [2012, 2.1], [2013, 1.5], [2014, 1.6], [2015, 0.1], [2016, 1.3], [2017, 2.1],
  [2018, 2.4], [2019, 1.8], [2020, 1.2], [2021, 4.7], [2022, 8.0], [2023, 4.1], [2024, 2.9], [2025, 2.7],
]

// Weighted-average medical scheme contribution increases (Discovery/Bonitas/Momentum blend). 2024-2026
// are confirmed against scheme announcements (see research/macro.md §8); 2015-2023 are ESTIMATES
// consistent with the well-documented pattern of medical inflation running several points above CPI.
const medicalAidInflation: [number, number][] = [
  [2015, 9.5], [2016, 10.2], [2017, 10.5], [2018, 9.0], [2019, 9.2], [2020, 9.5], [2021, 4.5], [2022, 6.5],
  [2023, 9.0], [2024, 8.0], [2025, 9.6], [2026, 8.6],
]

// NERSA-approved Eskom-direct-customer tariff increases. 2023/24-2026/27 are confirmed against
// Eskom/NERSA releases (see research/macro.md §9); 2019/20-2022/23 are carried over as estimates.
const electricityTariffIncrease: [number, number][] = [
  [2019, 13.8], [2020, 8.8], [2021, 15.6], [2022, 9.6], [2023, 18.65], [2024, 12.7], [2025, 12.74], [2026, 8.76],
]

const pts = (arr: [number, number][], scale = 1) => arr.map(([year, value]) => ({ year, value: value * scale }))

export const MACRO: MacroHistory = {
  usdZarAnnualAvg: pts(usdZar),
  saCpi: pts(saCpi, 0.01),
  usCpi: pts(usCpi, 0.01),
  medicalAidInflation: pts(medicalAidInflation, 0.01),
  electricityTariffIncrease: pts(electricityTariffIncrease, 0.01),
  assetReturns: [
    { asset: 'JSE All Share (total return)', years: 10, nominalZar: 0.10, realZar: 0.05, source: 'https://www.jse.co.za/' },
    { asset: 'SA All Bond Index', years: 10, nominalZar: 0.085, realZar: 0.035, source: 'https://www.jse.co.za/' },
    { asset: 'SA cash (STeFI)', years: 10, nominalZar: 0.065, realZar: 0.015, source: 'https://www.resbank.co.za/' },
    { asset: 'MSCI World in ZAR', years: 10, nominalZar: 0.15, realZar: 0.095, source: 'https://www.msci.com/' },
    { asset: 'S&P 500 in ZAR', years: 10, nominalZar: 0.18, realZar: 0.125, source: 'https://www.spglobal.com/' },
    { asset: 'JSE All Share (total return)', years: 20, nominalZar: 0.12, realZar: 0.065, source: 'https://www.jse.co.za/' },
    { asset: 'MSCI World in ZAR', years: 20, nominalZar: 0.135, realZar: 0.08, source: 'https://www.msci.com/' },
  ],
  asOf: '2026-09-01',
  sources: [
    'https://www.resbank.co.za/en/home/what-we-do/statistics/key-statistics/selected-historical-rates',
    'https://www.statssa.gov.za/?page_id=1854&PPN=P0141',
    'https://www.bls.gov/cpi/',
    'https://www.nersa.org.za/',
  ],
}
