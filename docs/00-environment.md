# Step 1 — 開発環境セットアップ記録

構築日: 2026-08-06 / 対象マシン: Windows 10 Pro 22H2 (x64)

## 1. インストール済みツールチェーン

| ツール | バージョン | インストール先 |
|---|---|---|
| Node.js | v24.19.0 | `C:\Program Files\nodejs` |
| npm | 11.17.0 | 同上 |
| Git | 2.55.0.windows.3 | `C:\Program Files\Git` |
| Flutter SDK | 3.44.8 (stable) | `C:\src\flutter` |
| Dart | 3.12.2 (Flutter 同梱) | 同上 |
| Microsoft OpenJDK | 17.0.20.8 | `C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot` |
| Android SDK | platform 36 / build-tools 36.0.0 / platform-tools 37.0.1 | `C:\Android\sdk` |
| VS Code | 導入済み | — |

## 2. 環境変数（システム環境変数に設定済み）

```
JAVA_HOME        = C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot
ANDROID_HOME     = C:\Android\sdk
ANDROID_SDK_ROOT = C:\Android\sdk

Path に追加:
  C:\src\flutter\bin
  C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot\bin
  C:\Android\sdk\platform-tools
  C:\Android\sdk\cmdline-tools\latest\bin
```

> システム環境変数を変更しているため、**既に開いているターミナル / VS Code は
> 一度再起動**しないと `flutter` コマンドが認識されません。

## 3. 再現手順（別マシンで環境を作り直す場合）

```powershell
# Node.js / Git
winget install OpenJS.NodeJS.LTS
winget install Git.Git

# JDK 17
winget install Microsoft.OpenJDK.17

# Flutter SDK
#   https://docs.flutter.dev/get-started/install/windows から zip を取得し C:\src へ展開

# Android SDK (コマンドラインツールのみ、Android Studio 不要)
#   https://developer.android.com/studio#command-line-tools-only の zip を
#   C:\Android\sdk\cmdline-tools\latest へ展開
sdkmanager --sdk_root=C:\Android\sdk "platform-tools" "platforms;android-36" "build-tools;36.0.0"
sdkmanager --sdk_root=C:\Android\sdk --licenses    # すべて y

flutter config --android-sdk C:\Android\sdk
flutter doctor
```

## 4. リポジトリ構成

```
c:\driver\
├─ app\        Flutter アプリ    (package: net.levelsurface.kurumayose)
├─ admin\      Next.js 管理画面  (Next 16.3 / React 19.2 / TypeScript / Tailwind)
├─ db\         スキーマ・マイグレーション・シード
├─ data\       初期データ投入用テンプレートと受領データ
├─ docs\       仕様書・設計書
├─ tools\      補助スクリプト
└─ .vscode\    エディタ設定・推奨拡張機能
```

Git: `main` ブランチで初期化済み。`core.autocrlf=false` / `core.longpaths=true`。
`data/import/` `data/photos/` および `.env` は `.gitignore` により Git 管理外。

## 5. 主要な依存パッケージ（管理画面）

| パッケージ | バージョン | 用途 |
|---|---|---|
| next | 16.3.0 | フレームワーク |
| react | 19.2.8 | — |
| @supabase/supabase-js | 2.112.x | DB / Storage クライアント |
| @supabase/ssr | — | サーバーサイド認証セッション |
| zod | — | 入力バリデーション |
| tailwindcss | 4.x | スタイリング |

## 6. 動作確認コマンド

```powershell
# アプリ
cd c:\driver\app
flutter doctor          # すべて [√] であること（ライセンス警告が出ないこと）
flutter build apk --debug

# 管理画面
cd c:\driver\admin
npm run dev             # http://localhost:3000
npm run build
```

## 7. 未設定（Step 2 以降で対応）

- [ ] Supabase プロジェクト作成と `admin/.env.local` の設定
- [ ] Google Cloud プロジェクト / Maps API キー（管理画面の座標ピン指定用）
- [ ] Android 実機または エミュレータ (AVD) の用意
- [ ] iOS ビルド環境 — **macOS が必須**。Windows では iOS の実機ビルド・
      App Store 申請ができないため、下記いずれかの対応が必要
      1. Mac 実機を用意する
      2. Codemagic / Bitrise 等の CI で macOS ビルドを実行する（推奨・月額課金）
      3. Mac のクラウドレンタルサービスを利用する

      Android 版のみ先行してリリースし、iOS は macOS 環境確保後に追う進め方も可能。

## 8. 認証情報の取り扱いルール

- API キー・秘密鍵の類は **Git にコミットしない**（`.gitignore` 設定済み）
- 各サービスの実キーは `.env.local` に置き、雛形のみ `.env.example` として共有する
- 署名鍵（`*.keystore` / `*.p12` / `*.p8`）はクライアント様と共有の
  パスワード管理ツールまたは暗号化ストレージで保管する。**紛失するとアプリの
  アップデート配信ができなくなる**ため、必ず二重に保管する
