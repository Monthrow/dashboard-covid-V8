import { describe, expect, it } from "vitest";
import { transformRows, recordToRaw, DASHBOARD_COLUMNS } from "@/lib/etl";
import { buildDataset } from "@/lib/covid-data";

const cols = ["Date", "Location", "Location Level", "New Cases", "New Deaths", "New Recovered", "Total Cases", "Total Deaths", "Total Recovered", "Total Active Cases", "Latitude", "Longitude"];
const row = (Date: string, Location: string, lvl = "Province", extra: Record<string, unknown> = {}) => ({
  Date, Location, "Location Level": lvl, "New Cases": 1, "New Deaths": 0, "New Recovered": 0, "Total Cases": 5, "Total Deaths": 0, "Total Recovered": 0, "Total Active Cases": 5, Latitude: -6.2, Longitude: 106.8, ...extra,
});

describe("ETL transform", () => {
  const { records, report } = transformRows([
    row("3/1/2020", "Indonesia", "Country"),
    row("3/1/2020", "DKI Jakarta"),
    row("3/1/2020", "DKI Jakarta"), // duplicate
    row("bad", "Bali"), // invalid date
    row("3/2/2020", "Bali", "Province", { "New Cases": "" }), // missing required value
    row("3/2/2020", "Papua", "Province", { Latitude: 52.1, Longitude: 4.3 }), // outside Indonesia
  ], cols);

  it("removes the duplicate row and keeps one", () => {
    expect(records.filter((r) => r.location === "DKI Jakarta")).toHaveLength(1);
    expect(report.steps.find((s) => s.name === "Duplikasi")?.count).toBe(1);
  });
  it("drops rows with an invalid date or a missing case value", () => {
    expect(records.find((r) => r.location === "Bali")).toBeUndefined();
    expect(report.dropped).toBe(3);
  });
  it("clears coordinates outside Indonesia instead of dropping the row", () => {
    const p = records.find((r) => r.location === "Papua");
    expect(p?.latitude).toBeNull();
    expect(p?.longitude).toBeNull();
  });
  it("separates national and province rows", () => {
    expect(report.after.nationalRows).toBe(1);
    expect(report.after.provinceRows).toBe(2);
  });
  it("loaded records rebuild into the dashboard dataset", () => {
    const ds = buildDataset("etl", records.map(recordToRaw), DASHBOARD_COLUMNS);
    expect(ds.nationalName).toBe("Indonesia");
    expect(ds.provinces).toEqual(["DKI Jakarta", "Papua"]);
  });
});
