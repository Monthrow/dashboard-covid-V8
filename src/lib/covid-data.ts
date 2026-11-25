// Pure data preparation + aggregation for the COVID-19 Indonesia dataset.

export type Level = "Country" | "Province";

export interface Row {
  t: number; // UTC ms at 00:00
  key: string; // YYYY-MM-DD
  iso: string;
  location: string;
  level: string;
  province: string;
  island: string | null;
  city: string | null;
  nc: number; nd: number; nr: number; na: number;
  tc: number; td: number; tr: number; ta: number;
  pop: number | null;
  density: number | null;
  area: number | null;
  lat: number | null;
  lng: number | null;
  cfr: number | null;
  crr: number | null;
  gfc: number | null;
}

export interface Dataset {
  fileName: string;
  rows: Row[];
  columns: string[];
  rawRowCount: number;
  invalidRows: number;
  invalidReasons: Record<string, number>;
  dates: string[]; // sorted unique keys
  minKey: string;
  maxKey: string;
  levels: string[];
  provinces: string[];
  islands: string[];
  byLocation: Map<string, Row[]>; // sorted by t
  byLocationKey: Map<string, Map<string, Row>>;
  nationalName: string;
  /** True when Province rows carry a "City or Regency" value (population-share split per city). */
  cityMode: boolean;
  /** province → sorted city/regency names */
  cities: Map<string, string[]>;
  /** `${province}|${city}` → city rows as stored in the file, sorted by t */
  byCity: Map<string, CityRow[]>;
}

export interface CityRow { t: number; key: string; city: string; province: string; nc: number; nd: number; nr: number; tc: number; td: number; tr: number; ta: number; pop: number }
export const cityKey = (province: string, city: string) => `${province}|${city}`;

export const REQUIRED_COLUMNS = [
  "Date", "Location", "Location Level", "New Cases", "New Deaths", "New Recovered",
  "Total Cases", "Total Deaths", "Total Recovered", "Total Active Cases",
];

const DAY = 86400000;
export const keyOf = (t: number) => new Date(t).toISOString().slice(0, 10);
export const tOf = (key: string) => Date.parse(key + "T00:00:00Z");
export const addDays = (key: string, n: number) => keyOf(tOf(key) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((tOf(b) - tOf(a)) / DAY);

/**
 * The source file stores dates two ways: text "M/D/YYYY" and real Excel dates.
 * The Excel dates were created by a locale mis-read (month and day swapped) —
 * e.g. text "3/1/2020" became 3 Jan 2020. We swap day/month back for those.
 */
export function parseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const mo = Number(m[1]), d = Number(m[2]), y = Number(m[3]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return Date.UTC(y, mo - 1, d);
    }
    const iso = Date.parse(v);
    return Number.isFinite(iso) ? iso - (iso % DAY) : null;
  }
  let y: number, mo: number, d: number;
  if (v instanceof Date) {
    y = v.getFullYear(); mo = v.getMonth() + 1; d = v.getDate();
  } else if (typeof v === "number") {
    const dt = new Date(Math.round((v - 25569) * DAY));
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  } else return null;
  // A stored day above 12 cannot be a swapped month, so the date is already correct.
  if (d > 12) return Date.UTC(y, mo - 1, d);
  // swap: stored day is the real month
  return Date.UTC(y, d - 1, mo);
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function buildDataset(fileName: string, raw: Record<string, unknown>[], columns: string[]): Dataset {
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) throw new Error(`Kolom wajib tidak ditemukan: ${missing.join(", ")}`);
  const reasons: Record<string, number> = {};
  const bad = (r: string) => (reasons[r] = (reasons[r] ?? 0) + 1);
  const rows: Row[] = [];
  for (const r of raw) {
    const t = parseDate(r["Date"]);
    if (t == null) { bad("Tanggal tidak valid"); continue; }
    const location = String(r["Location"] ?? "").trim();
    if (!location) { bad("Lokasi kosong"); continue; }
    const nc = num(r["New Cases"]), nd = num(r["New Deaths"]), nr = num(r["New Recovered"]);
    const tc = num(r["Total Cases"]), td = num(r["Total Deaths"]), tr = num(r["Total Recovered"]), ta = num(r["Total Active Cases"]);
    if (nc == null || nd == null || nr == null || tc == null || td == null || tr == null || ta == null) { bad("Nilai numerik utama kosong/tidak valid"); continue; }
    let lat = num(r["Latitude"]), lng = num(r["Longitude"]);
    if (lat == null || lng == null || lat < -12 || lat > 7 || lng < 94 || lng > 142) { lat = null; lng = null; }
    rows.push({
      t, key: keyOf(t), iso: String(r["Location ISO Code"] ?? ""), location,
      level: String(r["Location Level"] ?? "").trim(),
      province: String(r["Province"] ?? location).trim() || location,
      island: (r["Island"] as string) ? String(r["Island"]).trim() : null,
      city: r["City or Regency"] != null && String(r["City or Regency"]).trim() && !/^seluruh/i.test(String(r["City or Regency"]).trim()) ? String(r["City or Regency"]).trim() : null,
      nc, nd, nr, na: num(r["New Active Cases"]) ?? nc - nd - nr,
      tc, td, tr, ta,
      pop: num(r["Population"]), density: num(r["Population Density"]), area: num(r["Area (km2)"]),
      lat, lng, cfr: num(r["Case Fatality Rate"]), crr: num(r["Case Recovered Rate"]),
      gfc: num(r["Growth Factor of New Cases"]),
    });
  }
  if (!rows.length) throw new Error("Tidak ada baris valid yang dapat dibaca dari file.");
  rows.sort((a, b) => a.t - b.t || a.location.localeCompare(b.location));
  const { cityMode, cities, byCity } = splitCities(rows);
  const byLocation = new Map<string, Row[]>();
  const byLocationKey = new Map<string, Map<string, Row>>();
  for (const r of rows) {
    if (!byLocation.has(r.location)) { byLocation.set(r.location, []); byLocationKey.set(r.location, new Map()); }
    byLocation.get(r.location)?.push(r);
    byLocationKey.get(r.location)?.set(r.key, r);
  }
  const dates = [...new Set(rows.map((r) => r.key))].sort();
  const minKey = dates[0], maxKey = dates.at(-1);
  if (!minKey || !maxKey) throw new Error("Tidak ada tanggal valid dalam dataset.");
  const levels = [...new Set(rows.map((r) => r.level))];
  const provinces = [...new Set(rows.filter((r) => r.level === "Province").map((r) => r.location))].sort();
  const islands = [...new Set(rows.flatMap((r) => r.level === "Province" && r.island ? [r.island] : []))].sort();
  const nationalName = rows.find((r) => r.level === "Country")?.location ?? "Indonesia";
  return {
    fileName, rows, columns, rawRowCount: raw.length, invalidRows: raw.length - rows.length,
    invalidReasons: reasons, dates, minKey, maxKey,
    levels, provinces, islands, byLocation, byLocationKey, nationalName, cityMode, cities, byCity,
  };
}

