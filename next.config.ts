import type { NextConfig } from "next";

// AIT=1 (npm run build:ait) 이면 토스 미니앱용 정적 번들(out/)을 만든다. 평소(Vercel)는 그대로.
const isAit = process.env.AIT === '1';

const nextConfig: NextConfig = {
  ...(isAit ? { output: 'export' as const, images: { unoptimized: true } } : {}),
};

export default nextConfig;
