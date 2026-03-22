import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hypemeter-giuseppevitolo17s-projects.vercel.app"),
  title: {
    default: "Pokemon Hype Meter",
    template: "%s | Pokemon Hype Meter",
  },
  description:
    "Composite Pokemon hype index based on search demand, market momentum, availability pressure, event catalysts, and community sentiment.",
  keywords: [
    "pokemon hype",
    "pokemon tcg market",
    "pokemon sentiment index",
    "pokemon cards trend",
    "pokemon demand tracker",
    "pokemon fear and greed",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "Pokemon Hype Meter",
    description:
      "Live Pokemon hype index with market momentum, search demand, availability pressure, and event catalysts.",
    siteName: "Pokemon Hype Meter",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pokemon Hype Meter",
    description:
      "Track Pokemon hype with a composite index across sentiment, demand, and TCG market pressure.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
