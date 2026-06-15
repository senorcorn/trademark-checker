import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "App Name Trademark Checker",
  description: "Check whether an app name conflicts with a registered US trademark.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
