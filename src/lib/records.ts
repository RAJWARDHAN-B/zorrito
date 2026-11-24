import { randomUUID } from "node:crypto";
import { AppError, badRequest } from "@/lib/errors";
import { appendRow, readFormulaRow, readSheet, updateCells } from "@/lib/google-sheets";
import type { RecordInput } from "@/lib/http";

type Cell = string | number | boolean;
type SheetRecord = Record<string, Cell>;
type ParsedRow = { rowNumber: number; record: SheetRecord };

function invalidSheet() {
  return new AppError(422, "INVALID_SHEET", "Worksheet must have unique headers and unique, non-empty record IDs.");
}

export function parseSheet(values: Cell[][]) {
  const headers = values[0]?.map(String) ?? [];
  if (
    headers.length === 0 ||
    headers.some((header) => !header.trim() || header !== header.trim() || header.length > 100) ||
    new Set(headers).size !== headers.length ||
    !headers.includes("id")
  ) throw invalidSheet();
  const ids = new Set<string>();
  const rows: ParsedRow[] = [];
  for (let index = 1; index < values.length; index++) {
    const row = values[index];
    if (row.every((value) => value === "")) continue;
    if (row.length > headers.length) throw invalidSheet();
    const record = Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""]));
    const id = String(record.id);
    if (!id.trim() || ids.has(id)) throw invalidSheet();
    ids.add(id);
    rows.push({ rowNumber: index + 1, record });
  }
  return { headers, rows };
}

function validateFields(headers: string[], input: RecordInput) {
  const keys = Object.keys(input);
  if (keys.includes("id") || keys.some((key) => !headers.includes(key))) {
    throw badRequest("Record contains an unknown or protected field.");
  }
}

function normalize(value: RecordInput[string]): Cell {
  return value === null ? "" : value;
}

export async function listRecords(tab: string, limit: number, offset: number, search?: { field: string; value: string; match: "exact" | "contains" }) {
  const { headers, rows } = parseSheet(await readSheet(tab));
  if (search && !headers.includes(search.field)) throw badRequest("Unknown search field.");
  const filtered = search
    ? rows.filter(({ record }) => {
        const value = String(record[search.field]).toLocaleLowerCase();
        const query = search.value.toLocaleLowerCase();
        return search.match === "exact" ? value === query : value.includes(query);
      })
    : rows;
  return {
    headers,
    records: filtered.slice(offset, offset + limit).map(({ record }) => record),
    pagination: { limit, offset, total: filtered.length },
  };
}

export async function createRecord(tab: string, input: RecordInput) {
  const values = await readSheet(tab);
  const { headers } = parseSheet(values);
  validateFields(headers, input);
  if (values.length >= 10001) throw new AppError(422, "SHEET_TOO_LARGE", "Worksheet has reached the record limit.");
  const id = randomUUID();
  const row = headers.map((header) => header === "id" ? id : normalize(input[header] ?? ""));
  await appendRow(tab, row);
  return { id };
}

export async function updateRecord(tab: string, id: string, input: RecordInput) {
  const { headers, rows } = parseSheet(await readSheet(tab));
  validateFields(headers, input);
  const found = rows.find(({ record }) => String(record.id) === id);
  if (!found) throw new AppError(404, "RECORD_NOT_FOUND", "Record not found.");
  const formulas = await readFormulaRow(tab, found.rowNumber, headers.length);
  const entries: [number, Cell][] = Object.entries(input).map(([field, value]) => [headers.indexOf(field), normalize(value)]);
  if (entries.some(([column]) => typeof formulas[column] === "string" && formulas[column].startsWith("="))) {
    throw new AppError(422, "FORMULA_CELL", "Formula cells cannot be edited.");
  }
  await updateCells(tab, found.rowNumber, entries);
  return { id };
}
