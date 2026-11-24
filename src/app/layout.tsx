import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "zoritto",
  description: "A private bridge between your AI agent and Google Sheets.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
