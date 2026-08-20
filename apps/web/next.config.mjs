/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits a minimal server bundle for the runtime Docker stage.
  output: 'standalone',
};

export default nextConfig;
