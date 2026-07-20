import type { NextConfig } from "next";

// Proxies /api/* through the Vercel domain to the backend so the browser only
// ever talks to one origin — this makes the auth cookie same-site, which
// Safari's Intelligent Tracking Prevention otherwise blocks when the API
// lives on a different domain (e.g. Render) and is called cross-site.
const API_ORIGIN = process.env.API_ORIGIN ?? "https://quanlykhoindoor1.onrender.com";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
