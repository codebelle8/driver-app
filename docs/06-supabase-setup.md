# Supabase セットアップ手順

作成日: 2026-08-07
方針: **当方（開発側）のアカウントでプロジェクトを作成し、公開時にクライアント様へ移管する。**

---

## 1. 当方で必要な作業（アカウント所有者が実施）

### 1-1. プロジェクトの作成

1. https://supabase.com/dashboard にログイン
2. 「New project」
3. 以下を設定する

| 項目 | 設定値 | 理由 |
|---|---|---|
| Name | `kurumayose-navi` | |
| Database Password | 強固なパスワードを生成し**必ず保管** | 再表示されない。紛失すると DB へ直接接続できなくなる |
| **Region** | **Northeast Asia (Tokyo)** | 利用者が日本国内のため。他リージョンだと応答が体感で遅くなる |
| Plan | Free（当面） | 下記「無料プランの注意点」参照 |

### 1-2. 取得する情報

Dashboard → Project Settings から以下を控える。

| 項目 | 場所 | 用途 |
|---|---|---|
| Project Reference ID | General（`abcdefghijklmnop` 形式） | CLI のリンクに使用 |
| Project URL | API | アプリ・管理画面から接続 |
| `anon` public key | API Keys | **アプリに埋め込まれる**（公開前提のキー） |
| `service_role` key | API Keys | **サーバー側処理専用。絶対に外部へ出さない** |
| Database Password | 1-1 で設定したもの | |

---

## 2. リポジトリへの反映（当方作業）

```powershell
cd c:\driver

# プロジェクトへリンク（Project Reference ID を指定）
npx supabase link --project-ref <PROJECT_REF>

# マイグレーションを本番へ適用
npx supabase db push
```

`supabase/migrations/` の3ファイルがそのまま適用される。
**ローカル PostgreSQL で23項目の検証を通過済みのため、修正なしで適用できる。**

> `db/local/0000_supabase_stub.sql` は**適用しないこと。**
> auth スキーマとロールをローカルで再現するためのスタブであり、
> Supabase 本番には既に存在する。

### 適用後の確認

```powershell
npx supabase db diff        # 差分が出なければローカルと本番が一致
```

---

## 3. Storage バケットの作成

Dashboard → Storage、または SQL Editor で以下を実行。

| バケット | 公開設定 | 用途 |
|---|---|---|
| `facility-photos` | Public | 現地写真・進入案内図。秘匿情報ではないため公開 |
| `catalog` | Public | カタログスナップショット JSON |

写真を Public にする理由: アプリはオフライン動作のため写真を端末へ
ダウンロードして保持する。署名付き URL は有効期限があり、
オフラインキャッシュと相性が悪い。

### 画像リサイズについて（重要）

**Supabase の画像変換機能（Image Transformation）は有料プラン限定。**
無料プランで運用するため、**アップロード時に管理画面側でリサイズする**方式を採る。

| 生成する版 | サイズ | 用途 |
|---|---|---|
| サムネイル | 長辺 400px WebP | 一覧のカード画像 |
| 詳細 | 長辺 1200px WebP | 施設詳細・ビューア |
| 原本 | そのまま | 差し替え・再生成用に保管 |

管理画面（Next.js）で `sharp` を使い、アップロード時に3種類を生成して保存する。
Step 4 で実装する。

---

## 4. 環境変数の設定

### `admin/.env.local`（Git 管理外）

```
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<Maps JavaScript API キー>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### `app/.env.local`（Git 管理外）

```
EXPO_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_CATALOG_BASE_URL=https://<PROJECT_REF>.supabase.co/storage/v1/object/public/catalog
```

> **`service_role` key をアプリ側に置いてはならない。**
> Expo では `EXPO_PUBLIC_` 接頭辞の変数がバンドルに埋め込まれ、
> アプリを解析すれば読み取れる。RLS を全て迂回できるキーのため、
> 漏洩すると全データの改ざん・削除が可能になる。

---

## 5. 無料プランの注意点

| 制限 | 内容 | 影響 |
|---|---|---|
| **7日間アクセスが無いとプロジェクトが一時停止** | 手動で再開が必要 | 開発中は問題ないが、**公開後は Pro プラン（月額 $25）が実質必須** |
| データベース 500MB | 施設3,000件でもテキストは数MBのため十分 | 問題なし |
| ストレージ 1GB | 写真150施設×5枚をリサイズ後で概ね収まる想定 | 3,000件規模では要増強 |
| 帯域 5GB/月 | アプリはオフラインキャッシュのため転送量が少ない | 初期は問題なし |
| 画像変換機能 | 利用不可 | 上記のとおり管理画面側でリサイズして回避 |

**公開のタイミングで Pro プランへ切り替える。** その際、クライアント様名義への
移管とあわせて実施するのが自然（支払いも同時に移行できる）。

---

## 6. クライアント様への移管手順（公開時）

Supabase は組織単位でプロジェクトを移管できる。

1. クライアント様に Supabase アカウントを作成いただく
2. クライアント様側で Organization を作成いただく
3. 当方から Dashboard → Project Settings → General → Transfer project を実行
4. 支払い情報をクライアント様側で設定いただく

**データ・設定・マイグレーション履歴はすべて保持されたまま移管される。**
移管後は環境変数の変更も不要（Project Reference ID が変わらないため）。

---

## 7. 現状の進捗

- [x] Supabase CLI 導入（v2.112.0）
- [x] `supabase init` によるプロジェクト構成の作成
- [x] マイグレーションを Supabase 標準レイアウトへ配置
- [x] ローカル PostgreSQL 17.10 で全23項目の検証通過
- [ ] **Supabase プロジェクトの作成**（アカウント所有者の作業）
- [ ] `supabase link` と `db push`
- [ ] Storage バケットの作成
- [ ] `.env.local` の配置
