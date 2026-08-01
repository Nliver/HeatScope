import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  images: { unoptimized: true },
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
