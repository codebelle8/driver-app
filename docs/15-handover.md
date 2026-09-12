# 引き渡しの手順

開発を終えて、運用を発注元へお渡しするときの作業をまとめています。

  **この作業は、当方が鍵を使う必要が無くなってから行ってください。**
  鍵を回すと、当方の検査・配備の道具はすべて動かなくなります。
  途中で回すと、直しを入れるたびに回し直すことになります。

---

## 1. 引き渡す前に、そろっているか

お渡しの前に、次が埋まっていることをご確認ください。
いずれも**管理画面から入れるもの**で、こちらでは入れられません。

| | 場所 | 埋まっていないと |
|---|---|---|
| 受取口座 | 会員・お支払い | ドライバーに振込先を出せない |
| お問い合わせ先（メール） | サイト設定 | 困った方の行き先が無い |
| 利用規約のURL | サイト設定 | 公開・課金に必要 |
| プライバシーポリシーのURL | サイト設定 | 同上 |
| 特定商取引法に基づく表記のURL | サイト設定 | 継続課金に必要 |

  文面の雛形は `docs/13-legal-templates.md` にあります。
  操作は `docs/14-admin-manual.md` の8章・12章です。

**メールの送信元**も決めておく必要があります。決まっていないあいだ、
パスワード再設定のメールは Supabase の既定の送信元から出ます。
**届くかどうかを、実際のアドレスで一度お試しください。**

---

## 2. お渡しするもの

| | 中身 |
|---|---|
| ソースコード一式 | この git のリポジトリ |
| Supabase | 所有者を発注元へ移す（下記3） |
| Vercel | アプリと管理画面。所有者を移すか、発注元のアカウントへ配備し直す |
| Google Maps の鍵 | 発注元の Google Cloud で取り直す（下記4） |
| 管理画面の使い方 | `docs/14-admin-manual.md` |
| 規約類の雛形 | `docs/13-legal-templates.md` |

---

## 3. Supabase の鍵を回す

**いちばん間違えやすい作業です。順番を守ってください。**

### 何が起きるか

Supabase の JWT の秘密を回すと、**anon と service_role の両方が同時に
変わります。** 片方だけを変えることはできません。

  * **anon**（公開鍵）… アプリの配布物の中に入っています。
    回した瞬間、**配信中のアプリが動かなくなります**
  * **service_role**（秘密鍵）… 管理画面のサーバーと、当方の道具が
    使っています。これも同時に止まります

  **数分のあいだ、アプリも管理画面も止まります。**
  ドライバーが使っていない時間帯（深夜など）に行ってください。

### 手順

1. **先に、新しい鍵を受け取る準備をする**
   Vercel の2つのプロジェクト（アプリ・管理画面）の設定画面を開いておく

2. **Supabase で回す**
   Project Settings → API → JWT Settings → **Generate a new secret**

3. **新しい鍵を控える**
   同じ画面に出る `anon` と `service_role` を控える

4. **アプリ側の鍵を差し替える**（Vercel の環境変数）

   ```
   EXPO_PUBLIC_SUPABASE_ANON_KEY = 新しい anon
   ```

5. **管理画面側の鍵を差し替える**（Vercel の環境変数）

   ```
   NEXT_PUBLIC_SUPABASE_ANON_KEY   = 新しい anon
   SUPABASE_SERVICE_ROLE_KEY       = 新しい service_role
   ```

6. **両方を配備し直す**

   ```
   cd app && npx vercel --prod --yes
   npm run deploy:admin
   ```

   **アプリは必ず配備し直してください。** anon 鍵は配布物の中に
   焼き込まれているため、環境変数を変えただけでは反映されません。

7. **動くことを確かめる**

   ```
   node tools/test-login.mjs https://kurumayose-navi.vercel.app
   node tools/test-navigation.mjs https://kurumayose-navi.vercel.app
   ```

8. **当方の手元の鍵を消す**

   `app/.env.local` と `admin/.env.local` を削除します。
   これらは git に入っていません（`.gitignore` 済み）。

### なぜ回すのか

`service_role` は**行ごとの権限（RLS）をすべて素通りします。**
会員の名簿も、顔写真も、操作履歴も、この鍵があれば読み書きできます。

開発のあいだ、この鍵は当方の手元にありました。**お渡しした後も
当方が持ったままでは、発注元だけが管理している状態になりません。**

---

## 4. Google Maps の鍵

いまの鍵は当方の Google Cloud で取ったものです。
**表示のたびに課金が発生します。**

1. 発注元の Google Cloud で、新しい鍵を取る
   （手順は `docs/06-supabase-setup.md` の手順6）
2. **必ず制限をかける**
   * アプリケーションの制限 … HTTP リファラー
     `https://kurumayose-navi.vercel.app/*`
     `https://kurumayose-navi-admin.vercel.app/*`
   * API の制限 … Maps JavaScript API のみ
3. Vercel の環境変数を差し替え、配備し直す

   ```
   アプリ側   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
   管理画面側 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
   ```

   アプリ側は**配備し直さないと反映されません**（配布物に焼き込まれます）。

  **制限をかけずに配ると、鍵を拾った第三者の利用分まで請求されます。**

---

## 5. 引き渡し後、発注元で行う運用

| いつ | すること | 章 |
|---|---|---|
| 施設が増えたとき | 登録して公開する | 手順書 3章 |
| 現地が変わったとき | 入口・車寄せを直す／注意事項を出す | 手順書 4・5章 |
| 入金があったとき | 「入金を確認した」を押す | 手順書 8章 |
| 大きな変更のとき | お知らせを送る | 手順書 9章 |
| スタッフが増えたとき | アカウントを発行する | 手順書 10章 |

「手順書」＝ `docs/14-admin-manual.md`

---

## 6. 当方で回している検査について

`tools/` にある検査は、**引き渡し後も動きます。** ただし
`admin/.env.local` の `SUPABASE_SERVICE_ROLE_KEY` が要ります。

発注元で回される場合は、新しい鍵を同じ名前で置いてください。
**検査は毎回、使い捨ての会員・アカウントを作って最後に消します。**
発注元のデータには残りません。

  主なもの（本番へ向けて回せます）

  ```
  node tools/test-login.mjs https://kurumayose-navi.vercel.app
  node tools/test-navigation.mjs https://kurumayose-navi.vercel.app
  node tools/test-offline.mjs https://kurumayose-navi.vercel.app
  node tools/check-account-guard.mjs
  node tools/check-bundle.mjs
  ```

---

## 7. 手元の開発環境について（申し送り）

**管理画面の開発サーバー（`npm run dev`）が、この環境では動きません。**

  Turbopack が PostCSS 用の子プロセスを起こせずに落ちます。
  `node process exited ... exit code: 0xc0000142`
  （Windows の DLL 初期化失敗）。再起動しても再現します。

  `next build` は通るため、**配備には影響しません。**
  手元で確かめるときは、次で立ててください。

  ```
  cd admin
  npx next build
  npx next start -p 3000
  ```

  別の環境（Linux・macOS）では起きない見込みです。
