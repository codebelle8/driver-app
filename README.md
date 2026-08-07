# 車寄せナビ (Kurumayose Navi)

タクシー・ハイヤードライバー向け「施設の進入経路・車寄せ位置」確認アプリ。

施設を検索 → 施設内のエントランス／車寄せを選択 → 進入案内図・現地写真・注意事項を確認 →
Google マップアプリでナビ開始、という流れを最短操作で行えることを目的とする。

## リポジトリ構成

| ディレクトリ | 内容 |
|---|---|
| `app/` | モバイルアプリ (React Native + Expo / iOS・Android 共通) |
| `admin/` | 管理画面 (Next.js) |
| `supabase/` | **本番へ適用されるマイグレーション**（Supabase CLI 標準レイアウト） |
| `db/` | ローカル検証用スタブ (`local/`) とスキーマ検証テスト (`tests/`) |
| `data/` | 初期データ投入用テンプレートと受領データ (写真は Git 管理外) |
| `docs/` | 仕様書・設計書・作業手順 |
| `tools/` | 画像変換・一括投入などの補助スクリプト |

## ドキュメント

- [00-environment.md](docs/00-environment.md) — 開発環境セットアップ手順
- [01-client-requirements.md](docs/01-client-requirements.md) — 初期版完成に必要な確認事項（クライアント向け）
- [02-data-spec.md](docs/02-data-spec.md) — データ項目定義書
- [03-screen-spec.md](docs/03-screen-spec.md) — 画面一覧・画面遷移
- [04-scope-and-acceptance.md](docs/04-scope-and-acceptance.md) — 初期版スコープと検収条件
- [05-photo-guide.md](docs/05-photo-guide.md) — 現地写真 撮影ガイド（クライアント向け）
- [06-supabase-setup.md](docs/06-supabase-setup.md) — Supabase セットアップ手順
- [data/templates/README.md](data/templates/README.md) — 施設データ入力手順（クライアント向け）

## 開発フェーズ

初期版 (MVP) の完成までは全 10 ステップ。

| Step | 内容 | 目安 | 状態 |
|---|---|---|---|
| 1 | 開発環境構築・リポジトリ初期化 | — | **完了** |
| 2 | データ設計・画面設計・入力テンプレート | — | **完了** |
| 3 | Supabase 構築（スキーマ適用・RLS 検証・画像変換） | 2〜3日 | 未着手 |
| 4 | 管理画面 ① 認証・施設/進入口の登録編集・地図ピン・写真 | 1.5週 | 未着手 |
| 5 | 管理画面 ② CSV一括投入・カテゴリ・公開管理・ダッシュボード | 1週 | 未着手 |
| 6 | カタログ配信基盤（スナップショット生成 → CDN → 差分同期） | 3〜4日 | 未着手 |
| 7 | アプリ ① 基盤（オフライン同期・SQLite・デザインシステム） | 1週 | 未着手 |
| 8 | アプリ ② 検索・一覧・施設詳細・ビューア・ナビ連携 | 1.5〜2週 | 未着手 |
| 9 | 実機テスト配布・初期データ投入・現地検証 | 1〜2週 | 未着手 |
| 10 | ストア申請・公開 | 1週＋審査 | 未着手 |

**Step 4 完了時点でクライアント様のデータ入力を開始でき**、以降はアプリ実装と並行して進む。
**Step 9 で初めてドライバーの方の実機に入る。**

初期版の後は、運用版（会員登録・サブスクリプション・お気に入り・閲覧履歴・プッシュ通知）、
最終版（鉄道・航空・道路交通情報、広告、一般公開、3,000件規模への拡張）と続く。

## 技術構成 (初期版)

- **アプリ**: React Native + Expo (iOS / Android 単一コードベース)、オフラインキャッシュに SQLite
- **ビルド**: EAS Build — **iOS ビルドもクラウド上の macOS で実行されるため、Mac 不要**
- **バックエンド**: Supabase (PostgreSQL + Storage + CDN)
- **管理画面**: Next.js (App Router) + TypeScript
- **地図**: 表示は施設ごとの進入案内図画像、ナビは Google マップアプリへディープリンク連携

## よく使うコマンド

```powershell
# アプリ
cd app
npx expo start                      # 開発サーバー起動
npx tsc --noEmit                    # 型チェック
npx expo-doctor                     # 依存関係の健全性チェック
eas build -p android --profile preview   # クラウドビルド (APK)
eas build -p ios     --profile preview   # クラウドビルド (Mac 不要)

# 管理画面
cd admin
npm run dev                         # http://localhost:3000
npm run build

# データベース (ローカル検証用 PostgreSQL)
powershell -File tools/db-reset.ps1  # 作り直し + マイグレーション適用 + テスト
node tools/check-sql.mjs             # SQL の構文検証
node tools/check-templates.mjs       # 入力シートの検証
```

> `db/local/` はローカル検証専用の Supabase スタブ。**Supabase には適用しないこと。**
> `db/migrations/` は無改変で Supabase に適用できる状態を保つ。
