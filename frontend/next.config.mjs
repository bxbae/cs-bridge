/** @type {import('next').NextConfig} */
const demo = process.env.NEXT_PUBLIC_DEMO === "1";

// Static demo (GitHub Pages): plain files under a sub-path, data served from public/demo.
// Otherwise: standalone server build used by the Docker image.
const nextConfig = demo
  ? { reactStrictMode: true, output: "export", basePath: process.env.NEXT_PUBLIC_BASE_PATH || "", trailingSlash: true, images: { unoptimized: true } }
  : { reactStrictMode: true, output: "standalone" };

export default nextConfig;
