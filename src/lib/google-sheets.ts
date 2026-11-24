import { JWT } from "google-auth-library";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_ROWS = 10001;
const MAX_COLUMNS = 100;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const responseSchema = z.object({
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).optional(),
});
const metadataSchema = z.object({
  sheets: z.array(z.object({
    properties: z.object({
      title: z.string(),
      gridProperties: z.object({ rowCount: z.number(), columnCount: z.number() }).optional(),
    }),
  })).optional(),
});

export type SheetValues = z.infer<typeof responseSchema>["values"];

function providerError() {
  return new AppError(502, "SHEETS_ERROR", "Google Sheets is unavailable or rejected the request.");
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw providerError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new AppError(422, "SHEET_TOO_LARGE", "Google Sheets response exceeds the supported size.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw providerError();
  }
}

async function sheetsRequest(path: string, method: "GET" | "POST", body?: unknown): Promise<unknown> {
  const config = getConfig();
  const auth = new JWT({
    email: config.email,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  let headers: Headers;
  try {
    headers = new Headers(await auth.getRequestHeaders());
  } catch {
    throw providerError();
  }
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const url = `${BASE_URL}/${encodeURIComponent(config.spreadsheetId)}${path}`;
  const attempts = method === "GET" ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
        cache: "no-store",
      });
      if (response.ok) return await readJson(response);
      if ((response.status !== 429 && response.status < 500) || attempt === attempts - 1) {
        throw providerError();
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (attempt === attempts - 1) throw providerError();
    }
    await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt + Math.random() * 100));
  }
  throw providerError();
}

function columnName(index: number) {
  let number = index + 1;
  let name = "";
  while (number > 0) {
    number--;
    name = String.fromCharCode(65 + (number % 26)) + name;
    number = Math.floor(number / 26);
  }
  return name;
}

export function rangeFor(tab: string, start: string, end: string) {
  return `'${tab.replace(/'/g, "''")}'!${start}:${end}`;
}

async function values(range: string, render: "FORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE") {
  const response = await sheetsRequest(`/values/${encodeURIComponent(range)}?valueRenderOption=${render}`, "GET");
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) throw providerError();
  return parsed.data.values ?? [];
}

export async function readSheet(tab: string) {
  const metadata = await sheetsRequest("?fields=sheets(properties(title,gridProperties))", "GET");
  const parsed = metadataSchema.safeParse(metadata);
  if (!parsed.success) throw providerError();
  const sheet = parsed.data.sheets?.find((item) => item.properties.title === tab);
  if (!sheet) throw new AppError(404, "TAB_NOT_FOUND", "Worksheet not found.");
  const grid = sheet.properties.gridProperties;
  if (!grid) throw new AppError(422, "INVALID_SHEET", "Worksheet is not a grid.");
  const { rowCount, columnCount } = grid;
  if (rowCount > MAX_ROWS || columnCount > MAX_COLUMNS || rowCount < 1 || columnCount < 1) {
    throw new AppError(422, "SHEET_TOO_LARGE", "Worksheet exceeds the supported grid size.");
  }
  return values(rangeFor(tab, "A1", `${columnName(columnCount - 1)}${rowCount}`));
}

export async function readFormulaRow(tab: string, rowNumber: number, columnCount: number) {
  return (await values(rangeFor(tab, `A${rowNumber}`, `${columnName(columnCount - 1)}${rowNumber}`), "FORMULA"))[0] ?? [];
}

export async function appendRow(tab: string, row: (string | number | boolean)[]) {
  const range = rangeFor(tab, "A1", `${columnName(row.length - 1)}1`);
  await sheetsRequest(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
    majorDimension: "ROWS",
    values: [row],
  });
}

export async function updateCells(tab: string, rowNumber: number, entries: [number, string | number | boolean][]) {
  await sheetsRequest("/values:batchUpdate", "POST", {
    valueInputOption: "RAW",
    data: entries.map(([column, value]) => ({
      range: rangeFor(tab, `${columnName(column)}${rowNumber}`, `${columnName(column)}${rowNumber}`),
      values: [[value]],
    })),
  });
}
