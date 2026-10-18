import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JVA Interview Scheduler",
  description: "Schedule recruitment interviews with Japan Venture Academy.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
