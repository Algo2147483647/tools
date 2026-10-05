/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep development hot reloads from overwriting a production preview.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  reactStrictMode: true
};

export default nextConfig;
