'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * 開いている画面を、新しい書き込みが来たら読み直す（2026-10-08）。
 *
 * ご指摘「管理画面のチャットに、会員の書き込みがすぐ出ない」。画面はサーバーで
 * 組み立てており、開いた時点の中身のまま止まっていた（読み直すまで出ない）。
 *
 * **3つの合図で読み直す**
 *   1. 表が変わった合図（Supabase Realtime）。書き込みはすぐ出る。アプリの
 *      チャットと同じ合図（chat_messages は合図を配る表に入っている）
 *   2. 一定の間隔（既定 20 秒）。合図を配らない表（通報 chat_reports）と、
 *      合図が届かない環境（会社の網など）のため。画面を見ていないあいだは止める
 *   3. 別のタブから戻ってきたとき
 *
 * 読み直しは router.refresh()。画面の組み立てだけをやり直し、入力中の欄や
 * スクロールの位置は保たれる。左の柱の件数（未対応の通報）も一緒に新しくなる。
 * 合図が続けて来たときは、まとめて1回にする。
 */
export function LiveRefresh({ table, intervalMs = 20_000 }: { table: string; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        router.refresh();
      }, 400);
    };

    const channel = supabase
      .channel(`admin-live-${table}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
      .subscribe();

    const visible = () => document.visibilityState === 'visible';
    const tick = setInterval(() => {
      if (visible()) refresh();
    }, intervalMs);
    const onVisible = () => {
      if (visible()) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(tick);
      if (pending) clearTimeout(pending);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [router, table, intervalMs]);

  return null;
}
