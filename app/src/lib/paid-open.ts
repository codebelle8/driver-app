/**
 * 有料での提供を始めたか（試験提供の期間を終えたか）。
 *
 * **サイト設定の trial_open を、そのまま読む。**
 *   無料の理由（my_free_access の 'trial'）では見分けられない。上位の方は、
 *   試験提供の期間中でも「上位」と返る（上位を先に見るため）。それで判じると、
 *   試験提供の期間中に、上位の方にだけ申込みの画面が出てしまう。
 *
 * **確かめられないときは「まだ始めていない」とする。**
 *   読めなかった・圏外・ログイン前は false。申込みの画面を出し損ねても、
 *   これまでの画面（ご希望を控える）に戻るだけ。逆に、試験提供の期間中に
 *   申込みの画面を出すと、請求しない期間に申し込ませることになる。
 *
 * アプリを開いているあいだは一度だけ読む（探す画面の帯でも使うため）。
 * お支払いの画面と申込みの画面は、開くたびに読み直す（fresh）。
 */
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

let cached: Promise<boolean> | null = null;

/** 読めたら true / false、読めなければ null。 */
async function read(): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('trial_open')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { trial_open: boolean | null }).trial_open === false;
  } catch {
    return null;
  }
}

/** 有料での提供を始めたか。確かめられなければ false。 */
export function loadPaidOpen(fresh = false): Promise<boolean> {
  if (fresh || !cached) {
    const q: Promise<boolean> = read().then((v) => {
      /* 読めなかったときは控えない。次に開いたときに読み直す */
      if (v === null && cached === q) cached = null;
      return v === true;
    });
    cached = q;
  }
  return cached;
}

/** 画面から使う形。読めるまでは false。 */
export function usePaidOpen(fresh = false): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    loadPaidOpen(fresh).then((v) => {
      if (alive) setOpen(v);
    });
    return () => {
      alive = false;
    };
  }, [fresh]);
  return open;
}
