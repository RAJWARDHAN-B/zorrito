import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRecord, listRecords, parseSheet, updateRecord } from "@/lib/records";
import { appendRow, readFormulaRow, readSheet, updateCells } from "@/lib/google-sheets";

vi.mock("@/lib/google-sheets", () => ({
  readSheet: vi.fn(),
  readFormulaRow: vi.fn(),
  appendRow: vi.fn(),
  updateCells: vi.fn(),
}));

const sheet = [
  ["id", "name", "note"],
  ["one", "Alice", "hello"],
  ["two", "Bob", "world"],
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readSheet).mockResolvedValue(sheet);
  vi.mocked(readFormulaRow).mockResolvedValue(["one", "Alice", "hello"]);
  vi.mocked(appendRow).mockResolvedValue();
  vi.mocked(updateCells).mockResolvedValue();
});

describe("worksheet records", () => {
  it("paginates and searches case-insensitively", async () => {
    expect(await listRecords("Contacts", 1, 1)).toMatchObject({
      records: [{ id: "two", name: "Bob" }],
      pagination: { total: 2, limit: 1, offset: 1 },
    });
    expect((await listRecords("Contacts", 50, 0, { field: "name", value: "LIC", match: "contains" })).records)
      .toEqual([{ id: "one", name: "Alice", note: "hello" }]);
    await expect(listRecords("Contacts", 50, 0, { field: "missing", value: "x", match: "exact" })).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    { values: [["id", "name"], ["one", "a"], ["one", "b"]] },
    { values: [["id", "name"], ["", "a"]] },
    { values: [["name"], ["Alice"]] },
    { values: [["id", "", "name"]] },
    { values: [["id", "id"]] },
    { values: [["id"], ["one", "unexpected"]] },
  ])("rejects malformed or ambiguous sheet data", ({ values }) => {
    expect(() => parseSheet(values)).toThrow("unique");
  });

  it("generates the next highest ID and preserves formula-like input as a value", async () => {
    vi.mocked(readSheet).mockResolvedValue([
      ["id", "name", "note"],
      ["7", "Alice", "hello"],
      ["2", "Bob", "world"],
    ]);
    const result = await createRecord("Contacts", { name: "=1+1" });
    expect(result.id).toBe("8");
    expect(appendRow).toHaveBeenCalledWith("Contacts", ["8", "=1+1", ""]);
    await expect(createRecord("Contacts", { id: "chosen" })).rejects.toMatchObject({ status: 400 });
    await expect(createRecord("Contacts", { unknown: "x" })).rejects.toMatchObject({ status: 400 });
  });

  it("starts at 1 on an empty worksheet", async () => {
    vi.mocked(readSheet).mockResolvedValue([["id", "name"]]);
    expect(await createRecord("Contacts", { name: "Alice" })).toEqual({ id: "1" });
    expect(appendRow).toHaveBeenCalledWith("Contacts", ["1", "Alice"]);
  });

  it.each(["old-uuid", "-1", "1.5", "01", "9007199254740991", "9007199254740992"])(
    "rejects a non-numeric or unincrementable existing ID %s without writing",
    async (id) => {
      vi.mocked(readSheet).mockResolvedValue([["id", "name"], [id, "Alice"]]);
      await expect(createRecord("Contacts", { name: "Bob" })).rejects.toMatchObject({ code: "INVALID_NUMERIC_ID" });
      expect(appendRow).not.toHaveBeenCalled();
    },
  );

  it("updates only supplied fields and prevents modifying formula cells", async () => {
    await updateRecord("Contacts", "one", { note: "changed" });
    expect(updateCells).toHaveBeenCalledWith("Contacts", 2, [[2, "changed"]]);
    vi.mocked(readFormulaRow).mockResolvedValue(["one", "Alice", "=SUM(A1:A2)"]);
    await expect(updateRecord("Contacts", "one", { note: "changed" })).rejects.toMatchObject({ code: "FORMULA_CELL" });
    await expect(updateRecord("Contacts", "missing", { name: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(updateRecord("Contacts", "one", { id: "other" })).rejects.toMatchObject({ status: 400 });
  });
});
