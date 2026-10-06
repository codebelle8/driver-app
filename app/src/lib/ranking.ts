/**
 * 情報提供ランキング（チャットの「情報提供ランキング」チャンネル）。
 *
 * ご依頼（2026-10-05）。会員は、自分がどれだけ情報を送ったか、ほかの会員と
 * 比べて何位かを見られなかった。
 *
 * **数え方はデータベースが決める**（submission_ranking。
 * supabase/migrations/20261005000004_ranking.sql）
 *   * 順位は採用件数。採用した日の月（日本時間）で数える
 *   * 同じ件数なら、先にその件数に届いた方が上
 *   * 調査員・所有者（はじめから無料）と、止められた会員は順位に入らない
 *   * ほかの方について返るのは、順位・件数・表示名だけ。匿名を選んだ方は
 *     名前が null で返る
 *
 * 毎月の上位の方を翌月無料にする段でも、同じ順位を使う。ここで別に数えない。
 */
import { supabase } from './supabase';
import type { SubmissionKind } from './submissions';

export interface RankRow {
  rank: number;
  accepted: number;
  /** 本人の行か */
  me: boolean;
  /** 表示名。匿名を選んだ方・表示名の無い方は null */
  name: string | null;
  /** その月の締めで、翌月無料になった方か（2026-10-06） */
  free: boolean;
}

export interface Ranking {
  /** 対象の月（YYYY-MM） */
  month: string;
  /** 翌月無料の決まり（いまの設定）。上位 top 名・min 件以上 */
  rule: { top: number; min: number };
  /** その月を締めたか（翌月無料が決まったか） */
  settled: boolean;
  /** 上位20名 */
  top: RankRow[];
  me: {
    /** 順位。採用が無い・順位から外れている場合は null */
    rank: number | null;
    accepted: number;
    /** その月に送った件数（審査待ち・不採用も含む）。本人にだけ返る */
    sent: number;
    /** 順位から外れている理由（調査員・所有者） */
    excluded: 'surveyor' | 'owner' | null;
    /** いま上位で無料の期間にいれば、その終わり（翌月の初日0時） */
    freeUntil: string | null;
  };
  /** 順位に入った人数 */
  participants: number;
}

/** 日本時間の YYYY-MM。monthsAgo だけさかのぼる */
export function monthOf(monthsAgo = 0, now: Date = new Date()): string {
  /* 日本時間に寄せてから月を数える（端末の時刻の設定に左右されない） */
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() - monthsAgo;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 順位を引く。引けなければ null（圏外・データベースの更新前） */
export async function loadRanking(month?: string): Promise<Ranking | null> {
  try {
    const { data, error } = await supabase.rpc('submission_ranking', { p_month: month ?? null });
    if (error || !data || typeof data !== 'object') return null;
    const j = data as Omit<Ranking, 'me' | 'top'> & {
      top?: (Omit<RankRow, 'free'> & { free?: boolean })[];
      me?: Partial<Ranking['me']> & { free_until?: string | null };
    };
    return {
      month: j.month,
      /* データベースの更新前は決まりが返らない。既定の 20名・3件で見せる */
      rule: { top: j.rule?.top ?? 20, min: j.rule?.min ?? 3 },
      settled: !!j.settled,
      top: (Array.isArray(j.top) ? j.top : []).map((r) => ({ ...r, free: !!r.free })),
      me: {
        rank: j.me?.rank ?? null,
        accepted: j.me?.accepted ?? 0,
        sent: j.me?.sent ?? 0,
        excluded: j.me?.excluded === 'surveyor' || j.me?.excluded === 'owner' ? j.me.excluded : null,
        freeUntil: j.me?.free_until ?? null,
      },
      participants: j.participants ?? 0,
    };
  } catch {
    return null;
  }
}

/** 本人が送った情報（送った情報の一覧） */
export interface MySubmission {
  id: string;
  kind: SubmissionKind;
  body: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
  facilityName: string | null;
  facilityNameEn: string | null;
}

/** 本人が送った情報を、新しい順に引く（データベースの決まりで、本人の分しか読めない） */
export async function loadMySubmissions(limit = 50): Promise<MySubmission[] | null> {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('id, kind, body, status, created_at, reviewed_at, facilities(name, name_en)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return null;
    return (data as unknown as {
      id: string;
      kind: SubmissionKind;
      body: string;
      status: MySubmission['status'];
      created_at: string;
      reviewed_at: string | null;
      facilities: { name: string; name_en: string | null } | null;
    }[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      status: r.status,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
      facilityName: r.facilities?.name ?? null,
      facilityNameEn: r.facilities?.name_en ?? null,
    }));
  } catch {
    return null;
  }
}
