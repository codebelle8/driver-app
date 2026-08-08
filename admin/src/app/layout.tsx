import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '車寄せナビ 管理画面',
  description: '施設・エントランス・写真・カテゴリの登録と編集',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
