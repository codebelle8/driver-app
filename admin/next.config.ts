import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // リポジトリ直下にも package-lock.json があるため、Turbopack が
  // どちらをルートとみなすか警告を出す。この管理画面を明示的に指定する。
  turbopack: {
    root: path.resolve(__dirname),
  },

  // sharp はネイティブバイナリを含むため、バンドルせず実行時に require させる
  serverExternalPackages: ['sharp'],

  images: {
    // Supabase Storage の公開URLから写真を読み込む
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