/**
 * City-split files store, for each province and date, one city's share of the
 * province figures (share = city population ÷ sum of the province's city populations).
 * Keep those city rows for the city level, and scale each province row back up
 * (value ÷ share) so province, island and national views keep province totals.
 */
function splitCities(rows: Row[]) {
  const prov = rows.filter((r) => r.level === "Province");
  const withCity = prov.filter((r) => r.city && r.pop && r.pop > 0);
  const cityMode = prov.length > 0 && withCity.length / prov.length > 0.5;
  const cities = new Map<string, string[]>();
  const byCity = new Map<string, CityRow[]>();
  if (!cityMode) return { cityMode, cities, byCity };
  const cityPop = new Map<string, number>();
  for (const r of withCity) { const k = cityKey(r.location, r.city!); if (!cityPop.has(k)) cityPop.set(k, r.pop!); }
  const provPop = new Map<string, number>();
  for (const [k, p] of cityPop) { const pv = k.split("|")[0]!; provPop.set(pv, (provPop.get(pv) ?? 0) + p); }
  for (const r of withCity) {
    const k = cityKey(r.location, r.city!);
    const total = provPop.get(r.location) ?? 0;
    const share = total > 0 ? (cityPop.get(k) ?? 0) / total : 0;
    if (share <= 0) continue;
    if (!byCity.has(k)) byCity.set(k, []);
    byCity.get(k)!.push({ t: r.t, key: r.key, city: r.city!, province: r.location, nc: r.nc, nd: r.nd, nr: r.nr, tc: r.tc, td: r.td, tr: r.tr, ta: r.ta, pop: cityPop.get(k)! });
    const up = (v: number) => Math.round(v / share);
    r.nc = up(r.nc); r.nd = up(r.nd); r.nr = up(r.nr); r.na = up(r.na);
    r.tc = up(r.tc); r.td = up(r.td); r.tr = up(r.tr); r.ta = up(r.ta);
    r.pop = total;
    r.cfr = r.tc > 0 ? r.td / r.tc : r.cfr;
    r.crr = r.tc > 0 ? r.tr / r.tc : r.crr;
  }
  for (const k of byCity.keys()) {
    const [pv, c] = k.split("|") as [string, string];
    cities.set(pv, [...(cities.get(pv) ?? []), c]);
  }
  for (const list of cities.values()) list.sort((a, b) => a.localeCompare(b));
  return { cityMode, cities, byCity };
}

