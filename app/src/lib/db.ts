/**
 * 端末内に施設データを保存する。
 *
 * なぜ必要か:
 *   このアプリが使われるのは、地下駐車場・高架下・ビルの谷間といった
 *   電波の届きにくい場所である。「車寄せに着く直前に圏外になり、
 *   進入方法が読めない」では、解決しようとした問題がそのまま残る。
 *   一度取得した内容は端末に持ち、圏外でも読めるようにする。
 *
 * 全件を入れ替える方式にしている理由:
 *   施設は150件程度で、まとめて取り直しても数百KBに収まる。
 *   差分同期は「消された施設をどう検知するか」という難しさを伴い、
 *   この規模では割に合わない。3,000件へ拡張する段階で見直す。
 */
import * as SQLite from 'expo-sqlite';

import { buildSearchText } from './search';
import type { Caution, Category, EntryPoint, Facility, Photo } from './types';

const DB_NAME = 'kurumayose.db';

/**
 * 別名を1つの列にまとめる際の区切り。
 * 入力シートでも `;` で区切っていただいているため揃えている。
 */
export const ALIAS_SEPARATOR = ';';

/** 端末側の表の形。作り直しが必要になったら上げる。 */
const SCHEMA_VERSION = 2;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    pragma journal_mode = WAL;

    create table if not exists meta (
      key   text primary key,
      value text not null
    );

    create table if not exists categories (
      id         text primary key,
      code       text not null,
      name       text not null,
      sort_order integer not null default 0
    );

    create table if not exists facilities (
      id           text primary key,
      code         text not null,
      name         text not null,
      name_kana    text not null,
      aliases      text not null default '',
      category_id  text not null,
      prefecture   text not null,
      city         text,
      address_line text not null,
      summary      text,
      lat          real,
      lng          real,
      -- 検索用に正規化した文字列。取り込む際に組み立てる。
      -- サーバー側の search_text と同じ作り方にしないと結果がずれる。
      search_text  text not null default '',
      -- 最後に内容が変わった時刻。お知らせの並びに使う。
      updated_at   text not null default ''
    );

    create index if not exists facilities_search_idx on facilities (search_text);

    create table if not exists entry_points (
      id              text primary key,
      facility_id     text not null,
      code            text not null,
      kind            text not null,
      name            text not null,
      approach_text   text,
      approach_from   text,
      nav_lat         real,
      nav_lng         real,
      dropoff_lat     real,
      dropoff_lng     real,
      height_limit_cm integer,
      -- SQLite に真偽値は無い。0/1、未回答は null で持つ。
      is_roofed       integer,
      is_24h          integer,
      sort_order      integer not null default 0
    );

    create index if not exists entry_points_facility_idx
      on entry_points (facility_id);

    create table if not exists cautions (
      id             text primary key,
      entry_point_id text not null,
      body           text not null,
      severity       text not null default 'warn',
      time_from      text,
      time_to        text,
      -- 配列も持てないため、'1,2,3' の形で入れる
      weekdays       text not null default '',
      sort_order     integer not null default 0
    );

    create index if not exists cautions_entry_point_idx
      on cautions (entry_point_id);

    create table if not exists photos (
      id             text primary key,
      facility_id    text,
      entry_point_id text,
      kind           text not null,
      storage_path   text not null,
      caption        text,
      is_placeholder integer not null default 0,
      sort_order     integer not null default 0
    );

    create index if not exists photos_entry_point_idx
      on photos (entry_point_id);
  `);

  await db.runAsync(
    'insert into meta (key, value) values (?, ?) on conflict (key) do update set value = ?',
    'schema_version',
    String(SCHEMA_VERSION),
    String(SCHEMA_VERSION),
  );

  return db;
}

/** 開き直しを避けるため、最初の1回だけ開く */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= openDatabase();
  return dbPromise;
}

// --- 保存 ---------------------------------------------------------------------

export interface CatalogPayload {
  categories: Category[];
  facilities: Facility[];
  entryPoints: EntryPoint[];
  cautions: Caution[];
  photos: Photo[];
}

/** 真偽値を SQLite の 0/1 へ。未回答は null のまま。 */
function toInt(value: boolean | null): number | null {
  return value === null ? null : value ? 1 : 0;
}

/**
 * 取得した内容で端末側を置き換える。
 *
 * 1つの取引（transaction）にまとめている理由:
 *   途中で通信が切れたとき、古い内容を消した直後で止まると
 *   「圏外なのに手元にも何も無い」という最悪の状態になる。
 *   まとめておけば、失敗しても以前の内容が残る。
 */
export async function replaceCatalog(payload: CatalogPayload): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.execAsync(
      'delete from photos; delete from cautions; delete from entry_points; delete from facilities; delete from categories;',
    );

    for (const c of payload.categories) {
      await db.runAsync(
        'insert into categories (id, code, name, sort_order) values (?, ?, ?, ?)',
        c.id,
        c.code,
        c.name,
        c.sort_order,
      );
    }

    for (const f of payload.facilities) {
      // サーバー側 (facilities_refresh_search_text) と同じ組み立て方。
      // 別名も1つずつ渡す。まとめてから変換すると別名同士の切れ目が消える。
      const searchText = buildSearchText([
        f.name,
        f.name_kana,
        ...f.aliases,
        f.prefecture,
        f.city,
        f.address_line,
      ]);

      await db.runAsync(
        `insert into facilities
           (id, code, name, name_kana, aliases, category_id, prefecture, city,
            address_line, summary, lat, lng, search_text, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        f.id,
        f.code,
        f.name,
        f.name_kana,
        f.aliases.join(ALIAS_SEPARATOR),
        f.category_id,
        f.prefecture,
        f.city,
        f.address_line,
        f.summary,
        f.lat,
        f.lng,
        searchText,
        f.updated_at ?? '',
      );
    }

    for (const ep of payload.entryPoints) {
      await db.runAsync(
        `insert into entry_points
           (id, facility_id, code, kind, name, approach_text, approach_from,
            nav_lat, nav_lng, dropoff_lat, dropoff_lng, height_limit_cm,
            is_roofed, is_24h, sort_order)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ep.id,
        ep.facility_id,
        ep.code,
        ep.kind,
        ep.name,
        ep.approach_text,
        ep.approach_from,
        ep.nav_lat,
        ep.nav_lng,
        ep.dropoff_lat,
        ep.dropoff_lng,
        ep.height_limit_cm,
        toInt(ep.is_roofed),
        toInt(ep.is_24h),
        ep.sort_order,
      );
    }

    for (const c of payload.cautions) {
      await db.runAsync(
        `insert into cautions
           (id, entry_point_id, body, severity, time_from, time_to, weekdays, sort_order)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id,
        c.entry_point_id,
        c.body,
        c.severity,
        c.time_from,
        c.time_to,
        c.weekdays.join(','),
        c.sort_order,
      );
    }

    for (const p of payload.photos) {
      await db.runAsync(
        `insert into photos
           (id, facility_id, entry_point_id, kind, storage_path, caption,
            is_placeholder, sort_order)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        p.facility_id,
        p.entry_point_id,
        p.kind,
        p.storage_path,
        p.caption,
        p.is_placeholder ? 1 : 0,
        p.sort_order,
      );
    }

    await db.runAsync(
      'insert into meta (key, value) values (?, ?) on conflict (key) do update set value = ?',
      'synced_at',
      new Date().toISOString(),
      new Date().toISOString(),
    );
  });
}

/** 端末側の内容がいつのものか。一度も取得していなければ null。 */
export async function getSyncedAt(): Promise<Date | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'select value from meta where key = ?',
    'synced_at',
  );
  return row ? new Date(row.value) : null;
}

/** 端末側に施設が何件あるか */
export async function getCachedFacilityCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>('select count(*) as n from facilities');
  return row?.n ?? 0;
}
