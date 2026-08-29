/**
 * お知らせ。
 *
 * **なぜ要るか**
 *   車寄せは変わる。工事で入口が閉鎖される、夜間の動線が変わる。
 *   ドライバーが前回の記憶のまま向かって現地で困るのが、
 *   このアプリで最も避けたい事態にあたる。
 *
 * **どこから作るか**
 *   新しい表は作らず、既に端末へ取り込んでいるものから組み立てる。
 *     いま効いている注意事項 … cautions（時間帯・曜日の条件つき）
 *     最近変わった施設       … facilities.updated_at
 *
 *   操作履歴 (audit_logs) のほうが「何が変わったか」まで分かるが、
 *   あれは管理者向けの記録で、アプリからは読めないようにしてある。
 *   読めるようにすると、誰がいつ何をしたかが外へ出る。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isActiveNow } from './cautions';
import { getDatabase } from './db';
import type { CautionSeverity } from './types';

/** 「最近」とみなす範囲。これより古い変更は出さない。 */
const RECENT_DAYS = 14;

/** 最後に開いた時刻を覚える鍵 */
const SEEN_KEY = 'kn_notices_seen_at';

export type NoticeKind = 'caution' | 'updated';

export interface Notice {
  id: string;
  kind: NoticeKind;
  facilityId: string;
  facilityName: string;
  /** 画面に出す本文 */
  body: string;
  /** 並べ替えと「新着」の判定に使う */
  at: string;
  severity?: CautionSeverity;
}

interface CautionRow {
  id: string;
  body: string;
  severity: string;
  time_from: string | null;
  time_to: string | null;
  weekdays: string;
  facility_id: string;
  facility_name: string;
}

interface UpdatedRow {
  id: string;
  name: string;
  updated_at: string;
}

/**
 * お知らせを組み立てる。
 *
 * 注意事項を先に置く。いま現地で効いている条件のほうが、
 * 「更新されました」より切迫しているため。
 */
export async function fetchNotices(): Promise<Notice[]> {
  const db = await getDatabase();

  const cautionRows = await db.getAllAsync<CautionRow>(
    `select c.id, c.body, c.severity, c.time_from, c.time_to, c.weekdays,
            f.id as facility_id, f.name as facility_name
       from cautions c
       join entry_points e on e.id = c.entry_point_id
       join facilities f on f.id = e.facility_id
      order by c.sort_order`,
  );

  const cautions: Notice[] = cautionRows
    .filter((r) =>
      isActiveNow({
        time_from: r.time_from,
        time_to: r.time_to,
        weekdays: r.weekdays ? r.weekdays.split(',').map(Number).filter(Number.isInteger) : [],
      }),
    )
    .map((r) => ({
      id: 'c:' + r.id,
      kind: 'caution' as const,
      facilityId: r.facility_id,
      facilityName: r.facility_name,
      body: r.body,
      // 注意事項は「いま効いている」ことが要点で、いつ書かれたかは問わない
      at: new Date().toISOString(),
      severity: r.severity as CautionSeverity,
    }));

  const since = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString();
  const updatedRows = await db.getAllAsync<UpdatedRow>(
    `select id, name, updated_at
       from facilities
      where updated_at <> '' and updated_at >= ?
      order by updated_at desc
      limit 30`,
    since,
  );

  const updated: Notice[] = updatedRows.map((r) => ({
    id: 'u:' + r.id,
    kind: 'updated' as const,
    facilityId: r.id,
    facilityName: r.name,
    body: '案内の内容が更新されました。向かう前にご確認ください。',
    at: r.updated_at,
  }));

  return [...cautions, ...updated];
}

/** 前回このアプリでお知らせを開いた時刻 */
export async function getSeenAt(): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(SEEN_KEY);
  if (!raw) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

export async function markSeen(): Promise<void> {
  await AsyncStorage.setItem(SEEN_KEY, new Date().toISOString());
}

/**
 * まだ見ていない件数。
 *
 * 注意事項は、いま効いていれば常に数える。見たかどうかに関わらず
 * 現地で効いているため、数を消してしまうと気づけなくなる。
 */
export function countUnseen(notices: Notice[], seenAt: Date | null): number {
  return notices.filter((n) => {
    if (n.kind === 'caution') return true;
    if (!seenAt) return true;
    return new Date(n.at) > seenAt;
  }).length;
}

/** 「3日前」のような短い言い方 */
export function describeWhen(at: string): string {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return '';

  const minutes = Math.floor((Date.now() - t) / 60000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;

  const days = Math.floor(hours / 24);
  if (days === 1) return '昨日';
  return `${days}日前`;
}