// ---------- Region drill-down ----------
export type RegionMetric = "tc" | "nc" | "td";
export interface CityValue { city: string; value: number; tc: number; td: number; tr: number; ta: number; pop: number; date: string; share: number }

/** City values from the city's own rows. Cumulative: latest row on/before end. New cases: growth of the city's total over the period. */
export function cityValues(ds: Dataset, province: string, f: Pick<Filters, "start" | "end">, metric: RegionMetric): CityValue[] {
  const list = ds.cities.get(province) ?? [];
  const totalPop = list.reduce((a, c) => a + (ds.byCity.get(cityKey(province, c))?.[0]?.pop ?? 0), 0);
  const out: CityValue[] = [];
  for (const c of list) {
    const rs = ds.byCity.get(cityKey(province, c)) ?? [];
    let last: CityRow | undefined, before: CityRow | undefined;
    for (const r of rs) { if (r.key <= f.end) last = r; if (r.key < f.start) before = r; }
    if (!last) continue;
    const value = metric === "nc" ? last.tc - (before?.tc ?? 0) : last[metric];
    out.push({ city: c, value, tc: last.tc, td: last.td, tr: last.tr, ta: last.ta, pop: last.pop, date: last.key, share: totalPop > 0 ? last.pop / totalPop : 0 });
  }
  return out;
}

export const citySeries = (ds: Dataset, province: string, city: string, start: string, end: string) =>
  (ds.byCity.get(cityKey(province, city)) ?? []).filter((r) => r.key >= start && r.key <= end);

export function islandValues(ds: Dataset, f: Filters, metric: RegionMetric) {
  const m = new Map<string, number>();
  for (const p of provinceValues(ds, { ...f, island: "" }, metric)) if (p.island) m.set(p.island, (m.get(p.island) ?? 0) + p.value);
  return [...m].map(([island, value]) => ({ island, value }));
}

// ---------- Heatmap classes ----------
/** Quantile upper bounds for `n` color classes (last bound = max). */
export function heatBreaks(values: number[], n = 5): number[] {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return [];
  return Array.from({ length: n }, (_, i) => v[Math.min(v.length - 1, Math.ceil(((i + 1) / n) * v.length) - 1)]!);
}
/** 1-based class for a value given heatBreaks output. */
export function heatClass(value: number, breaks: number[]): number {
  const i = breaks.findIndex((b) => value <= b);
  return i === -1 ? breaks.length : i + 1;
}

// ---------- Aggregation ----------

export interface Filters {
  start: string;
  end: string;
  level: Level;
  province: string; // "" = all
  island: string; // "" = all
  indicator: MetricKey;
}

export type MetricKey = "nc" | "nd" | "nr" | "tc" | "td" | "tr" | "ta";
export const METRICS: Record<MetricKey, { label: string; col: string; cumulative: boolean }> = {
  nc: { label: "Kasus Baru", col: "New Cases", cumulative: false },
  nd: { label: "Kematian Baru", col: "New Deaths", cumulative: false },
  nr: { label: "Kesembuhan Baru", col: "New Recovered", cumulative: false },
  tc: { label: "Total Kasus", col: "Total Cases", cumulative: true },
  td: { label: "Total Kematian", col: "Total Deaths", cumulative: true },
  tr: { label: "Total Kesembuhan", col: "Total Recovered", cumulative: true },
  ta: { label: "Kasus Aktif", col: "Total Active Cases", cumulative: true },
};

export interface Point { key: string; t: number; nc: number; nd: number; nr: number; tc: number; td: number; tr: number; ta: number; n: number }

/** Locations that make up the current scope (never mixes national + province rows). */
export function scopeLocations(ds: Dataset, f: Pick<Filters, "level" | "province" | "island">): string[] {
  if (f.province) return [f.province];
  if (f.level === "Country" && !f.island) return [ds.nationalName];
  return ds.provinces.filter((p) => !f.island || ds.byLocation.get(p)?.[0]?.island === f.island);
}

