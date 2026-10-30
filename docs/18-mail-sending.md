# パスワード再設定のメールを、一般の方へ届ける

Supabase 標準の送信は開発用で、プロジェクトのメンバー以外には届かない
（1時間に数通まで）。送信の業者（Resend）を通し、差出人を
`no-reply@kurumayosenavi.com`「車寄せナビ」にする。

**順番を守る。** Supabase を切り替えてから、アプリを本番へ出す。
新しいアプリの「送った後の画面」は新しい件名・差出人を案内するため、
先にアプリを出すと、届くメール（英語・Supabase Auth）と食い違う。
いまの本番の画面は件名を案内していないので、切り替えが先なら食い違わない。

---

## 1. 決めること

| | 決めること | 案 |
|---|---|---|
| 1 | 送信の業者 | Resend（無料の枠：月3,000通・1日100通） |
| 2 | Resend の名義 | Supabase・Vercel と同じ名義 |
| 3 | 問い合わせ先 | Supabase の設定には**返信先の欄が無い**。文面には「送信専用」と書いてある。問い合わせ先を載せるなら、文面の末尾に足す |
| 4 | 試しに受け取るアドレス | Gmail と、携帯会社のアドレス |

## 2. 順番と担当

| | 担当 | すること |
|---|---|---|
| ① | 開発 | Resend に登録し、鍵を2本作る（作業用・送信用） |
| ② | 開発 | Resend にドメイン `kurumayosenavi.com` を足し（地域 Tokyo）、DNS の値を取り出す |
| ③ | — | （ConoHa の作業は開発が預かっているため、発注元へのお願いは無い） |
| ④ | 開発 | ConoHa WING の DNS に下の5行を入れる |
| ⑤ | 開発 | Resend で認証を通す（多くは15分ほど、最大72時間） |
| ⑥ | 開発 | Supabase の管理画面に、下の値と文面を入れる |
| ⑦ | 開発 | 試しのアドレスへ送り、受信箱に入るかを見る |
| ⑧ | 開発 | アプリを本番へ出し、`test-password-reset`・`test-login` を本番で通す |

## 3. ConoHa の DNS に足す行

既存の行（サイト・アプリ・管理画面の A・CNAME）には触れない。
2026-10-29 時点で、このドメインにメールの行（MX・TXT）は1つも無い。

2026-10-30 に Resend へドメインを足した（地域 `ap-northeast-1`）。Resend が返した4行と、
勧める DMARC の1行。値の控えは `docs/out/resend-domain.json`。

| 種類 | 名前 | 値 |
|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCgnmao/zGIg3Bo3dHtI80tzuQQdQ6iOVw6BXJ8qglM7qUPzxzM3pzFybYsOeg83jtLH5tQF5YtSPh4igHOVh+We4ZaonqAr/BoIPoBFZ7s21LuIPWmirIfuaHilLnhLd0n0+9DH3QK3F1Ikyl9ryr9KPgNaDWbib7ad7V8jRLx7QIDAQAB` |
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com`（優先度 10） |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| CNAME | `rsend` | `send.forge.rmta.net` |
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

  * DKIM の値は公開鍵（DNS で誰でも引ける）なので、ここに書いてよい
  * `rsend` の行は、Resend が自分の送信サーバーから送るときの送り手の印。行き先
    `send.forge.rmta.net` には Resend の送信サーバーの SPF が入っている（2026-10-30 に引いて確認）

  * 名前の欄は `send` だけ。`.kurumayosenavi.com` を付けない
  * 値は貼り付けて、一字も変えない（末尾の「.」も消さない）
  * 入ったかは `Resolve-DnsName send.kurumayosenavi.com -Type TXT -Server 8.8.8.8` で引ける
  * ConoHa WING の画面では「DNS → kurumayosenavi.com → 編集（鉛筆の印）→ 行を足す → 保存」。
    同じアカウントにある別のドメインには触れない
  * MX で「優先度」の欄が出ないときは、値を `10 feedback-smtp.ap-northeast-1.amazonses.com` とする

## 4. Supabase に入れるもの

### Authentication → Emails → SMTP Settings

| 欄 | 値 |
|---|---|
| Enable custom SMTP | オン |
| Sender email | `no-reply@kurumayosenavi.com` |
| Sender name | `車寄せナビ` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend の**送信用**の鍵 |

### Authentication → Emails → Reset Password

| 欄 | 値 |
|---|---|
| Subject | `【車寄せナビ】パスワードの再設定` |
| Body | `supabase/templates/reset-password.html` の中身を**全部**貼る |

件名・差出人・ボタンの名前（「パスワードを再設定する」）は、アプリの「送った後の画面」の
案内と同じにしてある（`app/src/lib/i18n/dictionaries.ts` の `resetStep…`）。
**片方だけ変えない。** `test-password-reset` が、文面のボタンの名前と案内が揃っているかを見る。

### 確かめるもの

  * **Email OTP Expiration** が `3600`（1時間）であること。文面に「1時間有効」と書いてある。
    変えるなら文面も直す
  * **Rate Limits → Email sent**：1時間あたりの上限。β版は 30 で足りる見込み。
    Resend の無料の枠は1日100通で、超えた分は送られずに終わる（請求はされない）

## 5. 試しの送信で見ること

  * 受信箱に入るか（迷惑メールに入らないか）。Gmail と携帯会社の両方
  * 件名「【車寄せナビ】パスワードの再設定」、差出人「車寄せナビ」
  * ロゴが出るか（`app.kurumayosenavi.com/icons/icon-192.png` を読む）
  * ボタンから新しいパスワードを決め、そのパスワードでログインできるか
  * Gmail の「メッセージのソースを表示」で SPF・DKIM・DMARC が `PASS`

### 送れないとき

アプリに「うまくいきませんでした」と出るときは、Supabase の **Logs → Auth**（Level を error）で
`/recover` の行を開く。

| 出ている英文 | 原因 |
|---|---|
| `535 "Authentication credentials invalid"` | Username（`resend`）か Password（鍵）が違う。鍵を作り直し、欄を Ctrl+A で全部選んでから貼る（2026-10-30 に一度これで止まった） |
| `dial` ・ `timeout` を含む | Host かポートが違う（前後の空白も見る） |

Resend の「Emails」に1通も出ていなければ、Supabase から Resend へ渡っていない。

## 6. 終わったら

  * Resend の**作業用**の鍵を消す（`admin/.env.local` の `RESEND_API_KEY` も消す）
  * 送信用の鍵は Supabase に入っているものだけにする
