import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { PokoinFooter } from "@/components/PokoinFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ADSENSE_CLIENT = "ca-pub-4839405057855605";

export const metadata: Metadata = {
  metadataBase: new URL("https://news.pokoin.com"),
  title: {
    default: "Pokoin News - Pokemon News, Crypto Games & Earn Signals",
    template: "%s | Pokoin News",
  },
  description:
    "Pokoin News tracks Pokemon news, TCG market hype, crypto gaming signals, play-to-earn trends, collectible games and card market momentum in one live signal hub.",
  keywords: [
    "pokoin news",
    "pokoin pokemon",
    "pokemon news",
    "pokemon crypto",
    "pokemon games",
    "crypto games",
    "play to earn games",
    "earn crypto games",
    "pokemon earn",
    "tcg news",
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
  icons: {
    icon: [
      { url: "/pokoin.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/pokoin-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pokoin-1024.png", sizes: "1024x1024", type: "image/png" },
    ],
    apple: [{ url: "/pokoin-1024.png", sizes: "1024x1024", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "Pokoin News - Pokemon News, Crypto Games & Earn Signals",
    description:
      "Pokemon TCG news, crypto gaming context, earn trends and market signals from Pokoin, with hype, demand, availability and catalyst tracking.",
    siteName: "Pokoin News",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pokoin News - Pokemon News, Crypto Games & Earn Signals",
    description:
      "Track Pokemon news, TCG hype, crypto games, earn trends and collector market pressure with Pokoin's live signal index.",
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
  other: {
    "google-adsense-account": ADSENSE_CLIENT,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full max-w-full overflow-x-clip antialiased`}
    >
      <head>
      </head>
      <body className="flex min-h-full min-w-0 max-w-full flex-col overflow-x-clip">
        <Script
          id="adsense-auto-ads"
          strategy="afterInteractive"
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          crossOrigin="anonymous"
        />
        {children}
        <PokoinFooter />
      </body>
    </html>
  );
}
