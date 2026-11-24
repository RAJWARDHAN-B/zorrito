import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendRow, readSheet, updateCells } from "@/lib/google-sheets";

vi.mock("google-auth-library", () => ({
  JWT: class {
    async getRequestHeaders() { return new Headers({ Authorization: "Bearer mock-token" }); }
  },
}));

beforeEach(() => {
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "service@example.com");
  vi.stubEnv("GOOGLE_PRIVATE_KEY", "test");
  vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet");
  vi.stubEnv("GOOGLE_ALLOWED_TABS", "Contacts");
  vi.stubEnv("ZORITTO_API_KEY", "test-key-123456789012345678901234567890");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Sheets client", () => {
  it("quotes tab names, bounds the grid, and reads formatted values", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ sheets: [{ properties: { title: "Owner's", gridProperties: { rowCount: 20, columnCount: 3 } } }] }))
      .mockResolvedValueOnce(Response.json({ values: [["id", "name"], ["a", "Alice"]] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await readSheet("Owner's")).toEqual([["id", "name"], ["a", "Alice"]]);
    expect(decodeURIComponent(fetchMock.mock.calls[1][0])).toContain("'Owner''s'!A1:C20");
  });

  it("rejects grids exceeding the documented limits before reading data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ sheets: [{ properties: { title: "Contacts", gridProperties: { rowCount: 10002, columnCount: 3 } } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readSheet("Contacts")).rejects.toMatchObject({ code: "SHEET_TOO_LARGE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects provider responses larger than the response limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("x".repeat(4 * 1024 * 1024 + 1)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readSheet("Contacts")).rejects.toMatchObject({ code: "SHEET_TOO_LARGE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses RAW writes and does not retry an uncertain write", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(appendRow("Contacts", ["id", "=1+1"])).rejects.toMatchObject({ code: "SHEETS_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("valueInputOption=RAW");
    fetchMock.mockResolvedValue(Response.json({}));
    await updateCells("Contacts", 2, [[1, "=1+1"]]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ valueInputOption: "RAW", data: [{ values: [["=1+1"]] }] });
  });

  it("retries transient reads up to the configured limit", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = readSheet("Contacts");
    const assertion = expect(promise).rejects.toMatchObject({ code: "SHEETS_ERROR" });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