export function scopeLabel(ds: Dataset, f: Pick<Filters, "level" | "province" | "island">) {
  if (f.province) return f.province;
  if (f.level === "Country" && !f.island) return `${ds.nationalName} (nasional)`;
  return f.island ? `Provinsi di Pulau ${f.island}` : "Seluruh provinsi (dijumlahkan)";
}

/** One row per date per location (last row wins), sorted by date. Cached per dataset. */
const dayRowsCache = new WeakMap<Dataset, Map<string, Row[]>>();
function dayRows(ds: Dataset, loc: string): Row[] {
  let c = dayRowsCache.get(ds);
  if (!c) { c = new Map(); dayRowsCache.set(ds, c); }
  let a = c.get(loc);
  if (!a) { a = [...(ds.byLocationKey.get(loc)?.values() ?? [])].sort((x, y) => x.t - y.t); c.set(loc, a); }
  return a;
}

/** Latest row on or before `key` (rows sorted by date). */
function lastOnOrBefore(a: Row[], key: string): Row | undefined {
  let lo = 0, hi = a.length - 1, res: Row | undefined;
  while (lo <= hi) { const mid = (lo + hi) >> 1; const r = a[mid]!; if (r.key <= key) { res = r; lo = mid + 1; } else hi = mid - 1; }
  return res;
}

const emptyPoint = (key: string): Point => ({ key, t: tOf(key), nc: 0, nd: 0, nr: 0, tc: 0, td: 0, tr: 0, ta: 0, n: 0 });

/**
 * Sums locations per date. Daily values (New …) count only rows on that date; cumulative
 * values (Total …) carry each location's latest value forward, so a date where only some
 * locations reported (e.g. one manually added row) still gives correct totals.
 * Dates before every location has reported once are left out (unless none qualify).
 */
function combinedSeries(ds: Dataset, locs: string[], start: string, end: string): Point[] {
  const arrs = locs.map((l) => dayRows(ds, l));
  const keys = new Set<string>();
  for (const a of arrs) for (const r of a) if (r.key >= start && r.key <= end) keys.add(r.key);
  const dates = [...keys].sort();
  const idx = arrs.map(() => 0);
  const last: (Row | undefined)[] = arrs.map(() => undefined);
  const full: Point[] = [], partial: Point[] = [];
  for (const k of dates) {
    const p = emptyPoint(k);
    let started = true;
    arrs.forEach((a, i) => {
      while (idx[i]! < a.length && a[idx[i]!]!.key <= k) last[i] = a[idx[i]!++];
      const r = last[i];
      if (!r) { started = false; return; }
      if (r.key === k) { p.nc += r.nc; p.nd += r.nd; p.nr += r.nr; p.n++; }
      p.tc += r.tc; p.td += r.td; p.tr += r.tr; p.ta += r.ta;
    });
    (started ? full : partial).push(p);
  }
  return full.length || locs.length === 1 ? full : partial;
}

/**
 * National series. Uses the national (Country) rows; on dates that only have province rows
 * (e.g. data added for one province after the last national row) the national figure is
 * derived from the latest national row plus the provinces' change since that date.
 */
