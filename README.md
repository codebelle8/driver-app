# 車寄せナビ (Kurumayose Navi)

タクシー・ハイヤードライバー向け「施設の進入経路・車寄せ位置」確認アプリ。

施設を検索 → 施設内のエントランス／車寄せを選択 → 進入案内図・現地写真・注意事項を確認 →
Google マップアプリでナビ開始、という流れを最短操作で行えることを目的とする。

## リポジトリ構成

| ディレクトリ | 内容 |
|---|---|
| `app/` | モバイルアプリ (React Native + Expo / iOS・Android 共通) |
| `admin/` | 管理画面 (Next.js) |
| `db/` | データベーススキーマ・マイグレーション・シードデータ |
| `data/` | 初期データ投入用テンプレートと受領データ (写真は Git 管理外) |
| `docs/` | 仕様書・設計書・作業手順 |
| `tools/` | 画像変換・一括投入などの補助スクリプト |

## ドキュメント

- [00-environment.md](docs/00-environment.md) — 開発環境セットアップ手順
- [01-client-requirements.md](docs/01-client-requirements.md) — 初期版完成に必要な確認事項（クライアント向け）
- [02-data-spec.md](docs/02-data-spec.md) — データ項目定義書
- [03-screen-spec.md](docs/03-screen-spec.md) — 画面一覧・画面遷移
- [data/templates/README.md](data/templates/README.md) — 施設データ入力手順（クライアント向け）

## 開発フェーズ

| フェーズ | 内容 | 状態 |
|---|---|---|
| Step 1 | 開発環境構築・リポジトリ初期化 | 完了 |
| Step 2 | 要件確定・データ項目定義・画面設計 | 完了 |
| Step 3 | Supabase 構築・API 設計 | 未着手 |
| Step 4 | 管理画面の実装 | 未着手 |
| Step 5 | アプリの実装 | 未着手 |
| Step 6 | 初期データ投入・検証 | 未着手 |
| Step 7 | ストア申請・公開 | 未着手 |

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
```
