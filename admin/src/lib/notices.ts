/**
 * 管理画面のお知らせ。
 *
 * 出すのは2つ。
 *   * 操作履歴の整理をお伺いする知らせ（半年に一度）
 *   * 会員がお支払いを済ませたという知らせ
 *
 * **文面はここでは作らない。** 種類と手がかりを返すだけで、文字は
 * 画面側が辞書から組み立てる。ここで文字にしてしまうと、表示の言語を
 * 切り替えても前の言語のまま残る。
 */
import 'server-only';

import type { AdminNotice } from '@/lib/supabase/database.types';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * 整理をお伺いする間隔。ご指示 2026-09-14。
 *
 * 「半年ごとに消す」ではなく「半年ごとにお伺いする」。
 * 同意をいただけなければ消さず、次は半年後にまたお伺いする。
 */
export const PURGE_AFTER_MONTHS = 6;

/** いまから半年前。これより古い記録が整理の対象になる。 */
export function purgeCutoff(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - PURGE_AFTER_MONTHS);
  return d;
}

/**
 * 整理の時期が来ていれば、お伺いの知らせを1件作る。
 *
 * **勝手に消さない。** ここで作るのは問い合わせだけで、消すのは
 * 同意をいただいてから（actions/notices.ts の approvePurge）。
 *
 * 作らない場合:
 *   * すでに未対応のお伺いがある（二重に積まない）
 *   * 半年より古い記録が1件も無い（消すものが無い）
 *   * 前回のお伺いから半年経っていない
 *       見送られた直後にまた出すと、同じ問いを繰り返すことになる。
 *       同意された場合は古い記録が消えているので、そもそも上の条件で
 *       止まる。ここが効くのは「見送られたとき」。
 *
 * 画面を開くたびに呼ばれる。仕掛け（cron）を持たずに済ませるため。
 * 3つとも軽い問い合わせで、どれかで早めに止まる。
 */
export async function ensurePurgeRequest(now: Date = new Date()): Promise<void> {
  const admin = createAdminClient();
  const cutoff = purgeCutoff(now);

  const { data: open, error } = await admin
    .from('admin_notices')
    .select('id')
    .eq('kind', 'purge_request')
    .eq('state', 'open')
    .limit(1);

  /*
    表がまだ無いときは、何もしない。

    データベースへの追加は手作業で流していただくため、配備のほうが
    先になる瞬間がある。そのあいだ毎回書き込みを試みても無駄で、
    記録に残るのは失敗だけになる。
  */
  if (error) return;
  if (open && open.length > 0) return;

  const { count } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .lt('created_at', cutoff.toISOString());
  if (!count || count === 0) return;

  const { data: recent } = await admin
    .from('admin_notices')
    .select('created_at')
    .eq('kind', 'purge_request')
    .gte('created_at', cutoff.toISOString())
    .limit(1);
  if (recent && recent.length > 0) return;

  await admin.from('admin_notices').insert({
    kind: 'purge_request',
    detail: { cutoff: cutoff.toISOString(), count },
  });
}

/** 画面へ渡す形。文字にはしていない。 */
export interface OpenNotice {
  id: number;
  kind: AdminNotice['kind'];
  createdAt: string;
  /** purge_request のとき */
  cutoff?: string;
  count?: number;
  /** payment のとき */
  memberNo?: number;
  plan?: 'monthly' | 'yearly';
  /** 対応が済んだもののとき */
  state?: AdminNotice['state'];
  decidedAt?: string | null;
  removed?: number;
}

/** 行を、画面へ渡す形へ直す。 */
function shape(n: AdminNotice): OpenNotice {
  const d = (n.detail ?? {}) as Record<string, unknown>;
  return {
    id: n.id,
    kind: n.kind,
    createdAt: n.created_at,
    cutoff: typeof d.cutoff === 'string' ? d.cutoff : undefined,
    count: typeof d.count === 'number' ? d.count : undefined,
    memberNo: typeof d.member_no === 'number' ? d.member_no : undefined,
    plan: d.plan === 'monthly' || d.plan === 'yearly' ? d.plan : undefined,
    state: n.state,
    decidedAt: n.decided_at,
    removed: typeof d.removed === 'number' ? d.removed : undefined,
  };
}

/**
 * 対応が済んだ知らせを、新しい順に返す。
 *
 * 一覧の画面で「何をどうしたか」を後から辿れるようにする。
 * 未対応が0件でも、この画面へ来た意味があるようにしておく。
 */
export async function fetchHandledNotices(limit = 30): Promise<OpenNotice[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('admin_notices')
    .select('*')
    .neq('state', 'open')
    .order('decided_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map(shape);
}

/**
 * 未対応の知らせを、新しい順に返す。
 *
 * 数が増えても窓に収まるよう、上限を設ける。溜まっているなら、
 * それは片付いていないということで、窓を長くしても解決しない。
 */
export async function fetchOpenNotices(limit = 20): Promise<OpenNotice[] | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('admin_notices')
    .select('*')
    .eq('state', 'open')
    .order('created_at', { ascending: false })
    .limit(limit);

  /*
    **表がまだ無いときは null を返す。**

    空（[]）と区別する。空なら「知らせが無い」ので、窓は出して
    「新しいお知らせはありません」と伝える。無いのは表のほうなら、
    窓そのものを出さない。押しても何も起きない釦を置くより、
    出さないほうが分かりやすい。

    データベースへの追加を流していただいた時点で、配備し直さなくても
    自動的に出るようになる。
  */
  if (error) return null;

  return (data ?? []).map(shape);
}
