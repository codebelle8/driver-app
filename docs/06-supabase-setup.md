# Supabase セットアップ手順書

最終更新: 2026-08-08
プロジェクト: `uiesfsdzpwzfbtknpckj`（当方名義。公開時にクライアント様へ移管）

---

## 0. 現状

| | 状態 |
|---|---|
| Supabase プロジェクト作成 | ✅ 完了 |
| CLI 導入・マイグレーション整備 | ✅ 完了（4ファイル） |
| ローカル PostgreSQL 17.10 での検証 | ✅ **41項目すべて合格** |
| `.env.local` 配置（admin / app） | ✅ 完了（Git 管理外を確認済み） |
| **スキーマの適用** | ✅ 完了（2026-08-08 確認。テーブル8つ・カテゴリ6件） |
| **Storage バケット** | ✅ 完了（`facility-photos` / `catalog` 作成済み） |
| **認証設定（サインアップ無効化）** | ⬜ **← 手順3** |
| **管理者ユーザーの作成** | ⬜ **← 手順4** |
| Google Maps API キー | ⬜ ← 手順6（Step 4 の地図ピン実装までに） |

所要時間の目安: **全体で15〜20分**

---

## 手順1. スキーマを適用する

データベースのテーブル・権限・Storage バケットを一括で作成する。
**方法A・方法B のどちらか一方**を実施すればよい。

### 方法A: SQL Editor に貼り付ける（推奨・所要3分）

アクセストークンが不要で最も早い。

1. ファイルを生成する（既に生成済みなら省略可）

   ```powershell
   cd c:\driver
   node tools/build-bootstrap-sql.mjs
   ```

2. `c:\driver\supabase\_bootstrap.sql` をエディタで開き、**全文をコピー**
   （775行 / 32KB）

3. ブラウザで SQL Editor を開く
   https://supabase.com/dashboard/project/uiesfsdzpwzfbtknpckj/sql/new

4. 貼り付けて **Run**（右下の緑のボタン、または `Ctrl + Enter`）

5. `Success. No rows returned` と表示されれば完了

> **なぜ1ファイルにまとめているか**
> このファイルには、Supabase CLI のマイグレーション履歴テーブルへの登録も
> 含まれている。そのため後日 CLI を使うようになっても、同じマイグレーションが
> 二重に適用されて壊れることがない。
>
> 実行時に `policy ... does not exist, skipping` という NOTICE が4件出るが、
> これは正常。`drop policy if exists` が初回実行で何も見つけなかっただけ。

### 方法B: CLI から適用する（所要5分）

以降の運用を CLI に統一したい場合はこちら。

1. アクセストークンを発行する
   https://supabase.com/dashboard/account/tokens → 「Generate new token」

2. 実行する

   ```powershell
   cd c:\driver
   $env:SUPABASE_ACCESS_TOKEN = "<発行したトークン>"
   npx supabase link --project-ref uiesfsdzpwzfbtknpckj
   npx supabase db push
   ```

   `link` 実行時にデータベースのパスワードを求められる。
   プロジェクト作成時に設定したものを入力する。

---

## 手順2. 適用できたか確認する

SQL Editor で以下を実行する。

```sql
-- テーブルが8つ作成されているか
select tablename from pg_tables where schemaname = 'public' order by 1;

-- カテゴリが6件入っているか（レジデンス含む）
select code, name, code_prefix, sort_order from public.categories order by sort_order;

-- Storage バケットが2つ作成されているか
select id, public, file_size_limit from storage.buckets;
```

**期待される結果**

| 確認項目 | 期待値 |
|---|---|
| テーブル | `admin_profiles` `audit_logs` `catalog_snapshots` `categories` `cautions` `entry_points` `facilities` `photos` の8つ |
| カテゴリ | ホテル / レジデンス / 商業施設 / オフィスビル / 病院 / 駅・空港 の6件 |
| バケット | `facility-photos`（Public, 20MB上限） / `catalog`（Public） |

---

## 手順3. 認証を設定する（重要）

**このプロジェクトは管理画面専用の認証であり、一般ユーザーは登録しない。**
初期版のアプリはログイン不要（施設情報を読むだけ）のため、
認証を使うのは管理画面のみ。

1. 左メニューの **Authentication → Sign In / Providers** を開く
   https://supabase.com/dashboard/project/uiesfsdzpwzfbtknpckj/auth/providers

2. 「Auth Providers」一覧から **Email** を開き、以下を設定する

   | 設定 | 値 | 理由 |
   |---|---|---|
   | Enable Email provider | **ON** | 管理画面のログインに使う |
   | **Allow new users to sign up** | **OFF** | **誰でも登録できる状態を塞ぐ** |
   | Confirm email | OFF | 管理者は手動作成するため確認メール不要 |

3. 保存する

> **サインアップを止める理由（多層防御）**
> 仮に第三者がアカウントを作れても、`admin_profiles` に登録されていなければ
> 一切の権限を持たない。これは検証済み（「未登録ユーザーは施設を登録できない
> （ログイン済みでも）」「未登録ユーザーは写真をアップロードできない」）。
> ただし**入口自体を塞ぐ方が確実**なため、両方を実施する。

---

## 手順4. 管理者ユーザーを作成する

### 4-1. 利用者を作成する

1. https://supabase.com/dashboard/project/uiesfsdzpwzfbtknpckj/auth/users
2. 右上の **Add user** → **Create new user**
3. 入力する

   | 項目 | 値 |
   |---|---|
   | Email | 管理画面にログインするメールアドレス |
   | Password | 強固なパスワード（**必ず保管**） |
   | Auto Confirm User | **ON**（チェックを入れる） |

