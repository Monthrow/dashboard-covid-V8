import { describe, expect, it } from "vitest";
import { COVID_COLUMNS } from "@/lib/covid-schema";
import { deriveRows, normalizeSimpleRows, simpleColumns, type DeriveContext } from "@/lib/record-derive";
import { validateRows } from "@/lib/record-validation";

const indonesia = {
  record_date: "2022-12-09", location_iso_code: "IDN", location: "Indonesia", location_level: "Country",
  city_or_regency: "Seluruh Kota/Kabupaten (Nasional)", province: "Indonesia (Nasional)", country: "Indonesia", continent: "Asia",
  island: "Kepulauan Indonesia", time_zone: "WIB / WITA / WIT", special_status: "Non-Otoda/Reguler",
  new_cases: 1848, new_deaths: 17, new_recovered: 3465,
  total_cases: 6394340, total_deaths: 157787, total_recovered: 6204241, total_active_cases: 32312,
  population: 265185520, area_km2: "1916907.00", longitude: "113.921327", latitude: "-0.789275",
};
const nat = (o: Partial<DeriveContext> = {}): DeriveContext => ({ prev: indonesia, template: indonesia, city_pops: {}, ...o });
const input = (o = {}) => ({ record_date: "2022-12-10", location: "Indonesia", city_or_regency: null, new_cases: 1000, new_deaths: 10, new_recovered: 2000, ...o });

describe("Tambah Data simple mode", () => {
  it("asks only for date, location, city and the three daily numbers", () => {
    expect(simpleColumns(COVID_COLUMNS).map((c) => c.header)).toEqual(["Date", "Location", "City or Regency", "New Cases", "New Deaths", "New Recovered"]);
  });

  it("adds the new numbers to the previous totals and recalculates the rates", () => {
    const { rows, errors } = deriveRows([input()], [nat()]);
    expect(errors).toEqual([]);
    const r = rows[0]!;
    expect([r["total_cases"], r["total_deaths"], r["total_recovered"]]).toEqual([6395340, 157797, 6206241]);
    expect(r["total_active_cases"]).toBe(6395340 - 157797 - 6206241);
    expect(r["new_active_cases"]).toBe(-1010);
    expect(r["case_fatality_rate"]).toBe(0.0247);
    expect(r["growth_factor_new_cases"]).toBe(0.54);
    expect(r["population"]).toBe(265185520);
    expect(r["island"]).toBe("Kepulauan Indonesia");
    expect(r["city_or_regency"]).toBe("Seluruh Kota/Kabupaten (Nasional)");
  });

  it("produces a row that passes the full 38-column validation", () => {
    const { rows } = deriveRows([input()], [nat()]);
    expect(validateRows([rows[0]!], COVID_COLUMNS).errors).toEqual([]);
  });

  it("chains rows of the same location typed in one batch", () => {
    const { rows } = deriveRows([input({ record_date: "2022-12-11", new_cases: 5 }), input()], [nat(), nat()]);
    expect(rows[1]!["total_cases"]).toBe(6395340);
    expect(rows[0]!["total_cases"]).toBe(6395345);
  });

  it("rescales a city-split province to the chosen city's population share", () => {
    const base = { ...indonesia, location: "Aceh", location_level: "Province", province: "Aceh", new_cases: 0, new_deaths: 0, new_recovered: 0 };
    const prev = { ...base, city_or_regency: "Kota B", population: 300, total_cases: 3000, total_deaths: 30, total_recovered: 2900 };
    const tplA = { ...base, city_or_regency: "Kota A", population: 100 };
    const { rows, errors } = deriveRows([input({ location: "Aceh", city_or_regency: "Kota A", new_cases: 10, new_deaths: 0, new_recovered: 0 })],
      [{ prev, template: tplA, city_pops: { "Kota A": 100, "Kota B": 300 } }]);
    expect(errors).toEqual([]);
    expect(rows[0]!["total_cases"]).toBe(1010);
    expect(rows[0]!["population"]).toBe(100);
  });

  it("refuses a location with no earlier data", () => {
    const { rows, errors } = deriveRows([input()], [nat({ prev: null })]);
    expect(rows[0]).toBeNull();
    expect(errors.map((e) => [e.row, e.header])).toEqual([[1, "Date"]]);
  });

  it("normalises typed cells and reports missing daily numbers", () => {
    const defs = simpleColumns(COVID_COLUMNS);
    const r = normalizeSimpleRows([{ record_date: "10/12/2022", location: "jawa barat", new_cases: "1.000", new_deaths: "", new_recovered: "3" }], defs);
    expect(r.cells[0]?.["record_date"]).toBe("2022-12-10");
    expect(r.cells[0]?.["location"]).toBe("Jawa Barat");
    expect(r.errors.map((e) => e.header)).toEqual(["New Deaths"]);
  });
});
