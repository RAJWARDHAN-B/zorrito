import { authorizeTab } from "@/lib/auth";
import { handle, pagination, readRecord } from "@/lib/http";
import { createRecord, listRecords } from "@/lib/records";

type Context = { params: Promise<{ tab: string }> };

export async function GET(request: Request, context: Context) {
  return handle(request, async () => {
    const { tab } = await context.params;
    authorizeTab(tab);
    const { limit, offset } = pagination(new URL(request.url));
    return listRecords(tab, limit, offset);
  });
}

export async function POST(request: Request, context: Context) {
  return handle(request, async () => {
    const { tab } = await context.params;
    authorizeTab(tab);
    return createRecord(tab, await readRecord(request));
  });
}
