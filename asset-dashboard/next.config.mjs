/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep development hot reloads from overwriting a production preview.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  reactStrictMode: true,
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/export-pdf": ["./assets/fonts/**/*"]
  }
};

export default nextConfig;
