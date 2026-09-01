import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AEGIS — Merchant Loss Defense Intelligence",
  description:
    "AEGIS detects return-fraud and chargeback risk for Indian e-commerce merchants using a gradient-boosted model trained on realistic transaction data, with per-prediction explainability and financial impact analysis.",
  keywords: [
    "AI risk management", "chargeback prevention", "return fraud",
    "RTO", "Indian e-commerce", "machine learning", "explainable AI",
  ],
  authors: [{ name: "AEGIS" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
          {children}
          <Toaster />
          <Sonner position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
