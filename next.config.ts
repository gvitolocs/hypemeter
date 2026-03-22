import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.cardtrader.com", pathname: "/**" },
      { protocol: "https", hostname: "cardtrader.com", pathname: "/**" },
      { protocol: "https", hostname: "en.cardtrader.com", pathname: "/**" },
      { protocol: "https", hostname: "*.cardtrader.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
