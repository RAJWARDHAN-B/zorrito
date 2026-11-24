import { z } from "zod";
import { AppError } from "@/lib/errors";

const configSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email(),
  GOOGLE_PRIVATE_KEY: z.string().min(1),
  GOOGLE_SPREADSHEET_ID: z.string().min(1),
  GOOGLE_ALLOWED_TABS: z.string().min(1),
  ZORITTO_API_KEY: z.string().min(32).regex(/^[A-Za-z0-9_-]+$/),
});

export function getConfig() {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new AppError(500, "CONFIGURATION_ERROR", "Server configuration is invalid.");
  }
  const tabs = parsed.data.GOOGLE_ALLOWED_TABS.split(",").map((tab) => tab.trim());
  if (tabs.some((tab) => !tab) || new Set(tabs).size !== tabs.length) {
    throw new AppError(500, "CONFIGURATION_ERROR", "Server configuration is invalid.");
  }
  return {
    email: parsed.data.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: parsed.data.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    spreadsheetId: parsed.data.GOOGLE_SPREADSHEET_ID,
    tabs,
    apiKey: parsed.data.ZORITTO_API_KEY,
  };
}
