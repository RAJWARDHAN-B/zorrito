import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getTabs } from "@/app/api/v1/tabs/route";
import { GET as getRecords, POST as postRecord } from "@/app/api/v1/tabs/[tab]/records/route";
import { GET as search } from "@/app/api/v1/tabs/[tab]/search/route";
import { PATCH as patchRecord } from "@/app/api/v1/tabs/[tab]/records/[id]/route";
import { readSheet, appendRow, readFormulaRow, updateCells } from "@/lib/google-sheets";

vi.mock("@/lib/google-sheets", () => ({
  readSheet: vi.fn(),
  readFormulaRow: vi.fn(),
  appendRow: vi.fn(),
  updateCells: vi.fn(),
}));

const key = "test-key-123456789012345678901234567890";
const context = { params: Promise.resolve({ tab: "Contacts" }) };
function request(path: string, method = "GET", body?: string, token = key) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "service@example.com");
  vi.stubEnv("GOOGLE_PRIVATE_KEY", "not-a-real-key");
  vi.stubEnv("GOOGLE_SPREADSHEET_ID", "test-sheet");
  vi.stubEnv("GOOGLE_ALLOWED_TABS", "Contacts,Tasks");
  vi.stubEnv("ZORITTO_API_KEY", key);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(readSheet).mockResolvedValue([["id", "name"], ["1", "Alice"]]);
  vi.mocked(readFormulaRow).mockResolvedValue(["1", "Alice"]);
  vi.mocked(appendRow).mockResolvedValue();
  vi.mocked(updateCells).mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("API routes", () => {
  it("rejects missing and invalid credentials and disallowed tabs", async () => {
    expect((await getTabs(new Request("https://example.test/api/v1/tabs"))).status).toBe(401);
    expect((await getTabs(request("/api/v1/tabs", "GET", undefined, "wrong"))).status).toBe(401);
    expect((await getRecords(request("/api/v1/tabs/Private/records"), { params: Promise.resolve({ tab: "Private" }) })).status).toBe(403);
    expect(readSheet).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination, JSON and oversized bodies", async () => {
    expect((await getRecords(request("/api/v1/tabs/Contacts/records?limit=101"), context)).status).toBe(400);
    expect((await postRecord(request("/api/v1/tabs/Contacts/records", "POST", "{"), context)).status).toBe(400);
    expect((await postRecord(request("/api/v1/tabs/Contacts/records", "POST", JSON.stringify({ name: "x".repeat(17000) })), context)).status).toBe(413);
  });

  it("reads, searches, creates, and updates through authenticated routes", async () => {
    const list = await getRecords(request("/api/v1/tabs/Contacts/records"), context);
    expect(await list.json()).toMatchObject({ success: true, data: { records: [{ id: "1", name: "Alice" }] } });
    const result = await search(request("/api/v1/tabs/Contacts/search?field=name&value=ali"), context);
    expect((await result.json()).data.pagination.total).toBe(1);
    const create = await postRecord(request("/api/v1/tabs/Contacts/records", "POST", JSON.stringify({ name: "=1+1" })), context);
    expect(create.status).toBe(200);
    expect(await create.json()).toMatchObject({ data: { id: "2" } });
    expect(appendRow).toHaveBeenCalledWith("Contacts", ["2", "=1+1"]);
    const patch = await patchRecord(request("/api/v1/tabs/Contacts/records/1", "PATCH", JSON.stringify({ name: "Bob" })), { params: Promise.resolve({ tab: "Contacts", id: "1" }) });
    expect(patch.status).toBe(200);
    expect(updateCells).toHaveBeenCalledWith("Contacts", 2, [[1, "Bob"]]);
  });

  it("does not expose provider errors or log secrets and sheet contents", async () => {
    vi.mocked(readSheet).mockRejectedValue(new Error(`private ${key} Alice`));
    const response = await getRecords(request("/api/v1/tabs/Contacts/records"), context);
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).not.toContain(key);
    expect(body).not.toContain("Alice");
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).not.toContain(key);
    expect(logs).not.toContain("Alice");
  });
});
