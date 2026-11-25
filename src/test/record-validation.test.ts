import { describe, expect, it } from "vitest";
import { COVID_COLUMNS, rowIdentity } from "@/lib/covid-schema";
import { normalizeDate, parseNumber, titleCase, validateRows } from "@/lib/record-validation";

const base = {
  record_date: "2022-12-10", location: "Jawa Barat", location_level: "Province",
  new_cases: "10", new_deaths: "0", new_recovered: "5", total_cases: "100", total_deaths: "1", total_recovered: "90", total_active_cases: "9",
};

describe("Tambah Data validation", () => {
  it("uses all 38 Excel columns in the file's order", () => {
    expect(COVID_COLUMNS).toHaveLength(38);
    expect(COVID_COLUMNS[0]?.header).toBe("Date");
    expect(COVID_COLUMNS.at(-1)?.header).toBe("Growth Factor of New Deaths");
  });

  it("normalises capitalisation and extra spaces of known values", () => {
    const r = validateRows([{ ...base, location: "  JAWA   BARAT ", island: "jAwA", location_level: "province" }], COVID_COLUMNS);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.["location"]).toBe("Jawa Barat");
    expect(r.rows[0]?.["island"]).toBe("Jawa");
    expect(r.rows[0]?.["location_level"]).toBe("Province");
  });

  it("maps JAKARTA to the dataset's DKI Jakarta and title-cases city names", () => {
    const r = validateRows([{ ...base, location: "JAKARTA", city_or_regency: "kota JAKARTA pusat" }], COVID_COLUMNS);
    expect(r.rows[0]?.["location"]).toBe("DKI Jakarta");
    expect(r.rows[0]?.["city_or_regency"]).toBe("Kota Jakarta Pusat");
  });

  it("converts numbers written as text and dates to YYYY-MM-DD", () => {
    expect(parseNumber("1.234.567", true)).toBe(1234567);
    expect(parseNumber("90,54", false)).toBe(90.54);
    expect(normalizeDate("10/12/2022")).toBe("2022-12-10");
    expect(normalizeDate("31/02/2022")).toBeNull();
    expect(titleCase("jAkArTa")).toBe("Jakarta");
  });

  it("reports row, column and reason for wrong types", () => {
    const r = validateRows([base, { ...base, record_date: "2022-12-11", new_cases: "sepuluh", total_cases: "" }], COVID_COLUMNS);
    expect(r.errors.map((e) => [e.row, e.header])).toEqual([[2, "New Cases"], [2, "Total Cases"]]);
    expect(r.errors[0]?.message).toBe("harus berupa angka");
  });

  it("rejects an unknown category value and a negative case count", () => {
    const r = validateRows([{ ...base, location_level: "City", new_deaths: "-3" }], COVID_COLUMNS);
    expect(r.errors.map((e) => e.header).sort()).toEqual(["Location Level", "New Deaths"]);
  });

  it("rejects duplicates within the sheet and against stored rows", () => {
    const existing = new Set([rowIdentity("2022-12-12", "Jawa Barat", "Province", null)]);
    const r = validateRows([base, { ...base }, { ...base, record_date: "2022-12-12" }], COVID_COLUMNS, existing);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3]);
  });
});
