import type { NextConfig } from "next";
import { assertMainnetInProduction } from "./lib/network-env.mjs";

assertMainnetInProduction(process.env.NEXT_PUBLIC_NETWORK);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
