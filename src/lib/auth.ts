import { createHash, timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

export function authorize(request: Request) {
  const { apiKey } = getConfig();
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(header);
  const actual = createHash("sha256").update(match?.[1] ?? "").digest();
  const expected = createHash("sha256").update(apiKey).digest();
  if (!timingSafeEqual(actual, expected) || !match) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
  }
}

export function authorizeTab(tab: string) {
  if (!getConfig().tabs.includes(tab)) {
    throw new AppError(403, "PERMISSION_DENIED", "This operation is not allowed.");
  }
}
