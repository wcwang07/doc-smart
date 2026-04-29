import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocSmartAnswer",
  description: "Chat with uploaded PDFs through a protected backend proxy."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
