import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-atlas-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-atlas-sans",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-atlas-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Atlas — your travel companion",
  description: "Plan trips with AI. Map first. Offline-ready.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Atlas",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#b45309",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
