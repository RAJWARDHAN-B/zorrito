import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize } from "@/lib/auth";
import { AppError, badRequest } from "@/lib/errors";

const MAX_BODY_BYTES = 16 * 1024;
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
const cellValue = z.union([z.string().max(5000), z.number().finite(), z.boolean(), z.null()]);
const recordSchema = z.record(z.string().min(1).max(100), cellValue)
  .refine((value) => Object.keys(value).length > 0, "Record must not be empty.");

export type RecordInput = z.infer<typeof recordSchema>;

export function pagination(url: URL) {
  const result = pageSchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!result.success) throw badRequest("Invalid pagination parameters.");
  return result.data;
}

export async function readRecord(request: Request): Promise<RecordInput> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") throw badRequest("Content-Type must be application/json.");
  const reader = request.body?.getReader();
  if (!reader) throw badRequest("A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new AppError(413, "BODY_TOO_LARGE", "Request body is too large.");
    }
    chunks.push(value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  const result = recordSchema.safeParse(body);
  if (!result.success) throw badRequest("Record must contain valid scalar field values.");
  return result.data;
}

export async function handle(request: Request, action: () => Promise<unknown>) {
  const requestId = randomUUID();
  try {
    authorize(request);
    const data = await action();
    console.info(JSON.stringify({ requestId, method: request.method, result: "success" }));
    return Response.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof AppError ? error : new AppError(500, "INTERNAL_ERROR", "An internal error occurred.");
    console.error(JSON.stringify({ requestId, method: request.method, result: "failure", code: known.code }));
    return Response.json(
      { success: false, error: { code: known.code, message: known.message } },
      { status: known.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
