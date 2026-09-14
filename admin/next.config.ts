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

  experimental: {
    serverActions: {
      /*
        保存の受け口が受け取れる大きさ。既定は 1MB。

        **写真がそこで弾かれていた。** いまのスマートフォンの写真は
        3〜12MB あり、超えると「An unexpected response was received
        from the server」とだけ出て終わる（ご報告 2026-09-14）。

        写真はブラウザ側で縮めてから送るようにしたので（shrink-image.ts）、
        通常はここへ届く前に 1MB を下回る。**これは念のための余裕。**
        縮められない形式が来たときに、静かに落ちないようにする。

        4MB にしてあるのは、配信側（Vercel）の上限が 4.5MB のため。
        それより上げても、その手前で弾かれる。
      */
      bodySizeLimit: '4mb',
    },
  },

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
