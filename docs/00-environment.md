# Step 1 — 開発環境セットアップ記録

構築日: 2026-08-06 / 対象マシン: Windows 10 Pro 22H2 (x64)
フレームワーク: **React Native + Expo**（Flutter から変更）

## 0. フレームワーク選定の経緯と、Windows での iOS ビルドについて

**重要な前提**: React Native そのものを選んでも、Windows で iOS アプリをビルドすることは
できません。iOS のネイティブビルドと App Store への申請には macOS と Xcode が必須で、
これは Flutter でも React Native でも同じです。

Windows のみで iOS 版を出せるようにする実体は **EAS Build**（Expo のクラウドビルド
サービス）です。ソースコードを EAS に送ると、Expo 側の macOS マシンでビルドされ、
`.ipa` が返ってきます。TestFlight への配信も `eas submit` で Windows から実行できます。

そのため本プロジェクトでは、素の React Native CLI ではなく **Expo** 構成を採用しています。

| | Windows での可否 | 方法 |
|---|---|---|
| Android 開発ビルド | ○ | ローカル (`npx expo run:android`) |
| Android リリースビルド | ○ | ローカル または EAS Build |
| **iOS ビルド** | **○（クラウド経由）** | **EAS Build 必須** |
| iOS 実機テスト配信 | ○ | `eas submit` → TestFlight |
| iOS シミュレータ | × | macOS が必要。実機 or TestFlight で代替 |

### 費用面の注意

- **EAS Build**: 無料枠は月あたりのビルド回数が限られる。開発中は有料プラン
  （Production プラン程度）が実質的に必要。**当方側の開発コスト**として計上する。
- **Apple Developer Program**: 年額 約15,000円。EAS を使っても**必須**（クライアント様名義）。
- Android のみローカルビルドで回せるため、日常の開発は Android 中心、
  iOS は節目ごとに EAS でビルドして確認する運用が効率的。

---

## 1. インストール済みツールチェーン

| ツール | バージョン | インストール先 |
|---|---|---|
| Node.js | v24.19.0 | `C:\Program Files\nodejs` |
| npm | 11.17.0 | 同上 |
| Git | 2.55.0.windows.3 | `C:\Program Files\Git` |
| Microsoft OpenJDK | 17.0.20.8 | `C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot` |
| Android SDK | platform 36 / build-tools 35.0.0・36.0.0 / platform-tools 37.0.1 / NDK 27.1・28.2 | `C:\Android\sdk` |
| Gradle | 9.3.1 (wrapper 経由で自動取得) | — |
| EAS CLI | グローバルインストール | `npm i -g eas-cli` |
| VS Code | 導入済み | — |

**Flutter / Dart SDK は削除済み**（`C:\src\flutter`、環境変数 PATH からも除去済み）。

## 2. 環境変数（システム環境変数に設定済み）

```
JAVA_HOME        = C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot
ANDROID_HOME     = C:\Android\sdk
ANDROID_SDK_ROOT = C:\Android\sdk

Path に追加:
  C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot\bin
  C:\Android\sdk\platform-tools
  C:\Android\sdk\cmdline-tools\latest\bin
```

> システム環境変数を変更しているため、**既に開いているターミナル / VS Code は
> 一度再起動**してください。

## 3. アプリのバージョン構成

| パッケージ | バージョン |
|---|---|
| Expo SDK | 57.0.10 |
| React Native | 0.86.2 |
| React | 19.2.3 |
| TypeScript | 6.0.3 |
| expo-router | 57.0.10（ファイルベースルーティング） |

### 追加インストール済みパッケージ

| パッケージ | 用途 |
|---|---|
| `@supabase/supabase-js` + `react-native-url-polyfill` | DB / Storage クライアント |
| `expo-sqlite` | 施設カタログのオフラインキャッシュ |
| `expo-file-system` | 案内図・写真のローカルキャッシュ |
| `@react-native-async-storage/async-storage` | 設定値・同期バージョンの保存 |
| `expo-clipboard` | 「座標をコピー」「住所をコピー」機能 |
| `expo-linking` | Google マップアプリへのディープリンク連携 |
| `expo-image` | 写真の表示とキャッシュ（テンプレート同梱） |
| `expo-updates` | **ストア審査を通さずに修正を配信**（OTA アップデート） |

