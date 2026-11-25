// What-If simulation: transparent arithmetic, not an epidemiological model.
// Baseline = average DAILY new cases/deaths/recovered over the last `refDays`
// days of the selected period. The % change is applied ONCE to that daily
// average and the same adjusted daily value is used for every simulated day
// (constant uplift per day, no compounding).

export interface WhatIfInput {
  avgCases: number;
  avgDeaths: number;
  avgRecovered: number;
  startActive: number;
  startTotalCases: number;
  startTotalDeaths: number;
  startTotalRecovered: number;
  casesPct: number; // -50..100
  deathsPct: number;
  recoveredPct: number;
  days: number; // 7 | 14 | 30
}

export interface WhatIfSide { cases: number; deaths: number; recovered: number; endActive: number; endTotalCases: number; endTotalDeaths: number; endTotalRecovered: number }
export interface WhatIfDay { day: number; baseActive: number; scenActive: number; baseCases: number; scenCases: number }
export interface WhatIfResult { baseline: WhatIfSide; scenario: WhatIfSide; daily: WhatIfDay[] }

export function simulate(i: WhatIfInput): WhatIfResult {
  const sc = { c: i.avgCases * (1 + i.casesPct / 100), d: i.avgDeaths * (1 + i.deathsPct / 100), r: i.avgRecovered * (1 + i.recoveredPct / 100) };
  const daily: WhatIfDay[] = [];
  let ba = i.startActive, sa = i.startActive, bc = 0, scc = 0;
  for (let d = 1; d <= i.days; d++) {
    ba += i.avgCases - i.avgDeaths - i.avgRecovered;
    sa += sc.c - sc.d - sc.r;
    bc += i.avgCases; scc += sc.c;
    daily.push({ day: d, baseActive: ba, scenActive: sa, baseCases: bc, scenCases: scc });
  }
  const side = (c: number, d: number, r: number, act: number): WhatIfSide => ({
    cases: c * i.days, deaths: d * i.days, recovered: r * i.days, endActive: act,
    endTotalCases: i.startTotalCases + c * i.days, endTotalDeaths: i.startTotalDeaths + d * i.days, endTotalRecovered: i.startTotalRecovered + r * i.days,
  });
  return { baseline: side(i.avgCases, i.avgDeaths, i.avgRecovered, ba), scenario: side(sc.c, sc.d, sc.r, sa), daily };
}
