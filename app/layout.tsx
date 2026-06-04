import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "PharmPOS | Desh Chemists Ltd",
  description: "Pharmacy management and point of sale for Desh Chemists Ltd",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#F8FAF8] text-zinc-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
