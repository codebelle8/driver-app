import type { Metadata } from 'next';

import { WallClock } from '@/components/wall-clock';
import { getLocale, getTheme } from '@/lib/i18n/server';

import './globals.css';

export const metadata: Metadata = {
  title: '車寄せナビ 管理画面',
  description: '施設・エントランス・写真・カテゴリの登録と編集',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // テーマと言語は Cookie からサーバー側で読む。
  // クライアントで適用すると、最初の一瞬だけ既定の配色が見えてしまう。
  const [theme, locale] = await Promise.all([getTheme(), getLocale()]);

  return (
    <html lang={locale} data-theme={theme} className="h-full antialiased">
      <body className="relative min-h-full flex flex-col">
        <WallClock />
        {children}
      </body>
    </html>
  );
}