4. **Create user**

### 4-2. 管理者権限を付与する

利用者を作っただけでは権限が無い。`admin_profiles` への登録が必要。

SQL Editor で以下を実行する（**メールアドレスを書き換えること**）。

```sql
insert into public.admin_profiles (user_id, display_name, role)
select id, '管理者', 'admin'
  from auth.users
 where email = 'ここに作成したメールアドレス'
on conflict (user_id) do update
  set role = 'admin', is_active = true;

-- 確認
select p.display_name, p.role, p.is_active, u.email
  from public.admin_profiles p
  join auth.users u on u.id = p.user_id;
```

1行返ってくれば完了。

### 権限の種類

| role | できること |
|---|---|
| `admin` | すべて。管理者の追加・削除、監査ログの閲覧を含む |
| `editor` | 施設・進入口・写真・カテゴリの登録と更新。管理者管理はできない |

クライアント様や写真登録の担当者には `editor` を割り当てる。
上記 SQL の `'admin'` を `'editor'` に変えるだけでよい。

---

## 手順5. Storage の確認

手順1で自動作成されているため、**通常は作業不要**。

https://supabase.com/dashboard/project/uiesfsdzpwzfbtknpckj/storage/buckets

`facility-photos` と `catalog` が表示されていれば正常。

| バケット | 用途 | 設定 |
|---|---|---|
| `facility-photos` | 現地写真・進入案内図 | Public / 20MB上限 / 画像形式のみ |
| `catalog` | カタログスナップショット JSON | Public / 50MB上限 |

**書き込みは管理画面のログインユーザーのみ**に制限されている（検証済み）。
Public なのは読み取りのみで、誰でもアップロードできるわけではない。

> 写真を Public にしている理由は、アプリがオフライン動作のため写真を端末へ
> 保存する必要があるため。署名付き URL は有効期限があり、
> 「圏外でも案内図を開ける」という要件と両立しない。

---

## 手順6. Google Maps API キーを取得する

Supabase とは別サービス。**管理画面で地図上にピンを置いて座標を指定する**ために必要。

1. https://console.cloud.google.com/ でプロジェクトを作成
2. 「APIとサービス」→「ライブラリ」→ **Maps JavaScript API** を有効化
3. 「認証情報」→「認証情報を作成」→ **APIキー**
4. **必ずキーに制限をかける**

   | 制限 | 設定 |
   |---|---|
   | アプリケーションの制限 | HTTP リファラー |
   | 許可するリファラー | `http://localhost:3000/*` と、後日の管理画面URL |
   | API の制限 | Maps JavaScript API のみ |

5. `admin/.env.local` の `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=` に設定

> **制限をかけずに放置すると、キーを抜き取られて高額請求につながる。**
> リファラー制限は必ず設定すること。
> なお、アプリ側のナビ連携は Google マップアプリを開くだけなので
> API キーは不要（費用も発生しない）。

---

## 運用上の注意

### 無料プランの制約

| 制限 | 内容 | 対応 |
|---|---|---|
| **7日間アクセスが無いと一時停止** | 手動で再開が必要 | 開発中は問題なし。**公開時に Pro（月額 $25）へ移行が必須** |
| データベース 500MB | 施設3,000件でもテキストは数MB | 問題なし |
| ストレージ 1GB | 150施設×5枚のリサイズ後で概ね収まる | 3,000件規模では要増強 |
| 自動バックアップ | 無料プランは日次のみ、復元は限定的 | Pro で Point-in-Time Recovery が使える |
| 画像変換機能 | 利用不可 | 管理画面側で `sharp` によりリサイズして回避（Step 4 で実装） |

### キーの取り扱い

| キー | 性質 | 置き場所 |
|---|---|---|
| `anon` key | **公開前提**。アプリのバンドルに埋め込まれ、解析すれば読める | `.env.local` / アプリ内 |
| `service_role` key | **RLS を完全に迂回できる**。全データの改ざん・削除が可能 | サーバー側のみ。**アプリには絶対に置かない** |

`anon` key が公開されていても安全なのは、RLS が実際の防御になっているため
（未公開施設が見えないこと、書き込めないことを検証済み）。

**`service_role` key が外部に漏れた場合は、Project Settings → API から
即座に rotate（再発行）すること。**

### クライアント様への移管（公開時）

1. クライアント様に Supabase アカウントと Organization を作成いただく
2. Project Settings → General → **Transfer project** を実行
3. 支払い情報をクライアント様側で設定いただく

**データ・設定・マイグレーション履歴はすべて保持されたまま移管される。**
Project Reference ID も変わらないため、環境変数の変更は不要。

---

## 困ったときは

| 症状 | 原因と対処 |
|---|---|
| `Could not find the table 'public.xxx'` | スキーマ未適用。手順1を実施 |
| ログインできるが施設を登録できない | `admin_profiles` 未登録。手順4-2 を実施 |
| `permission denied for table` | 同上、または role が期待と異なる |
| 写真をアップロードできない | ログインしているか、`admin_profiles` に登録済みかを確認 |
| プロジェクトが停止した | 無料プランの7日制限。ダッシュボードから Restore |
| 適用をやり直したい | 開発中のみ: SQL Editor で `drop schema public cascade; create schema public;` の後、手順1を再実行（**データが全消去されるので本番では行わない**） |

### ローカルでの再現・検証

Supabase を触らずにスキーマの挙動を確認できる。

```powershell
cd c:\driver
powershell -File tools/db-reset.ps1     # 作り直し + 適用 + 41項目のテスト
npm run check:sql                       # SQL の構文検証
```
