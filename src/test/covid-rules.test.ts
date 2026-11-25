import { describe, expect, it } from "vitest";
import { parseDate, keyOf, buildDataset, series, bucketize, provinceValues, cityValues, heatBreaks, heatClass } from "@/lib/covid-data";
import { simulate } from "@/lib/whatif";

describe("date parsing", () => {
  it("parses text M/D/YYYY", () => expect(parseDate("3/13/2020")).toBe(Date.UTC(2020, 2, 13)));
  it("swaps day/month of mis-read Excel dates", () => expect(parseDate(new Date(2020, 0, 3))).toBe(Date.UTC(2020, 2, 1)));
});

const cols = ["Date", "Location", "Location Level", "New Cases", "New Deaths", "New Recovered", "Total Cases", "Total Deaths", "Total Recovered", "Total Active Cases", "Island"];
const mk = (Date: string, Location: string, lvl: string, nc: number, tc: number) => ({
  Date, Location, "Location Level": lvl, "New Cases": nc, "New Deaths": 0, "New Recovered": 0, "Total Cases": tc, "Total Deaths": 0, "Total Recovered": 0, "Total Active Cases": tc, Island: "Jawa",
});
const ds = buildDataset("t.xlsx", [
  mk("3/1/2020", "Indonesia", "Country", 10, 10), mk("3/2/2020", "Indonesia", "Country", 5, 15),
  mk("3/1/2020", "A", "Province", 4, 4), mk("3/2/2020", "A", "Province", 2, 6),
  mk("3/1/2020", "B", "Province", 6, 6), mk("3/2/2020", "B", "Province", 3, 9),
  { ...mk("bad", "B", "Province", 1, 1) },
], cols);

describe("aggregation", () => {
  it("counts invalid rows", () => expect(ds.invalidRows).toBe(1));
  it("cumulative KPI uses value at end date, not sum across dates", () => {
    const s = series(ds, [ds.nationalName], ds.minKey, ds.maxKey);
    expect(s.at(-1)?.tc).toBe(15);
  });
  it("cumulative bucket takes last date; daily bucket sums", () => {
    const b = bucketize(series(ds, ["A"], ds.minKey, ds.maxKey), "month")[0];
    expect(b?.tc).toBe(6);
    expect(b?.nc).toBe(6);
  });
  it("province comparison excludes national row", () => {
    const v = provinceValues(ds, { start: ds.minKey, end: ds.maxKey, level: "Province", province: "", island: "", indicator: "tc" }, "tc");
    expect(v.map((x) => x.province).sort()).toEqual(["A", "B"]);
  });
});

describe("what-if", () => {
  it("applies +20% cases to the daily baseline for every simulated day", () => {
    const r = simulate({ avgCases: 100, avgDeaths: 0, avgRecovered: 0, startActive: 0, startTotalCases: 0, startTotalDeaths: 0, startTotalRecovered: 0, casesPct: 20, deathsPct: 0, recoveredPct: 0, days: 7 });
    expect(r.baseline.cases).toBe(700);
    expect(r.scenario.cases).toBeCloseTo(840);
  });
  it("active = start + cases - recovered - deaths", () => {
    const r = simulate({ avgCases: 100, avgDeaths: 10, avgRecovered: 50, startActive: 1000, startTotalCases: 0, startTotalDeaths: 0, startTotalRecovered: 0, casesPct: 0, deathsPct: 0, recoveredPct: 0, days: 14 });
    expect(r.baseline.endActive).toBe(1000 + 14 * 40);
  });
});

describe("dates in the cleaned workbook", () => {
  it("keeps Excel dates whose day is above 12 (13 Mar 2020 stays 13 Mar 2020)", () => expect(parseDate(new Date(2020, 2, 13))).toBe(Date.UTC(2020, 2, 13)));
});

describe("city-split dataset", () => {
  const ccols = [...cols, "City or Regency", "Population"];
  const c = (Date: string, city: string, pop: number, nc: number, tc: number) => ({ ...mk(Date, "P", "Province", nc, tc), "City or Regency": city, Population: pop });
  // Province P: city X has 75% of population, Y 25%. Province totals 100 on 3/1 and 120 on 3/2.
  const cds = buildDataset("c.xlsx", [
    mk("3/1/2020", "Indonesia", "Country", 100, 100), mk("3/2/2020", "Indonesia", "Country", 20, 120),
    c("3/1/2020", "X", 750, 75, 75), c("3/2/2020", "Y", 250, 5, 30), c("3/3/2020", "X", 750, 6, 96),
  ], ccols);
  it("detects city mode and lists the province's cities", () => {
    expect(cds.cityMode).toBe(true);
    expect(cds.cities.get("P")).toEqual(["X", "Y"]);
  });
  it("province value = city value ÷ city population share", () => {
    expect(cds.byLocation.get("P")?.map((r) => r.tc)).toEqual([100, 120, 128]);
  });
  it("city total uses the city's latest row on or before the end date", () => {
    const v = cityValues(cds, "P", { start: "2020-03-01", end: "2020-03-02" }, "tc");
    expect(v.find((x) => x.city === "X")?.tc).toBe(75);
  });
  it("city new cases in a period = growth of the city's total over that period", () => {
    const v = cityValues(cds, "P", { start: "2020-03-02", end: "2020-03-03" }, "nc");
    expect(v.find((x) => x.city === "X")?.value).toBe(21);
  });
});

describe("heatmap classes", () => {
  it("splits 10 provinces into 5 quantile classes, lowest in class 1 and highest in class 5", () => {
    const b = heatBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(b).toEqual([2, 4, 6, 8, 10]);
    expect(heatClass(1, b)).toBe(1);
    expect(heatClass(10, b)).toBe(5);
  });
});

describe("newly added dates are analysed", () => {
  // National rows stop on 3/2; a province row is added for 3/3 (e.g. via Tambah Data).
  const ads = buildDataset("t.xlsx", [
    mk("3/1/2020", "Indonesia", "Country", 10, 10), mk("3/2/2020", "Indonesia", "Country", 5, 15),
    mk("3/1/2020", "A", "Province", 4, 4), mk("3/2/2020", "A", "Province", 2, 6),
    mk("3/1/2020", "B", "Province", 6, 6), mk("3/2/2020", "B", "Province", 3, 9),
    mk("3/3/2020", "A", "Province", 7, 13),
  ], cols);
  it("national KPI moves to the added date and adds the province's increase", () => {
    const end = series(ads, [ads.nationalName], ads.minKey, ads.maxKey).at(-1);
    expect(end?.key).toBe("2020-03-03");
    expect(end?.tc).toBe(22);
    expect(end?.nc).toBe(7);
  });
  it("all-province totals carry forward provinces that did not report on the added date", () => {
    const end = series(ads, ads.provinces, ads.minKey, ads.maxKey).at(-1);
    expect(end?.key).toBe("2020-03-03");
    expect(end?.tc).toBe(13 + 9);
    expect(end?.nc).toBe(7);
  });
});
