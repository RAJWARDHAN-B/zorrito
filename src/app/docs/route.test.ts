import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("public API documentation", () => {
  it("serves the current reference as plain text", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe(await readFile(join(process.cwd(), "API.md"), "utf8"));
  });
});
