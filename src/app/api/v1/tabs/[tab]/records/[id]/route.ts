import { authorizeTab } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { handle, readRecord } from "@/lib/http";
import { updateRecord } from "@/lib/records";

type Context = { params: Promise<{ tab: string; id: string }> };

export async function PATCH(request: Request, context: Context) {
  return handle(request, async () => {
    const { tab, id } = await context.params;
    authorizeTab(tab);
    if (!id || id.length > 500) throw badRequest("Invalid record ID.");
    return updateRecord(tab, id, await readRecord(request));
  });
}
