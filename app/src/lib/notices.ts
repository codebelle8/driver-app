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
import { fetchCautionsWithFacility, fetchRecentlyUpdated } from './facilities';
import type { CautionSeverity } from './types';

/** 「最近」とみなす範囲。これより古い変更は出さない。 */
const RECENT_DAYS = 14;

/** 読んだお知らせの控え */
const READ_KEY = 'kn_notices_read';

/**
 * 控えておく上限。
 *
 * 際限なく貯めると、端末に残す量が増え続ける。
 * 古いものは一覧から落ちるため、控えも同じだけあれば足りる。
 */
const READ_LIMIT = 300;

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

/**
 * お知らせを組み立てる。
 *
 * 注意事項を先に置く。いま現地で効いている条件のほうが、
 * 「更新されました」より切迫しているため。
 */
export async function fetchNotices(): Promise<Notice[]> {
  const withFacility = await fetchCautionsWithFacility();

  const cautions: Notice[] = withFacility
    .filter(({ caution }) => isActiveNow(caution))
    .map(({ caution, facility }) => ({
      id: 'c:' + caution.id,
      kind: 'caution' as const,
      facilityId: facility.id,
      facilityName: facility.name,
      body: caution.body,
      // 注意事項は「いま効いている」ことが要点で、いつ書かれたかは問わない
      at: new Date().toISOString(),
      severity: caution.severity,
    }));

  const since = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString();
  const recent = await fetchRecentlyUpdated(since, 30);

  const updated: Notice[] = recent.map((f) => ({
    // 同じ施設が再び更新されたら別の1件として数える。時刻まで含める。
    id: 'u:' + f.id + ':' + f.updated_at,
    kind: 'updated' as const,
    facilityId: f.id,
    facilityName: f.name,
    body: '案内の内容が更新されました。向かう前にご確認ください。',
    at: f.updated_at,
  }));

  return [...cautions, ...updated];
}

/** これまでに読んだお知らせの控え */
export async function getRead(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(READ_KEY);
  if (!raw) return new Set();
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? new Set(list.map(String)) : new Set();
  } catch {
    // 壊れていたら控えを捨てる。全件が未読に戻るだけで、害はない。
    return new Set();
  }
}

/** 1件を読んだことにする */
export async function markRead(id: string): Promise<void> {
  const read = await getRead();
  if (read.has(id)) return;
  read.add(id);
  const list = [...read].slice(-READ_LIMIT);
  await AsyncStorage.setItem(READ_KEY, JSON.stringify(list));
}

/** まとめて読んだことにする（一覧の「すべて既読」） */
export async function markAllRead(ids: string[]): Promise<void> {
  const read = await getRead();
  for (const id of ids) read.add(id);
  const list = [...read].slice(-READ_LIMIT);
  await AsyncStorage.setItem(READ_KEY, JSON.stringify(list));
}

/**
 * まだ読んでいない件数。
 *
 * 読んだ分だけ減り、新しく出たものが増える。
 * 開いただけでまとめて既読にはしない。どれを見たのかが分からなくなるため。
 */
export function countUnread(notices: Notice[], read: Set<string>): number {
  return notices.filter((n) => !read.has(n.id)).length;
}
