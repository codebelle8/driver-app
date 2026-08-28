# 08. アプリの配信

開発中のアプリをクライアント様・調査員の方の実機でご確認いただくための手順。

---

## なぜ Expo Go を使うのか

iPhone へアプリを配る通常の方法（TestFlight）には **Apple Developer Program**
（年額 99 USD）が必要になる。

本件では、その取得依頼を**完成版のご確認後まで後ろ倒し**にする方針を採った。
つまり現時点では TestFlight が使えない。

**Expo Go** は App Store / Google Play にある無料アプリで、これを入れていただければ
開発者アカウントを取得せずに実機でご確認いただける。

| 方法 | Apple/Google アカウント | 実機で使えるか | 備考 |
|---|---|---|---|
| **Expo Go** | **不要** | ○ | QRコードを読むだけ |
| APK 直接配布（Android） | 不要 | ○ | 本物のアプリとして入る |
| TestFlight（iOS） | **必須** | ○ | アカウント取得後 |
| ストア公開 | 必須 | ○ | 最終段階 |

---

## 初回のみ必要な作業

### 1. Expo アカウントを作る

https://expo.dev/signup （無料）

### 2. ログインする

```powershell
cd app
npx eas login
```

**この操作だけは自動化できない**（ブラウザでの本人確認が必要なため）。
一度ログインすれば認証情報は端末に保存される。

---

## 公開する

```powershell
npm run app:check                          # 準備が整っているか見るだけ
npm run app:publish                        # 公開する
node tools/publish-preview.mjs -m "説明"   # 変更内容を添えて公開する
```

初回は次がまとめて実行される。

1. Expo 上にプロジェクトを作成する
2. 更新の配信先を設定する（`app.json` に書き込まれる）
3. `preview` として公開する

完了すると URL と QR コードが表示される。これをお送りする。

---

## クライアント様にしていただくこと

1. App Store（iPhone）または Google Play（Android）で **「Expo Go」** を入れる
2. 送られた QR コードを読み取る

> iPhone は標準のカメラアプリで読み取れる。
> Android は Expo Go を開いてから、アプリ内の読み取り機能を使う。

以降、更新するたびに同じ QR / URL から最新のものが開く。
**再度お送りする必要はない。**

---

## Android には APK も配れる

Expo Go は「Expo Go の中で動くアプリ」なので、起動の仕方が本物と異なる。
実際の使用感に近い形でご確認いただきたい場合は、Android なら
**アカウント不要で本物のアプリを配れる**。

```powershell
cd app
npx eas build --profile preview --platform android
```

`eas.json` の `preview` は `buildType: "apk"` にしてあるため、
ダウンロードして直接インストールできる形式で出力される。

> 完了までクラウド上のビルドで 10〜20 分ほどかかる。
> 無料枠には月あたりの回数制限があるため、毎回は使わず節目で使う。

---

## SDK の版について（重要な申し送り）

**このプロジェクトは Expo SDK 54 を使っている。**

下げた理由:
  確認に使う端末の Expo Go が 54.0.8（対応SDK 54）で、SDK 57 の
  プロジェクトは「Project is incompatible with this version of Expo Go」
  として開けなかった。Expo Go は自身が対応する SDK のものしか開けない。

  端末側の Expo Go を更新すれば SDK 57 のままで開けるが、更新できない
  端末に合わせて下げる判断を採った。

**リリース前に SDK 57 へ戻すことを検討すること。**
  SDK 57 が最新で、54 は3世代前にあたる。実機確認を Expo Go ではなく
  開発用ビルド（APK）で行うようにすれば、Expo Go の版に縛られなくなり、
  最新の SDK を使える。

  戻す手順:

```powershell
cd app
npm install expo@^57.0.0
npx expo install --fix
```

  今回下げた際、**アプリ側のコードは一切変更が要らなかった**
  （使っている API が 54〜57 で共通のため）。戻す際も同様の見込み。

---

## OTA 配信まわりの設定について（重要な申し送り）

Expo Go で確認する間、`app.json` から **2つの設定を外してある。**
どちらも製品版の無審査更新配信（OTA）のためのもので、Expo Go では
機能しないばかりか、起動の妨げになる。

### 1. `runtimeVersion`

外した理由:
  `{ "policy": "appVersion" }` にしていると、配信する manifest の
  runtimeVersion がアプリのバージョン（`1.0.0`）になる。Expo Go は
  自分の runtime（`exposdk:54.0.0`）と比べて一致しないため、
  「Project is incompatible with this version of Expo Go」で開けない。

### 2. `updates`

外した理由:
  `checkAutomatically: "ON_LOAD"` は起動時に更新を確認しに行く設定だが、
  配信先（`updates.url`）が未設定のため、存在しない更新の取得を
  待ち続けて起動が止まる。画面下に
  「New update available, downloading...」が出たまま進まなくなる。

### 製品版のビルドに移る際に戻す値

```json
"updates": {
  "checkAutomatically": "ON_LOAD",
  "fallbackToCacheTimeout": 3000
},
"runtimeVersion": { "policy": "appVersion" }
```

**この2つを戻すと Expo Go では開けなくなる。** つまり
「Expo Go で確認する時期」と「製品版を配信する時期」は両立しない。
実機確認を開発用ビルド（APK）へ切り替える段階で戻す。

---

## Expo Go でできないこと

| 項目 | 可否 | 影響 |
|---|---|---|
| 画面・機能の確認 | ○ | 問題なし |
| 検索・ナビ起動 | ○ | 問題なし |
| 写真の表示 | ○ | 問題なし |
| アプリのアイコン・起動画面 | **×** | Expo Go のものが出る |
| 無審査での更新配信（OTA）の API | **×** | 配信自体は動く。API を呼ぶ機能のみ不可 |

上2つは製品版では正しく出る。**確認の妨げにはならないが、
「アイコンが違う」とご指摘をいただきやすいので先にお伝えしておく。**

---

## クライアント様への文案

> 上野様
>
> 開発中のアプリを、お手元の端末でご確認いただけるようになりました。
>
> **ご準備（初回のみ）**
> 1. App Store（iPhone）または Google Play（Android）で「Expo Go」という無料アプリをお入れください
> 2. 下記の QR コードを読み取ってください
>
> （QRコード）
>
> 以降、更新のたびに同じコードから最新のものが開きますので、再度お送りする必要はございません。
>
> なお、現在はご確認用の仕組みで動かしているため、**アプリのアイコンと起動画面は「Expo Go」のもの**が表示されます。製品版では正しく表示されますのでご安心ください。
>
> お気づきの点がございましたら、どんな細かいことでもお知らせください。
