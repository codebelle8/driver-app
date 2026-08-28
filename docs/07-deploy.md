# 07. 管理画面の公開手順

管理画面（`admin/`）を Vercel へ公開し、クライアント様がブラウザから
利用できる状態にするための手順。

---

## なぜ公開するのか

開発中の管理画面は開発者のPC上（`localhost:3000`）でしか動かない。
この状態ではクライアント様は進捗を確認できず、施設データの入力も始められない。

公開しておくことで次が可能になる。

- クライアント様がいつでも進捗を確認できる
- 施設データの入力を、アプリ完成を待たずに開始できる
- 撮影した写真をその場で登録できる

---

## 初回のみ必要な作業

### 1. Vercel にログインする

```powershell
npx vercel login
```

ブラウザが開くので、メールアドレスまたは GitHub 等で認証する。
**この操作だけは自動化できない**（ブラウザでの本人確認が必要なため）。

一度ログインすれば認証情報は端末に保存され、以降は不要。

### 2. 公開する

```powershell
npm run deploy:admin
```

これで次がまとめて実行される。

1. Vercel 上にプロジェクトを作成する
2. `admin/.env.local` の環境変数を Vercel へ反映する
3. 本番として公開する

### 公開先

**https://kurumayose-navi-admin.vercel.app**

Vercel プロジェクト名は `kurumayose-navi-admin`、
所有アカウントは `aprofessional0575-4639`（Supabase の管理者と同じ）。

> 公開のたびに `kurumayose-navi-admin-xxxxx.vercel.app` という
> 個別URLも作られるが、そちらは Vercel のログインが必要な保護付き。
> クライアント様にお伝えするのは上記の固定URLのみ。

---

## 2回目以降

```powershell
npm run deploy:admin          # 本番を更新する
npm run deploy:admin:preview  # 検証用URLへ公開（本番は変わらない）
```

環境変数は**公開のたびに `.env.local` から入れ直される**。
キーを更新したのに Vercel 側が古いままで動かない、という事故を防ぐため。

大きな変更を入れるときは検証用URLで先に確認してから本番へ出すとよい。

---

## 設定内容

### 実行場所

`admin/vercel.json` で `hnd1`（東京）を指定している。
既定は米国東部（`iad1`）で、日本からの応答が 150ms 前後遅くなるため。

適用されているかは応答ヘッダで確認できる。

```powershell
curl -s -D - -o /dev/null https://kurumayose-navi-admin.vercel.app/login
# X-Vercel-Id: hnd1::hnd1::...  ← hnd1 なら東京で動いている
```

> `vercel project inspect` の «Sandbox / Region» は別機能の設定であり、
> ここが `iad1` でも上のヘッダが `hnd1` なら東京で動いている。

### 環境変数

| 変数 | 用途 | 種別 | ブラウザへ配信 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 接続先 | `config` | される |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 一般権限の鍵（RLS が効く） | `config` | される |
| `SUPABASE_SERVICE_ROLE_KEY` | **RLS を迂回する鍵** | `secret` | **されない** |

Vercel は `NEXT_PUBLIC_` の付いた「鍵に見える値」に対し、
公開が意図的かどうかの明示（`--type config` / `--type secret`）を求める。
`tools/deploy-admin.mjs` の `TYPE` にその判断を集約してある。

anon キーを公開してよい理由は、**権限を制御しているのが鍵ではなく RLS だから**。
anon キーで到達できる範囲は `npm run verify:prod` で検証している。

#### 漏れていないことの確認

公開後は実際に配信物を取得して確認する。

```powershell
node tools/check-bundle.mjs
```

配信される全 JavaScript を取得し、`SUPABASE_SERVICE_ROLE_KEY` の値が
含まれていないことを確かめる。

### 応答ヘッダ

`vercel.json` で以下を付与している。

- `X-Frame-Options: DENY` — 他サイトの枠内に埋め込ませない（クリックジャッキング対策）
- `X-Content-Type-Options: nosniff` — 内容から種類を推測させない
- `Referrer-Policy: strict-origin-when-cross-origin` — 外部へ遷移する際に URL の詳細を渡さない

---

## アクセス制限について

公開URLは誰でも到達できる。**保護しているのはログイン画面のみ。**

`admin/src/proxy.ts` が全リクエストを検査し、未ログインなら `/login` へ送る。
そのため中身は見えないが、次の点に注意する。

- 管理者アカウントのパスワードは十分に長いものにする
- 退職・契約終了時は Supabase の Users から削除する
- 公開前に `SUPABASE_SERVICE_ROLE_KEY` を再発行する（開発中に共有された可能性があるため）

---

## 元に戻す

Vercel のダッシュボードで過去の公開履歴から「Promote to Production」を選ぶと、
以前の状態へ即座に戻せる。ビルドし直す必要はない。

---

## 利用プランについて

現在は **Hobby（無料）** で運用している。
Vercel の利用規約では Hobby は非商用の個人利用を想定しているため、
**クライアント様が実運用を開始する前に Pro（月額 $20）へ移行する**。

移行時はクライアント様名義のアカウントを作成し、開発者を Member として
招待する形が望ましい（契約終了後も運用が継続できるため）。