function nationalSeries(ds: Dataset, start: string, end: string): Point[] {
  const nat = dayRows(ds, ds.nationalName);
  const out = combinedSeries(ds, [ds.nationalName], start, end);
  if (!nat.length) return out;
  const natKeys = new Set(nat.map((r) => r.key));
  const provs = ds.provinces.map((p) => dayRows(ds, p));
  const extra = new Set<string>();
  for (const a of provs) for (const r of a) if (r.key >= start && r.key <= end && !natKeys.has(r.key) && r.key > nat[0]!.key) extra.add(r.key);
  if (!extra.size) return out;
  for (const k of extra) {
    const base = lastOnOrBefore(nat, k)!;
    const p = emptyPoint(k);
    p.tc = base.tc; p.td = base.td; p.tr = base.tr; p.ta = base.ta; p.n = 1;
    for (const a of provs) {
      const now = lastOnOrBefore(a, k);
      if (!now) continue;
      if (now.key === k) { p.nc += now.nc; p.nd += now.nd; p.nr += now.nr; }
      const then = lastOnOrBefore(a, base.key);
      p.tc += now.tc - (then?.tc ?? 0); p.td += now.td - (then?.td ?? 0);
      p.tr += now.tr - (then?.tr ?? 0); p.ta += now.ta - (then?.ta ?? 0);
    }
    out.push(p);
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Daily series for the scope (never mixes national + province rows). */
export function series(ds: Dataset, locs: string[], start: string, end: string): Point[] {
  if (locs.length === 1 && locs[0] === ds.nationalName && ds.provinces.length) return nationalSeries(ds, start, end);
  return combinedSeries(ds, locs, start, end);
}

/** Latest point on or before `key`. */
export function pointAt(ds: Dataset, locs: string[], key: string): Point | null {
  const s = series(ds, locs, ds.minKey, key);
  return s.at(-1) ?? null;
}

export const sumOf = (s: Point[], k: "nc" | "nd" | "nr") => s.reduce((a, p) => a + p[k], 0);

export interface Change { prev: number; diff: number; pct: number | null }
export function change(curr: number, prev: number | null | undefined): Change | null {
  if (prev == null || !Number.isFinite(prev)) return null;
  return { prev, diff: curr - prev, pct: prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : null };
}

export interface ProvinceValue { province: string; value: number; island: string | null; lat: number | null; lng: number | null; tc: number; td: number; date: string }

/** Per-province values. Cumulative metrics: value at end date. Daily: sum over period. "cfr": td/tc at end. */
export function provinceValues(ds: Dataset, f: Filters, metric: MetricKey | "cfr"): ProvinceValue[] {
  const res: ProvinceValue[] = [];
  for (const p of ds.provinces) {
    const rs = ds.byLocation.get(p);
    if (!rs) continue;
    if (f.island && rs[0]?.island !== f.island) continue;
    const inRange = rs.filter((r) => r.key >= f.start && r.key <= f.end);
    const upto = rs.filter((r) => r.key <= f.end);
    const last = upto[upto.length - 1];
    if (!last) continue;
    let value: number;
    if (metric === "cfr") value = last.tc > 0 ? (last.td / last.tc) * 100 : 0;
    else if (METRICS[metric].cumulative) value = last[metric];
    else value = inRange.reduce((a, r) => a + r[metric], 0);
    const geo = rs.find((r) => r.lat != null);
    res.push({ province: p, value, island: rs[0]?.island ?? null, lat: geo?.lat ?? null, lng: geo?.lng ?? null, tc: last.tc, td: last.td, date: last.key });
  }
  return res;
}

// ---------- Time drill-down ----------
export interface Bucket { id: string; label: string; nc: number; nd: number; nr: number; tc: number; td: number; tr: number; ta: number; lastKey: string }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const monthName = (m: number) => MONTHS[m - 1];

/** Daily metrics are summed; cumulative metrics take the last valid date in the bucket. */
export function bucketize(s: Point[], by: "year" | "month" | "day"): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const p of s) {
    const id = by === "year" ? p.key.slice(0, 4) : by === "month" ? p.key.slice(0, 7) : p.key;
    const label = by === "year" ? id : by === "month" ? `${monthName(+id.slice(5, 7))} ${id.slice(0, 4)}` : `${p.key.slice(8, 10)}/${p.key.slice(5, 7)}`;
    let b = map.get(id);
    if (!b) { b = { id, label, nc: 0, nd: 0, nr: 0, tc: 0, td: 0, tr: 0, ta: 0, lastKey: "" }; map.set(id, b); }
    b.nc += p.nc; b.nd += p.nd; b.nr += p.nr;
    if (p.key >= b.lastKey) { b.lastKey = p.key; b.tc = p.tc; b.td = p.td; b.tr = p.tr; b.ta = p.ta; }
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// ---------- Formatting ----------
const nf = new Intl.NumberFormat("id-ID");
const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
export const fmt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : nf.format(Math.round(n)));
export const fmtDec = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : nf1.format(n));
export const fmtPct = (n: number | null | undefined, sign = true) =>
  n == null || !Number.isFinite(n) ? "—" : `${sign && n > 0 ? "+" : ""}${nf1.format(n)}%`;
export const fmtDate = (key: string) => (key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : "—");
export const fmtCompact = (n: number) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function toCsv(rows: Record<string, unknown>[]): string {
  const first = rows[0];
  if (!first) return "";
  const cols = Object.keys(first);
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export const rowToExport = (r: Row) => ({
  Date: fmtDate(r.key), Location: r.location, "Location Level": r.level, Island: r.island ?? "", "City or Regency": r.city ?? "",
  "New Cases": r.nc, "New Deaths": r.nd, "New Recovered": r.nr, "Total Cases": r.tc, "Total Deaths": r.td,
  "Total Recovered": r.tr, "Total Active Cases": r.ta, Population: r.pop ?? "", Latitude: r.lat ?? "", Longitude: r.lng ?? "",
  "Case Fatality Rate": r.cfr ?? "", "Case Recovered Rate": r.crr ?? "",
});
