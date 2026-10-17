/**
 * The website is built as plain files (`npm run build` → web/out) which the API server
 * (api/src/main.ts) serves, so the server needs only one Node process.
 *
 * During development (`npm run dev`, port 3000) calls to /api and /uploads are passed on
 * to the API on port 4000, and the old page names (/staff.html …) still work.
 */
const API = process.env.API_URL || "http://localhost:4000";
const isDev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  ...(isDev && {
    async rewrites() {
      return [
        { source: "/api/:path*", destination: `${API}/api/:path*` },
        { source: "/uploads/:path*", destination: `${API}/uploads/:path*` },
        { source: "/staff.html", destination: "/staff" },
        { source: "/admin.html", destination: "/admin" },
        { source: "/summary.html", destination: "/summary" },
        { source: "/index.html", destination: "/" },
      ];
    },
  }),
};

export default nextConfig;
