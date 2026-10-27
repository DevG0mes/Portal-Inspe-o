import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@portal/ui'],
};
export default config;
