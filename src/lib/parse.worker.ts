import * as XLSX from "xlsx";

self.onmessage = (e: MessageEvent<ArrayBuffer>) => {
  try {
    const wb = XLSX.read(e.data, { type: "array", cellDates: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Workbook tidak memiliki sheet.");
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error("Workbook tidak memiliki sheet.");
    const header = (XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 })[0] as string[]) ?? [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
    (self as unknown as Worker).postMessage({ ok: true, rows, columns: header.map((h) => String(h).trim()) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: err instanceof Error ? err.message : "File Excel rusak atau tidak dapat dibaca." });
  }
};
