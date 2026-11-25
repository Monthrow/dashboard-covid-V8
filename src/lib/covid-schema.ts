// Column structure of the COVID-19 Indonesia dataset, mirroring the MySQL table
// `covid_records` (database/db_covid_indonesia.sql).
// Order and names follow the Excel file exactly.
import columnsJson from "../../api/config/columns.json";

export type ColumnKind = "date" | "int" | "decimal" | "text" | "category";

export interface ColumnDef {
  /** MySQL column name */
  field: string;
  /** Original Excel header */
  header: string;
  kind: ColumnKind;
  required: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Known values; for category columns only these are accepted. */
  values?: string[];
  /** Text columns written as names (e.g. "Jawa Barat") get Title Case. */
  titleCase?: boolean;
  /** Text columns written in capitals (ISO codes). */
  upper?: boolean;
  example: string;
}

// Single source of truth shared with the PHP backend (api/config/columns.json).
export const COVID_COLUMNS: ColumnDef[] = columnsJson as ColumnDef[];

export const COVID_FIELDS = COVID_COLUMNS.map((c) => c.field);
export const COVID_HEADERS = COVID_COLUMNS.map((c) => c.header);

/** Identity of a data row: date + location + city/regency (national "Seluruh …" rows have no city). */
export function rowIdentity(date: string, location: string, level: string | null, city: string | null): string {
  const c = city && level === "Province" && !/^seluruh/i.test(city.trim()) ? city.trim().toLowerCase() : "";
  return `${date}|${location.trim().toLowerCase()}|${c}`;
}