> `expo-updates` は本プロジェクトで特に価値が高い。施設データの表示不具合や
> 文言修正を、App Store / Google Play の審査（数日）を待たずに配信できる。
> ※ ネイティブコードの変更を伴う修正は対象外で、通常のストア申請が必要。

## 4. アプリ設定 (`app/app.json`)

| 項目 | 値 | 備考 |
|---|---|---|
| アプリ名 | 車寄せナビ | 要クライアント確認 |
| slug | `kurumayose-navi` | |
| iOS bundleIdentifier | `net.levelsurface.kurumayose` | **仮。公開後は変更不可**のため要確認 |
| Android package | `net.levelsurface.kurumayose` | 同上 |
| URL scheme | `kurumayose://` | |
| 画面の向き | portrait 固定 | 運転中の利用を想定 |
| 配色モード | `dark` 固定 | デモ画面のデザインに合わせる |
| OTA 更新方針 | `runtimeVersion: appVersion` | |

**`ios.infoPlist.LSApplicationQueriesSchemes` に `comgooglemaps` / `maps` を登録済み。**
これが無いと iOS で「Google マップアプリがインストールされているか」の判定ができない。

> Android 11 以降では、`Linking.canOpenURL()` に `<queries>` のマニフェスト宣言が必要。
> 本プロジェクトでは判定を行わず、`openURL()` を直接呼んで失敗時に
> ブラウザ版 Google マップへフォールバックする方式を採る（Step 5 で実装）。

## 5. ビルドプロファイル (`app/eas.json`)

| プロファイル | 用途 | 成果物 |
|---|---|---|
| `development` | 開発用クライアント | APK / 実機用 ipa |
| `preview` | **クライアント様・ドライバーの実機テスト用** | APK / TestFlight |
| `production` | ストア申請用 | AAB / ipa（ビルド番号自動採番） |

## 6. リポジトリ構成

```
c:\driver\
├─ app\        React Native + Expo アプリ
├─ admin\      Next.js 管理画面 (Next 16.3 / React 19.2 / TypeScript / Tailwind)
├─ db\         スキーマ・マイグレーション・シード
├─ data\       初期データ投入用テンプレートと受領データ
├─ docs\       仕様書・設計書
├─ tools\      補助スクリプト
└─ .vscode\    エディタ設定・推奨拡張機能
```

`app/android/` と `app/ios/` は **Git 管理外**。Expo の CNG（Continuous Native
Generation）により `npx expo prebuild` でいつでも再生成できるため。
ネイティブコードを直接編集する必要が生じた場合のみ、`.gitignore` から外す。

## 7. 動作確認コマンド

```powershell
# アプリ
cd c:\driver\app
npx expo-doctor                          # 依存関係の健全性チェック
npx tsc --noEmit                         # 型チェック
npx expo start                           # 開発サーバー
npx expo prebuild -p android --clean     # ネイティブプロジェクト生成
cd android; .\gradlew.bat assembleDebug  # ローカル Android ビルド

eas login
eas build -p android --profile preview   # クラウドビルド
eas build -p ios     --profile preview   # クラウドビルド (Mac 不要)

# 管理画面
cd c:\driver\admin
npm run dev                              # http://localhost:3000
npm run build
```

## 8. 未設定（Step 2 以降で対応）

- [ ] Supabase プロジェクト作成と `.env.local` の設定（app / admin 両方）
- [ ] Google Cloud プロジェクト / Maps API キー（管理画面の座標ピン指定用）
- [ ] Expo アカウント作成と `eas init`（プロジェクト ID の発行）
- [ ] Apple Developer Program / Google Play Console のアカウント（クライアント様名義）
- [ ] Android 実機または エミュレータ (AVD) の用意
- [ ] アプリアイコン・スプラッシュ画像の差し替え

## 9. 認証情報の取り扱いルール

- API キー・秘密鍵の類は **Git にコミットしない**（`.gitignore` 設定済み）
- Expo では **`EXPO_PUBLIC_` 接頭辞の環境変数はアプリのバンドルに埋め込まれる**。
  バンドルを解析すれば読み取れるため、秘密にすべき値を入れてはならない。
  Supabase の anon key は公開前提のキーなので可。**service role key は絶対に不可**
- 署名鍵は EAS がクラウドで管理する（`eas credentials` で確認・エクスポート可能）。
  Android の keystore はローカルにもバックアップを取り、クライアント様と共有の
  パスワード管理ツールで保管する。**紛失するとアプリのアップデート配信ができなくなる**
