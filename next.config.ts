import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {beforeFiles:[{source:'/images/payment-source.png',destination:'/api/payment-qr'}]};
  },
};

export default nextConfig;
