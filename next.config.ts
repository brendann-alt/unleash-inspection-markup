import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Camera access needs a secure context. Vercel serves HTTPS; for phone
  // testing on a LAN use `next dev --experimental-https`.
  async headers() {
    return [{
      source: "/(.*)",
      headers: [{ key: "Permissions-Policy", value: "camera=(self), geolocation=(self)" }],
    }];
  },
};

export default nextConfig;
