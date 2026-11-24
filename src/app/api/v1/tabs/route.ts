import { getConfig } from "@/lib/config";
import { handle } from "@/lib/http";

export async function GET(request: Request) {
  return handle(request, async () => ({ tabs: getConfig().tabs }));
}
