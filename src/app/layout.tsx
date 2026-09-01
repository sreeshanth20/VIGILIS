import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "VIGILIS — AI Risk Intelligence Platform",
  description:
    "VIGILIS is an enterprise AI risk intelligence platform that detects financial fraud, chargebacks, and high-risk transactions using advanced machine learning with per-prediction explainability and financial impact analysis.",
  keywords: [
    "AI risk management", "fraud detection", "chargeback prevention", "return fraud",
    "machine learning", "explainable AI", "enterprise risk", "fintech",
  ],
  authors: [{ name: "VIGILIS" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="light">
      <body
        className="antialiased bg-background text-foreground min-h-screen"
      >
        <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light">
          {children}
          <Toaster />
          <Sonner position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
