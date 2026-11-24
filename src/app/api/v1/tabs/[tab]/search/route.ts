import { z } from "zod";
import { authorizeTab } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { handle, pagination } from "@/lib/http";
import { listRecords } from "@/lib/records";

const searchSchema = z.object({
  field: z.string().min(1).max(100),
  value: z.string().min(1).max(500),
  match: z.enum(["exact", "contains"]).default("contains"),
});
type Context = { params: Promise<{ tab: string }> };

export async function GET(request: Request, context: Context) {
  return handle(request, async () => {
    const { tab } = await context.params;
    authorizeTab(tab);
    const url = new URL(request.url);
    const parsed = searchSchema.safeParse({
      field: url.searchParams.get("field"),
      value: url.searchParams.get("value"),
      match: url.searchParams.get("match") ?? undefined,
    });
    if (!parsed.success) throw badRequest("Invalid search parameters.");
    const { limit, offset } = pagination(url);
    return listRecords(tab, limit, offset, parsed.data);
  });
}
