/**
 * 画面に出す文言。
 *
 * **なぜ辞書に集めるか**
 *   これまでは画面の中に直に書いていた。169個あり、同じ言い回しが
 *   複数の画面に散っていた（「すべて選ぶ」「やめる」など）。
 *   直すときに片方だけ直る形になっていた。
 *
 * **管理画面と同じ形にしている**
 *   admin/src/lib/i18n/dictionaries.ts と同じ組み立て方にした。
 *   両方を触る場面が多く、形が違うと読み替えの手間が増える。
 *
 * **施設のデータはここに入らない**
 *   施設名・住所・進入方法の説明は発注元が入力したもので、
 *   別の場所（データベースの英語欄）で扱う。ここにあるのは
 *   ボタンや見出しといった画面の骨組みだけ。
 */

export const LOCALES = ['ja', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ja';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** 言語の名前は、その言語自身の表記で出す。英語表示でも「日本語」のまま。 */
export const LOCALE_NAME: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
};

const ja = {
  tabs: {
    search: '探す',
    favorites: 'お気に入り',
    history: '履歴',
    chat: 'チャット',
    mypage: 'マイページ',
    /** 読み上げに、選ばれていることを添える */
    showing: '{name}（表示中）',
  },

  brand: {
    tagline1: 'スムーズな到着を、',
    tagline2: 'もっと快適に。',
    /** ロゴを押したときの行き先。読み上げに使う。 */
    toSearch: '探す画面へ',
    toSettings: '設定へ',
  },

  common: {
    count: '{n} 件',
    close: '閉じる',
    closeWith: '{title}。閉じる',
    back: '戻る',
    seeAll: 'すべて見る',
    seeAllCount: 'すべて見る ({n})',
    select: '選択',
    selectAll: 'すべて選ぶ',
    unselectAll: 'すべて外す',
    stop: 'やめる',
    selected: '（選択中）',
    /* 管理者に消された施設。名前の控えが無いときの言い方。 */
    deletedFacility: '削除された施設',
    deletedBadge: '削除済み',
    menu: 'メニュー',
    retry: '取り込み直す',
    top: '先頭へ',
    topLabel: '一覧の先頭へ戻る',
  },

  /** 消してよいかを尋ねる札 */
  confirm: {
    noUndo: '元には戻せません。',
    delete: '削除する',
  },

  search: {
    lead: '行きたい場所を見つけよう',
    placeholder: '施設名・よみがな・住所',
    clear: '打ったものを消す',
    here: '現在地',
    area: '案内できる範囲',
    categoryTitle: 'カテゴリから探す',
    recentTitle: '最近見たスポット',
    recentEmpty: 'まだ見た施設がありません',
    prevCategory: '前のカテゴリを表示',
    nextCategory: '次のカテゴリを表示',
    allFacilities: 'すべての施設',
    /** 「ホテル・「帝国」」のような見出し */
    filtered: '{category}・「{query}」',
    waiting: '取り込み待ち',
    registered: '{n} 件を登録',
    areaOne: '{name}（{n}件）',
    areaMore: '{name} ほか（{n}件）',
    loading: '施設の情報を取り込んでいます…',
    failed: '情報を取得できませんでした。',
    onDevice: '端末に {n} 件（{when}に取得）',
    notYet: 'まだ取り込めていません',
    matched: '{matched} 件 / 全 {total} 件',
    clearFilter: '絞り込みを外す',
    emptyTitle: '見つかりませんでした',
    emptyBody: '施設名・よみがな・住所のいずれかでお試しください。',
    notices: 'お知らせ',
    noticesCount: 'お知らせ {n} 件',
  },

  /** カテゴリごとの一言。コードで引く。 */
  categoryHint: {
    hotel: '宿泊施設を探す',
    residence: 'レジデンスを探す',
    commercial: '商業施設を探す',
    office: 'オフィスビルを探す',
    hospital: '病院・クリニック',
    station: '駅・空港を探す',
    other: '施設を探す',
  },

  facility: {
    title: '車寄せ案内',
    sectionSummary: '概要',
    sectionPhotos: '写真',
    sectionDiagram: '案内図',
    sectionCautions: '注意',
    notFound: 'この施設は見つかりませんでした。',
    loadFailed: '施設を読み込めませんでした。',
    loading: '施設の情報を読み込んでいます…',
    toSearch: '施設を探す',
    route: '経路',
    /* 入口が2つ以上のとき。どの入口へ向かうのかを札に出す */
    routeTo: '経路（{code}）',
    pickEntry: '地図のピンか下の入口を押すと、経路の行き先を選べます。',
    showOnMap: '{code}「{name}」を地図で見て、経路の行き先にする',
    pinLabel: '{code}：{name}',
    save: '保存',
    saved: '保存済み',
    share: '共有',
    pin: 'お気に入りに入れる',
    unpin: 'お気に入りから外す',
    noEntryPoints: 'この施設の入口はまだ登録されていません。',
    noPhotos: 'まだ登録されていません。',
    noCautions: '注意事項は登録されていません。',
    heightLimit: '高さ制限 {n}cm',
    roofed: '屋根あり',
    notRoofed: '屋根なし',
    open24h: '24時間可',
    not24h: '24時間不可',
    copyCoords: '{name} の座標を複製',
    placeholderPhoto: '仮画像',
    enlarge: '{kind}を拡大する',
    nowCaution: 'いま注意',
    nowCautionWhen: 'いま注意（{when}）',
    /* 情報提供（2026-10-05）。施設の画面から送る画面へ */
    sendInfo: '現地と違うところがあれば、情報を送る',
  },

  /*
    情報提供（2026-10-05）。

    送っていただいたものは、管理画面で確かめてから反映する。
    「送ればすぐ直る」と読める書き方はしない。
  */
  submit: {
    title: '情報を送る',
    lead: '現地と違うところや、新しく分かったことをお知らせください。こちらで確かめたうえで反映します。',
    kindTitle: 'どんな情報ですか',
    kinds: {
      wrong_place: '入口の位置が違う',
      new_entry: '新しい入口がある',
      photo: '写真を送る',
      caution: '注意事項（工事・時間帯の規制など）',
      other: 'その他',
    },
    entryTitle: 'どの入口についてですか',
    entryAny: '入口を問わない',
    bodyTitle: '内容',
    bodyPlaceholder: '例：正面の入口は工事中で、一本南の道から入るようになっています。',
    bodyCount: '{n} / {max}',
    photoTitle: '写真（{max}枚まで）',
    photoAdd: '写真を選ぶ',
    photoRemove: '{n}枚目の写真を外す',
    photoUnreadable: 'この写真は読み込めませんでした',
    photoNative: '写真は、ブラウザ（ホーム画面に追加したアプリ）から送れます。',
    whereTitle: 'いまいる場所を添える',
    whereNote: '現地にいるときにお使いください。入口の位置を確かめるのに役立ちます。選んだときだけ送ります。',
    whereFinding: '位置を確かめています…',
    whereFound: '位置を添えます',
    whereFailed: '位置を取得できませんでした。位置情報の許可をご確認ください。',
    send: '送る',
    sending: '送っています…',
    sent: '情報を受け付けました',
    sentBody: 'ありがとうございます。こちらで確かめたうえで反映します。',
    needBody: '内容をご記入ください',
    error: {
      offline: '通信できないため送れませんでした。電波の届く場所でもう一度お試しください。',
      tooMany: '1日に送れる数（20件）を超えました。明日あらためてお送りください。',
      blocked: 'ご利用が停止されているため、送れません。',
      photo: '写真を送れませんでした。写真を外すか、もう一度お試しください。',
      unknown: '送れませんでした。もう一度お試しください。',
    },
  },

  /*
    チャット（2026-10-05）。いまは「情報提供ランキング」のチャンネルだけ。
    会員どうしの書き込みは次の段で足す。
  */
  chat: {
    title: 'チャット',
    rankingName: '情報提供ランキング',
    rankingDesc: '採用された情報の件数で、毎月の順位を出しています',
    meLine: '今月のあなた：採用 {n}件・{rank}位',
    meNoRank: '今月のあなた：採用 {n}件',
    readOnly: '読むだけのチャンネル',
    /* 会員どうしの書き込み（2026-10-05） */
    generalName: '情報交換',
    generalDesc: 'みんなで書き込めるチャンネルです',
    noMessages: 'まだ書き込みはありません',
    /* 未読（2026-10-05） */
    unread: '未読 {n}',
    newMessage: '情報交換に新しい書き込みがあります',
    newMessageBody: '下の「チャット」から読めます。',
  },

  chatRoom: {
    rules:
      'みんなが読める場所です。個人が特定できる情報や、人を傷つける書き込みはしないでください。ルールに反する書き込みは運営が非表示にします。',
    placeholder: '書き込む（500字まで）',
    /* オンライン状態（2026-10-06） */
    online: 'オンライン',
    offline: 'オフライン',
    onlineCount: 'いまオンライン {n}人',
    send: '送る',
    empty: 'まだ書き込みはありません。最初の書き込みをどうぞ。',
    older: '前の書き込みを読む',
    /* 10日ずつ読む・90日で外れる（2026-10-08） */
    loadingOlder: '前の書き込みを読み込んでいます…',
    noOlder: 'これより前の書き込みはありません（{days}日を過ぎた書き込みは表示されません）',
    noName: '名前未設定の会員',
    noNameHint: '表示名がまだありません。アカウントの画面で設定すると、名前が添えて出ます。',
    muted: '書き込みは運営により止められています。読むことはできます。',
    blocked: 'ご利用が停止されているため、書き込めません。',
    delete: '削除',
    deleteTitle: 'この書き込みを削除しますか',
    report: '通報',
    reportTitle: 'この書き込みを運営に知らせますか',
    reportBody: 'ルールに反していると思われる書き込みを、運営に知らせます。運営が確かめ、必要なら非表示にします。',
    reportNote: '通報したことは、書いた方には伝わりません。',
    reported: '運営に知らせました',
    reportedBody: 'ご協力ありがとうございます。',
    loadFailed: '読み込めませんでした。電波の届く場所でもう一度お試しください。',
    error: {
      offline: '通信できないため送れませんでした。電波の届く場所でもう一度お試しください。',
      tooMany: '書き込みが多すぎます。少し時間をおいてから書き込んでください。',
      notAllowed: 'いまは書き込めません。',
      already: 'すでに知らせています。',
      unknown: 'うまくいきませんでした。もう一度お試しください。',
    },
  },

  ranking: {
    title: '情報提供ランキング',
    sender: '車寄せナビ',
    youTitle: '今月のあなた',
    accepted: '採用',
    sent: '送った件数',
    rank: '順位',
    countValue: '{n}件',
    rankValue: '{rank}位',
    ofPeople: '{n}名中',
    noRank: 'まだ順位はありません',
    excluded: {
      surveyor: '調査員のため、順位の対象外です（はじめから無料でお使いいただけます）。',
      owner: '運営者のアカウントのため、順位の対象外です。',
    },
    mySubmissions: '送った情報を見る',
    anonymous: '匿名の会員',
    you: 'あなた',
    monthNow: '{y}年{m}月の順位（集計中）',
    monthDone: '{y}年{m}月の結果',
    empty: 'この月は、まだ採用された情報がありません。',
    how: '施設の画面の「現地と違うところがあれば、情報を送る」から送れます。採用された件数で順位が決まります。',
    /* 翌月無料の決まり（2026-10-06。人数と件数は管理画面の設定） */
    rule: '毎月、採用{min}件以上で上位{top}名の方は、翌月の1か月が無料になります。',
    youFree: '先月の上位に入られたため、{date}まで無料でお使いいただけます。',
    settledNote: 'この月の締めで、{n}名の方が翌月無料になりました。',
    freeTag: '翌月無料',
    nameSetting: '名前の出し方は、マイページの「ランキングで名前を出さない」で変えられます。',
    loadFailed: '読み込めませんでした。電波の届く場所でもう一度お試しください。',
    retry: 'もう一度読み込む',
    loading: '読み込んでいます…',
  },

  mySubmissions: {
    title: '送った情報',
    empty: 'まだ情報を送っていません。施設の画面の「現地と違うところがあれば、情報を送る」から送れます。',
    status: {
      pending: '審査待ち',
      accepted: '採用',
      rejected: '不採用',
    },
    sentAt: '{date} に送信',
    reviewedAt: '{date} に審査',
    facilityGone: '（削除された施設）',
    loadFailed: '読み込めませんでした。電波の届く場所でもう一度お試しください。',
  },

  /** 短い知らせ（帯） */
  notice: {
    linkCopied: 'リンクを複製しました',
    coordsCopied: '座標を複製しました',
    shareFailed: '共有できませんでした',
    tryAgain: 'もう一度お試しください。',
    mapAppFailed: '地図アプリを開けませんでした',
    /*
      管理者が消した施設を押したとき。

      黙って一覧から落とすと、留めておいたはずのものが理由もなく
      無くなった形になり、利用者からは不具合と区別がつかない。
    */
    facilityGone: '管理者がこの施設を削除しました',
    facilityGoneBody: '一覧から外しました。',
  },

  favorites: {
    title: 'お気に入り',
    removeOne: 'お気に入りから外す',
    removeOneBody: '「{name}」をお気に入りから外します。',
    removePicked: '選んだものを外す',
    removePickedBody: '{n} 件をお気に入りから外します。',
    clearTitle: 'お気に入りをすべて解除',
    clearBody: '{n} 件のお気に入りをすべて解除します。',
    yesRemove: '外す',
    yesClear: '解除する',
    removeCount: '外す ({n})',
    removePickedLabel: '選んだ {n} 件を外す',
    selectLabel: '複数を選んで外す',
    clearAll: 'すべて解除',
    clearAllLabel: 'お気に入りをすべて解除',
    emptyTitle: 'まだ登録がありません',
    emptyBody: '施設の画面で「保存」または心印を押すと、ここに残ります。',
    emptyHint: 'よく向かう施設を留めておく場所です。',
    limit: '{n} 件まで残ります。この端末の中だけに保存しています。',
    addedAt: '{when}に登録',
    rowRemove: '{name} をお気に入りから外す',
  },

  history: {
    title: '履歴',
    removeOne: '履歴から削除',
    removeOneBody: '「{name}」を履歴から削除します。',
    removePicked: '選んだ履歴を削除',
    removePickedBody: '{n} 件を履歴から削除します。',
    clearTitle: '履歴をすべて削除',
    clearBody: '{n} 件の履歴をすべて削除します。',
    deleteCount: '削除 ({n})',
    removePickedLabel: '選んだ {n} 件を削除',
    selectLabel: '複数を選んで削除する',
    clearAll: 'すべて削除',
    clearAllLabel: '履歴をすべて削除',
    emptyTitle: 'まだ履歴がありません',
    emptyBody: '調べた施設が新しい順に並びます。',
    emptyHint: '同じ施設へ何度も向かう際の呼び出しに使います。',
    limit: '新しいものから {n} 件まで残ります。この端末の中だけに保存しています。',
    seenAt: '{when}に登録',
    rowRemove: '{name} を履歴から削除',
  },

  mypage: {
    title: 'マイページ',
    brightness: '画面の明るさ',
    dark: '暗い表示',
    light: '明るい表示',
    themeSwitch: '表示を切り替える: {next}',
    language: '言語',
    languageHint: '画面の文言と施設の案内に使う言語',
    install: 'ホーム画面に追加',
    installWhy: 'すぐ開けて、画面も広くなります。',
    installWhyPush: 'iPhone では、追加しないと通知を受け取れません。',
    installIosSteps: '下の共有ボタン（□に↑）を押し、「ホーム画面に追加」を選んでください。',
    installManual: 'ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。',
    installNow: 'ホーム画面に追加する',
    push: 'お知らせの通知',
    pushOn: '受け取る',
    pushOff: '受け取らない',
    pushUnsupported: 'この端末では受け取れません',
    pushHomeScreen: 'ホーム画面に追加すると受け取れます',
    pushNotReady: 'ただいま準備中です',
    pushDenied: 'ブラウザの設定で許可してください',
    pushEnabled: '通知を受け取ります',
    pushDisabled: '通知を受け取りません',
    sync: '施設情報の取り込み',
    syncing: '取り込んでいます…',
    syncState: '{n} 件（{when}に取得）',
    account: 'アカウント',
    payment: 'お支払い',
    accountOut: '登録すると、機種変更しても引き継げます',
    accountTrial: '無料期間 残り {left}',
    /* 調査員など、無料でお使いいただいている方（2026-10-05） */
    /* 無料の理由ごと（lib/account.ts の FreeReason） */
    accountFree: {
      surveyor: '調査員のため無料でお使いいただけます',
      owner: '運営者のアカウントのため無料でお使いいただけます',
      /* 試験提供の期間中（2026-10-07） */
      trial: '試験提供の期間中のため、無料でお使いいただけます',
      /* 前の月の情報提供の上位（2026-10-06） */
      top: '情報提供の上位のため、{date}まで無料です',
    },
    accountEnded: '無料期間は終了しました',
    /* お支払い済みの方の期間。ご指示 2026-09-15。 */
    accountPaid: 'ご利用期間 残り {left}',
    accountEndedPaid: 'ご利用期間が終了しました',
    accountChecking: '確認しています…',
    /* 情報提供ランキングで名前を出さない（2026-10-05） */
    rankAnonymous: 'ランキングで名前を出さない',
    rankAnonymousOn: '順位には「匿名の会員」と出ます',
    rankAnonymousOff: '順位に表示名が出ます',
    /* チャットのオンライン状態（2026-10-06） */
    presenceHidden: 'チャットでオンライン状態を出さない',
    presenceHiddenOn: 'ほかの方からは、いつもオフラインに見えます',
    presenceHiddenOff: 'アプリを開いているあいだ、オンラインと出ます',
    about: 'このアプリについて',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    law: '特定商取引法に基づく表記',
    contact: 'お問い合わせ',
    version: 'バージョン',
    note: '施設情報は端末の中に保存され、電波の届かない場所でも表示できます。',
  },

  /*
    会員登録。運用版で入れたもの。

    走行前の車内で読む文言なので、敬体のまま短くしている。
    「認証」「サブスクリプション」といった語は使わない。
  */
  account: {
    title: 'アカウント',
    lead: 'メールアドレスでご登録いただくと、お気に入りと閲覧履歴を機種変更後も引き継げます。',
    leadTrial: 'ご登録から1か月は無料でお使いいただけます。',
    modeIn: 'ログイン',
    modeUp: '新規登録',

    email: 'メールアドレス',
    password: 'パスワード',
    passwordNew: '新しいパスワード',
    passwordHint: '{n} 文字以上',
    show: 'パスワードを表示',
    hide: 'パスワードを隠す',

    submitIn: 'ログイン',
    submitUp: '登録する',
    submitReset: '再設定のメールを送る',
    submitPassword: 'パスワードを変える',
    working: '処理しています…',

    forgot: 'パスワードをお忘れの方',
    resetTitle: 'パスワードの再設定',
    resetLead: 'ご登録のメールアドレスへ、再設定のご案内をお送りします。',
    resetSent: '再設定のメールをお送りしました',
    resetSentBody: '届いたメールのリンクをお開きください。',
    /*
      送った後の画面（2026-10-29）。リンクを開くまでの手順を、その場に残す。
      件名と差出人は Supabase の標準のメールのもの。送信の業者と文面を
      替えたら、ここも合わせる。
    */
    /* 再設定の画面でアイコンの下に添える名前 */
    resetBrand: '車寄せナビ',
    resetSentTitle: 'メールをお送りしました',
    // 送り先はすぐ下に出す。320px でも1行に収める
    resetSentLead: '再設定のリンクをお送りしました。',
    resetChangeEmail: '変更',
    resetChangeEmailLabel: 'メールアドレスを変える',
    resetStepsTitle: 'このあとの手順',
    resetStepOpen: 'メールを開く',
    resetStepOpenHint: '件名は「Reset Your Password」、差出人は「Supabase Auth」です',
    resetStepLink: 'メールの「Reset Password」を押す',
    // 360px でも1行に収まる長さ。「開いた画面で」は2の流れで伝わる
    resetStepSet: '新しいパスワードを決める',
    resetStepSetHintApp:
      'リンクはブラウザで開きます。決めたあと、ホーム画面のアプリへ戻ってログインしてください',
    resetOpenMail: '{name}を開く',
    resetMailNames: {
      gmail: 'Gmail',
      outlook: 'Outlook',
      yahoo: 'Yahoo!メール',
      icloud: 'iCloud メール',
    },
    resetHelpTitle: 'メールが届かないときは',
    resetHelpSpam: '迷惑メールのフォルダもご確認ください',
    resetHelpWait: '届くまで数分かかることがあります',
    resetHelpTypo: 'アドレスに打ち間違いがないか、上の表示でご確認ください',
    resetHelpCarrier:
      '携帯会社のメール（docomo・au・SoftBank など）は、パソコンから送られたメールを受け取らない設定になっていることがあります。受信の設定をご確認ください',
    resetResend: 'もう一度送る',
    resetResendIn: 'もう一度送る（{s}秒後）',
    resetResent: 'もう一度お送りしました',
    resetBack: 'ログインへ戻る',

    recoveryTitle: '新しいパスワードを決める',
    recoveryLead: '新しいパスワードをご入力ください。',
    recoveryCancel: 'やめて、ログイン画面へ戻る',
    changed: 'パスワードを変えました',

    confirmTitle: '確認のメールをお送りしました',
    confirmBody: '{email} へお送りしました。リンクをお開きになると、ご登録が完了します。',

    welcome: 'ご登録ありがとうございます',
    signedIn: 'ログインしました',
    signedOut: 'ログアウトしました',
    signOut: 'ログアウト',
    signOutConfirm: 'ログアウトしますか',
    signOutBody: 'お気に入りと閲覧履歴は、この端末に残ります。',

    lockedTitle: '無料期間が終了しました',
    /* お支払い済みの期間が終わったとき（ご指示 2026-09-15） */
    lockedTitlePaid: 'ご利用期間が終了しました',
    lockedBody:
      'お支払いの手続きが済むまで、施設の検索はご利用いただけません。お手続きが済み次第、これまでどおりお使いいただけます。',
    lockedBodyPaid:
      'ご継続のお手続きが済むまで、施設の検索はご利用いただけません。お手続きが済み次第、これまでどおりお使いいただけます。',
    lockedAction: 'お支払いの手続きへ',
    lockedCheck: 'お振込みが済んだ方はこちら',
    lockedChecking: '確かめています…',

    trialTitle: '無料期間',
    trialLeft: 'あと {left}（{date} まで）',
    trialEnded: '{date} に終了しました',
    /* お支払い済みの期間。言い回しを分ける（ご指示 2026-09-15） */
    paidLeft: 'あと {left}（{date} まで）',
    paidEnded: '{date} に終了しました。続けてご利用の場合はお手続きをお願いいたします',
    statusPaid: 'ご利用中',
    statusFree: {
      surveyor: '無料（調査員）',
      owner: '無料（運営者）',
      trial: '無料（試験提供の期間中）',
      top: '無料（{date}まで・情報提供の上位）',
    },
    freeBody: {
      surveyor: '調査員として登録されているため、期限なく無料でお使いいただけます。お支払いの手続きは要りません。',
      owner: '運営者のアカウントのため、期限なく無料でお使いいただけます。お支払いの手続きは要りません。',
      trial:
        'いまは試験提供の期間中のため、無料でお使いいただけます。無料期間（1か月）が過ぎても、引き続きお使いいただけます。有料での提供を始めるときは、30日前までにお知らせします。お支払いの手続きは要りません。',
      top: '先月の情報提供で上位に入られたため、{date}まで無料でお使いいただけます。お支払いの手続きは要りません。ありがとうございます。',
    },
    statusBlocked: 'ご利用を停止しています',

    displayName: 'お名前',
    displayNameHint: '未設定',
    save: '保存',
    saved: '保存しました',

    /* アカウント管理 */
    manage: 'アカウント管理',
    avatar: '顔写真',
    avatarChange: '写真を選ぶ',
    avatarRemove: '外す',
    avatarOnlyWeb: 'ブラウザからご変更いただけます',
    avatarSaved: '顔写真を変えました',
    avatarRemoved: '顔写真を外しました',
    avatarTooBig: 'この写真は大きすぎます',
    avatarUnreadable: 'この写真は読み込めませんでした',
    avatarApply: 'OK',
    avatarPending: 'この写真でよろしければ OK を押してください',
    avatarNotYet: 'まだ変わっていません',
    passwordChange: 'パスワードの変更',
    passwordCurrent: 'いまのパスワード',
    passwordChanged: 'パスワードを変えました',

    /* 顔写真を押したときの行き先 */
    /* 登録・ログインの画面 */
    passwordAgain: 'パスワード（確認）',
    /* 規約類への同意（2026-10-08）。「利用規約とプライバシーポリシーに同意する」 */
    agreeTerms: '利用規約',
    agreePrivacy: 'プライバシーポリシー',
    agreeAnd: 'と',
    agreeTail: 'に同意する',
    agreeBoth: '利用規約とプライバシーポリシーに同意する',
    agreeTermsOnly: '利用規約に同意する',
    agreePrivacyOnly: 'プライバシーポリシーに同意する',
    remember: 'この端末に記憶する',
    welcomeTitle: 'ようこそ',
    welcomeBody: 'ご登録のメールアドレスでログインしてください。',

    /* 退会・他の端末 */
    danger: 'アカウントの操作',
    signOutAll: 'ほかの端末からもログアウト',
    signOutAllBody: 'この端末を含め、すべてのログインを切ります。',
    signedOutAll: 'すべての端末からログアウトしました',
    takenOver: 'ほかの端末でログインされました',
    takenOverBody: '1つのアカウントでお使いいただけるのは1台までです。この端末からはログアウトしました。',
    leave: '退会する',
    leaveConfirm: '退会しますか',
    leaveBody: 'メールアドレス・顔写真・お気に入り・閲覧履歴を、すべて消します。',
    leaveNote: '元には戻せません。',
    leaveYes: '退会する',
    leaveDone: '退会しました',
    blockedTitle: 'ご利用を停止しています',
    blockedBody: 'お心当たりがない場合は、提供元へお問い合わせください。',
    /* 圏外で使える日数を過ぎたとき。ログインの画面は出さない（圏外では入れない） */
    offlineLimitTitle: '電波の届く場所で開いてください',
    offlineLimitBody: '圏外でお使いいただけるのは、最後に確認してから {n} 日までです。電波が戻ると自動で確かめ、そのまま続きからお使いいただけます。',
    offlineRetry: 'もう一度確かめる',
    offlineChecking: '確かめています…',

    menuOpen: 'アカウントのメニュー',
    menuProfile: 'プロフィール',
    menuSettings: '設定',

    error: {
      invalidLogin: 'メールアドレスかパスワードが違います',
      alreadyRegistered: 'このメールアドレスは登録済みです',
      weakPassword: 'パスワードが短すぎます',
      invalidEmail: 'メールアドレスの形が正しくありません',
      notConfirmed: '確認メールのリンクをお開きください',
      samePassword: '前と同じパスワードです',
      wrongCurrent: 'いまのパスワードが違います',
      mismatch: 'パスワードが一致しません',
      blocked: 'このアカウントはご利用を停止しています',
      signupClosed: 'いま新規登録を受け付けていません',
      rateLimited: '送信の上限に達しました。しばらくおいてからお試しください',
      network: '通信できませんでした。電波の届く場所でお試しください。一度ログインしておけば、そのあとは圏外でも使えます',
      offline: '電波の届く場所でログアウトしてください。圏外でログアウトすると、電波が戻るまで入り直せません',
      unknown: 'うまくいきませんでした',
      empty: 'メールアドレスとパスワードをご入力ください',
      emptyEmail: 'メールアドレスをご入力ください',
      agree: '利用規約とプライバシーポリシーをお読みのうえ、同意の欄に印を付けてください',
      short: 'パスワードは {n} 文字以上でお願いします',
    },
  },

  /*
    料金。無料期間が終わったあとに出す。

    **止めない。** お支払いの受け口がまだ無いため、切れても今までどおり
    使えるままにしている。使えなくしてから「支払い方法は追ってご連絡」
    では、ただ使えないだけになる。
  */
  plan: {
    title: '無料期間が終了しました',
    body: '引き続きお使いいただくため、料金プランをお選びください。',
    bodyLeft: '無料期間はあと {left}です',
    open: '料金プランを見る',
    close: '閉じる',
    /*
      刻みの名前。id で引く。

      画面の側で「月額か年額か」を判じない。刻みを増やすたびに
      画面を1つずつ直すことになる（2026-09-14 に4つへ増やした）。
    */
    names: {
      monthly: '1か月',
      /* 3か月・6か月は取り扱いを終えた（2026-10-04）。以前に選んだ方の表示にだけ使う */
      quarterly: '3か月',
      half: '6か月',
      yearly: '12か月（一括払い）',
    },
    price: '{yen} 円',
    choose: 'この内容で申し込む',
    chosen: 'ご希望を承りました',
    chosenBody: 'お支払い方法が整い次第、ご案内いたします。それまでは引き続きお使いいただけます。',
    current: 'ご希望: {name}',
    change: '選び直す',
    notYet: 'この画面ではまだお支払いは発生しません。',

    /* お支払いの画面 */
    statusTitle: 'いまのご利用状況',
    statusTrial: '無料期間中',
    statusEndedShort: '無料期間は終了',
    statusEndedPaid: 'ご利用期間は終了',
    until: '{date} まで',
    chosenAt: '{date} にお申し込み',
    notChosen: 'まだお選びいただいていません',
    retired: 'この料金は取り扱いを終了しました。お手数ですが、下からお選び直しください。',
    chosenLabel: 'ご希望の料金',
    choiceTitle: 'ご希望の料金をお選びください',
    afterTrial:
      '無料期間が終わっても、いまのところ引き続きお使いいただけます。お支払いの方法が整い次第、あらためてご案内いたします。',
    contact: 'ご不明な点は、お手数ですが提供元へお問い合わせください。',

    /* 銀行振込 */
    transferTitle: 'お振込先',
    transferLead: '下記へお振込みください。日本のどの銀行からでもお振込みいただけます。',
    transferBank: '金融機関',
    transferAccount: '口座',
    transferHolder: '口座名義',
    transferAmount: 'お振込金額',
    transferName: 'お振込人のお名前',
    transferNameHow: 'お名前の前に、この番号をお付けください。',
    transferNameExample: '例: {code}ヤマダタロウ',
    transferAfter: 'お振込を確認しましたら、ご利用開始のご連絡をいたします。',
    /*
      お振込みのあとに押していただく報告。

      入金そのものは機械で分からない。押していただくと管理画面へ
      知らせが届き、通帳を確かめたうえで開始になる。
    */
    reportTitle: 'お振込みが済んだら',
    reportLead: '下の釦を押していただくと、こちらへ知らせが届きます。通帳を確かめてから、ご利用開始のご連絡をいたします。',
    reportButton: 'お振込みを済ませました',
    reportSending: 'お伝えしています…',
    reportDone: 'お知らせしました',
    reportDoneBody: '確認までしばらくお時間をいただきます。確認できましたら、この画面が「ご利用中」に変わります。',
    reportFailed: 'お伝えできませんでした。電波の届くところで、もう一度お試しください。',
    transferNotReady: 'お振込先はただいま準備中です',
    transferNotReadyBody: '整い次第、この画面でご案内いたします。お手数をおかけいたします。',
    futsu: '普通',
    touza: '当座',
  },

  notices: {
    title: 'お知らせ',
    titleCount: 'お知らせ ({n})',
    readAll: 'すべて既読',
    readAllLabel: 'すべて既読にする',
    emptyTitle: 'お知らせはありません',
    emptyBody: '新しく増えた施設や、いま効いている注意事項がここに出ます。',
    sectionCautions: 'いま効いている注意',
    sectionAdded: '新しく増えた施設',
    sectionTrial: 'お支払いのご案内',
    trialTitle: '無料期間が、あと {n} 日で終わります',
    paidExpiryTitle: 'ご利用期間が、あと {n} 日で終わります',
    trialBody:
      '{date} を過ぎると、お支払いいただくまで設定より先へ進めなくなります。押してお手続きへ。',
    addedNote: '前回この端末で取り込んだあとに増えた施設を、過去14日ぶんまで出しています。',
    addedBody: '新しく追加されました。',

    /*
      案内の中身が変わった知らせ。ご指示 2026-09-14。

      **何が変わったかまで出す。**「更新されました」だけでは、開いて
      何を確かめればよいのか分からない。
    */
    sectionChanged: '案内が変わった施設',
    changedBody: '{items} が変わりました。向かう前にご確認ください。',
    changeApproach: '進入方法',
    changeCoords: 'ナビの目的地',
    changeHeight: '高さ制限',
    changeRoof: '屋根',
    changeHours: '利用できる時間',
    changeEntry: '入口',
    changePhoto: '写真',
    changeName: '施設名',
    changeAddress: '住所',

    /* カテゴリの変わり目。ご指示 2026-09-14。 */
    sectionCategory: 'カテゴリの変更',
    categoryAdded: '「{name}」が増えました。',
    categoryRenamed: 'カテゴリの名前が「{name}」に変わりました。',
    categoryRemoved: '「{name}」は表示されなくなりました。',
  },

  sync: {
    staleMessage: '最新の情報を取得できませんでした。前回取得した内容を表示しています。',
    failedMessage: '情報を取得できませんでした。電波の届く場所で一度お開きください。',
    never: '未取得',
  },

  when: {
    justNow: 'たった今',
    minutesAgo: '{n}分前',
    hoursAgo: '{n}時間前',
    yesterday: '昨日',
    daysAgo: '{n}日前',
    date: '{m}月{d}日',
    /** 英語だけが使う。日本語は date の {m} をそのまま使う。 */
    months: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    /*
      残りの長さ。**月だけで丸めない**（ご指摘 2026-09-15）。
      「あと3か月」では、3か月ちょうどなのか3か月と28日なのかが
      分からない。端数の日数まで出す。
    */
    spanMonthsDays: '{m}か月 {d}日',
    spanMonths: '{m}か月',
    spanDays: '{d}日',
  },

  weekday: { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土', 7: '日' },
  weekdayGroup: { weekdays: '平日', weekend: '土日' },

  entryKind: {
    dropoff: '車寄せ',
    entrance: 'エントランス',
    parking_entrance: '駐車場入口',
    bus_stop: 'バス乗降場',
    service: '関係者用',
  },

  photoKind: {
    approach: '進入路',
    dropoff: '車寄せ',
    entrance: 'エントランス',
    night: '夜間',
    diagram: '進入案内図',
    exterior: '外観',
    other: 'その他',
  },

  map: {
    cannotShow: '地図を表示できません',
    noKey: 'Google マップの鍵が設定されていません。一覧からは通常どおりお使いいただけます。',
    noPins: 'この絞り込みに座標のある施設がありません。',
    loadFailed: '地図を読み込めませんでした',
    noCoords: '座標が登録されていません',
  },

  navApp: {
    google: 'Google マップ',
    yahoo: 'Yahoo! カーナビ',
    apple: 'マップ',
    web: 'ブラウザ',
    /** 人へ渡すときの一言 */
    shareText: '{name}の車寄せ案内',
  },

  photo: {
    prev: '前の写真',
    next: '次の写真',
    zoomHint: '二本指で拡大／二回叩いても拡大できます',
  },

  intro: {
    skip: '導入を飛ばす',
    skipHint: '画面を押すと飛ばせます',
    sound: '音を出す',
  },

  comingSoon: {
    title: '準備中です',
  },
} as const;

/**
 * `as const` によって ja の各値はリテラル型（"探す" など）になる。
 * そのままだと en 側が代入できないため、値の型を string へ広げる。
 * キーの過不足は引き続き検出されるので、訳し忘れは型エラーになる。
 *
 * 管理画面（admin）は2段の対応表で足りているが、こちらは
 * when.months が文字列の並びを持つため、段数を決め打ちにできない。
 * 並びは並びのまま、中身だけを広げる。
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : { -readonly [K in keyof T]: Widen<T[K]> };

type Dictionary = Widen<typeof ja>;

const en: Dictionary = {
  tabs: {
    search: 'Search',
    favorites: 'Favourites',
    history: 'History',
    chat: 'Chat',
    mypage: 'Settings',
    showing: '{name} (showing)',
  },

  brand: {
    tagline1: 'Arrive smoothly,',
    tagline2: 'every time.',
    toSearch: 'Go to search',
    toSettings: 'Go to settings',
  },

  common: {
    count: '{n}',
    close: 'Close',
    closeWith: '{title}. Close',
    back: 'Back',
    seeAll: 'See all',
    seeAllCount: 'See all ({n})',
    select: 'Select',
    selectAll: 'Select all',
    unselectAll: 'Clear all',
    stop: 'Cancel',
    selected: ' (selected)',
    deletedFacility: 'Deleted facility',
    deletedBadge: 'Deleted',
    menu: 'Menu',
    retry: 'Try again',
    top: 'Top',
    topLabel: 'Back to the top of the list',
  },

  confirm: {
    noUndo: 'This cannot be undone.',
    delete: 'Delete',
  },

  search: {
    lead: 'Find where you are heading',
    placeholder: 'Name, reading or address',
    clear: 'Clear what you typed',
    here: 'Current location',
    area: 'Area covered',
    categoryTitle: 'Browse by category',
    recentTitle: 'Recently viewed',
    recentEmpty: 'You have not viewed any facilities yet',
    prevCategory: 'Show previous categories',
    nextCategory: 'Show next categories',
    allFacilities: 'All facilities',
    filtered: '{category} · "{query}"',
    waiting: 'Waiting for data',
    registered: '{n} facilities',
    areaOne: '{name} ({n})',
    areaMore: '{name} and others ({n})',
    loading: 'Loading facility data…',
    failed: 'Could not load the data.',
    onDevice: '{n} on this device (fetched {when})',
    notYet: 'Not downloaded yet',
    matched: '{matched} of {total}',
    clearFilter: 'Clear filters',
    emptyTitle: 'No matches',
    emptyBody: 'Try the name, its reading, or the address.',
    notices: 'Notices',
    noticesCount: 'Notices, {n} new',
  },

  categoryHint: {
    hotel: 'Find a hotel',
    residence: 'Find a residence',
    commercial: 'Find a shopping centre',
    office: 'Find an office building',
    hospital: 'Hospitals and clinics',
    station: 'Find a station or airport',
    other: 'Find a facility',
  },

  facility: {
    title: 'Entrance guide',
    sectionSummary: 'Overview',
    sectionPhotos: 'Photos',
    sectionDiagram: 'Diagram',
    sectionCautions: 'Cautions',
    notFound: 'That facility could not be found.',
    loadFailed: 'Could not load the facility.',
    loading: 'Loading the facility…',
    toSearch: 'Search facilities',
    route: 'Route',
    routeTo: 'Route ({code})',
    pickEntry: 'Tap a pin on the map or an entrance below to choose where the route goes.',
    showOnMap: 'Show {code} "{name}" on the map and route there',
    pinLabel: '{code}: {name}',
    save: 'Save',
    saved: 'Saved',
    share: 'Share',
    pin: 'Add to favourites',
    unpin: 'Remove from favourites',
    noEntryPoints: 'No entrances have been registered for this facility yet.',
    noPhotos: 'Nothing registered yet.',
    noCautions: 'No cautions have been registered.',
    heightLimit: 'Height limit {n} cm',
    roofed: 'Covered',
    notRoofed: 'Not covered',
    open24h: 'Open 24 hours',
    not24h: 'Not open 24 hours',
    copyCoords: 'Copy the coordinates for {name}',
    placeholderPhoto: 'Placeholder',
    enlarge: 'Enlarge the {kind} photo',
    nowCaution: 'Applies now',
    nowCautionWhen: 'Applies now ({when})',
    sendInfo: 'Something different on site? Send us information',
  },

  submit: {
    title: 'Send information',
    lead: 'Tell us about anything that differs on site or anything new you have found. We will check it before updating.',
    kindTitle: 'What is it about?',
    kinds: {
      wrong_place: 'The entrance is in a different place',
      new_entry: 'There is a new entrance',
      photo: 'Send a photo',
      caution: 'A caution (construction, time restrictions, etc.)',
      other: 'Other',
    },
    entryTitle: 'Which entrance?',
    entryAny: 'Any entrance',
    bodyTitle: 'Details',
    bodyPlaceholder: 'e.g. The main entrance is under construction; cars now enter from the road one block south.',
    bodyCount: '{n} / {max}',
    photoTitle: 'Photos (up to {max})',
    photoAdd: 'Choose a photo',
    photoRemove: 'Remove photo {n}',
    photoUnreadable: 'This photo could not be read',
    photoNative: 'Photos can be sent from the browser (the app added to your home screen).',
    whereTitle: 'Add where I am now',
    whereNote: 'Use this while you are on site. It helps us check the entrance location. Sent only when you turn it on.',
    whereFinding: 'Finding your location…',
    whereFound: 'Your location will be added',
    whereFailed: 'Could not get your location. Please check the location permission.',
    send: 'Send',
    sending: 'Sending…',
    sent: 'Information received',
    sentBody: 'Thank you. We will check it before updating.',
    needBody: 'Please enter the details',
    error: {
      offline: 'Could not send without a connection. Please try again where there is a signal.',
      tooMany: 'You have reached the daily limit (20). Please send more tomorrow.',
      blocked: 'Your account has been suspended, so you cannot send information.',
      photo: 'Could not send the photos. Remove them or try again.',
      unknown: 'Could not send. Please try again.',
    },
  },

  chat: {
    title: 'Chat',
    rankingName: 'Contribution ranking',
    rankingDesc: 'Monthly ranking by the number of accepted submissions',
    meLine: 'You this month: {n} accepted, rank {rank}',
    meNoRank: 'You this month: {n} accepted',
    readOnly: 'Read-only channel',
    generalName: 'Driver talk',
    generalDesc: 'A channel everyone can post in',
    noMessages: 'No posts yet',
    unread: '{n} unread',
    newMessage: 'New posts in Driver talk',
    newMessageBody: 'Open "Chat" to read them.',
  },

  chatRoom: {
    rules:
      'Everyone can read this. Do not post anything that identifies a person or hurts others. Posts that break the rules are hidden by the operator.',
    placeholder: 'Write a post (up to 500 characters)',
    online: 'Online',
    offline: 'Offline',
    onlineCount: '{n} online now',
    send: 'Send',
    empty: 'No posts yet. Be the first.',
    older: 'Read earlier posts',
    loadingOlder: 'Loading earlier posts…',
    noOlder: 'No earlier posts (posts older than {days} days are not shown)',
    noName: 'Member without a name',
    noNameHint: 'You have no display name yet. Set one on the Account screen to show it with your posts.',
    muted: 'Posting has been turned off for you by the operator. You can still read.',
    blocked: 'Your account is suspended, so you cannot post.',
    delete: 'Delete',
    deleteTitle: 'Delete this post?',
    report: 'Report',
    reportTitle: 'Report this post to the operator?',
    reportBody: 'Let the operator know about a post that seems to break the rules. They will check it and hide it if needed.',
    reportNote: 'The writer will not be told that you reported it.',
    reported: 'Reported to the operator',
    reportedBody: 'Thank you for your help.',
    loadFailed: 'Could not load. Please try again where there is a signal.',
    error: {
      offline: 'Could not send without a connection. Please try again where there is a signal.',
      tooMany: 'Too many posts. Please wait a little before posting again.',
      notAllowed: 'You cannot post right now.',
      already: 'You have already reported this.',
      unknown: 'Something went wrong. Please try again.',
    },
  },

  ranking: {
    title: 'Contribution ranking',
    sender: 'Kurumayose Navi',
    youTitle: 'You this month',
    accepted: 'Accepted',
    sent: 'Sent',
    rank: 'Rank',
    countValue: '{n}',
    rankValue: '#{rank}',
    ofPeople: 'of {n}',
    noRank: 'Not ranked yet',
    excluded: {
      surveyor: 'As a field surveyor you are not ranked (you already use the app for free).',
      owner: 'The operator account is not ranked.',
    },
    mySubmissions: 'See what I have sent',
    anonymous: 'Anonymous member',
    you: 'You',
    monthNow: 'Ranking for {m}/{y} (in progress)',
    monthDone: 'Results for {m}/{y}',
    empty: 'No submissions have been accepted this month yet.',
    how: 'Send information from "Something different on site? Send us information" on a facility page. The ranking is based on accepted submissions.',
    rule: 'Each month, the top {top} members with at least {min} accepted submissions get the following month free.',
    youFree: 'You were a top contributor last month, so the app is free until {date}.',
    settledNote: '{n} members got the following month free from this month.',
    freeTag: 'Next month free',
    nameSetting: 'You can hide your name with "Hide my name in the ranking" in Settings.',
    loadFailed: 'Could not load. Please try again where there is a signal.',
    retry: 'Try again',
    loading: 'Loading…',
  },

  mySubmissions: {
    title: 'What I have sent',
    empty: 'You have not sent anything yet. Use "Something different on site? Send us information" on a facility page.',
    status: {
      pending: 'Pending',
      accepted: 'Accepted',
      rejected: 'Not accepted',
    },
    sentAt: 'Sent {date}',
    reviewedAt: 'Reviewed {date}',
    facilityGone: '(deleted facility)',
    loadFailed: 'Could not load. Please try again where there is a signal.',
  },

  notice: {
    linkCopied: 'Link copied',
    coordsCopied: 'Coordinates copied',
    shareFailed: 'Could not share',
    tryAgain: 'Please try again.',
    mapAppFailed: 'Could not open a map app',
    facilityGone: 'An administrator deleted this facility',
    facilityGoneBody: 'It has been removed from your list.',
  },

  favorites: {
    title: 'Favourites',
    removeOne: 'Remove from favourites',
    removeOneBody: 'Remove "{name}" from favourites.',
    removePicked: 'Remove the selected items',
    removePickedBody: 'Remove {n} from favourites.',
    clearTitle: 'Clear all favourites',
    clearBody: 'Remove all {n} favourites.',
    yesRemove: 'Remove',
    yesClear: 'Clear all',
    removeCount: 'Remove ({n})',
    removePickedLabel: 'Remove the {n} selected',
    selectLabel: 'Select several to remove',
    clearAll: 'Clear all',
    clearAllLabel: 'Clear all favourites',
    emptyTitle: 'Nothing saved yet',
    emptyBody: 'Press "Save" or the heart on a facility and it will appear here.',
    emptyHint: 'A place to keep the facilities you visit often.',
    limit: 'Up to {n} are kept, on this device only.',
    addedAt: 'Saved {when}',
    rowRemove: 'Remove {name} from favourites',
  },

  history: {
    title: 'History',
    removeOne: 'Remove from history',
    removeOneBody: 'Remove "{name}" from your history.',
    removePicked: 'Delete the selected entries',
    removePickedBody: 'Remove {n} from your history.',
    clearTitle: 'Clear all history',
    clearBody: 'Remove all {n} entries from your history.',
    deleteCount: 'Delete ({n})',
    removePickedLabel: 'Delete the {n} selected',
    selectLabel: 'Select several to delete',
    clearAll: 'Clear all',
    clearAllLabel: 'Clear all history',
    emptyTitle: 'No history yet',
    emptyBody: 'Facilities you look up appear here, newest first.',
    emptyHint: 'Handy for calling up a place you visit again and again.',
    limit: 'The newest {n} are kept, on this device only.',
    seenAt: 'Viewed {when}',
    rowRemove: 'Remove {name} from history',
  },

  mypage: {
    title: 'Settings',
    brightness: 'Screen brightness',
    dark: 'Dark',
    light: 'Light',
    themeSwitch: 'Switch display: {next}',
    language: 'Language',
    languageHint: 'Used for the interface and the facility guidance',
    install: 'Add to home screen',
    installWhy: 'It opens faster and uses the whole screen.',
    installWhyPush: 'On iPhone, notifications only arrive once it is added.',
    installIosSteps: 'Tap the share button below (a square with an arrow), then “Add to Home Screen”.',
    installManual: 'Open your browser menu and choose “Install app” or “Add to Home screen”.',
    installNow: 'Add to home screen',
    push: 'Notifications',
    pushOn: 'On',
    pushOff: 'Off',
    pushUnsupported: 'Not available on this device',
    pushHomeScreen: 'Add to your home screen to receive these',
    pushNotReady: 'Being prepared',
    pushDenied: 'Please allow notifications in your browser settings',
    pushEnabled: 'Notifications are on',
    pushDisabled: 'Notifications are off',
    sync: 'Facility data',
    syncing: 'Downloading…',
    syncState: '{n} (fetched {when})',
    account: 'Account',
    payment: 'Payment',
    accountOut: 'Sign up to keep your data when you change phones',
    accountTrial: '{left} left in your free month',
    accountFree: {
      surveyor: 'Free to use as a field surveyor',
      owner: 'Free to use as the operator account',
      trial: 'Free to use during the trial period',
      top: 'Free until {date} as a top contributor',
    },
    accountEnded: 'Your free month has ended',
    accountPaid: '{left} left',
    accountEndedPaid: 'Your paid period has ended',
    accountChecking: 'Checking…',
    rankAnonymous: 'Hide my name in the ranking',
    rankAnonymousOn: 'You appear as "Anonymous member"',
    rankAnonymousOff: 'Your display name appears in the ranking',
    presenceHidden: 'Hide my online status in chat',
    presenceHiddenOn: 'Others always see you as offline',
    presenceHiddenOff: 'You appear online while the app is open',
    about: 'About this app',
    terms: 'Terms of use',
    privacy: 'Privacy policy',
    law: 'Legal notice (Japan)',
    contact: 'Contact us',
    version: 'Version',
    note: 'Facility data is stored on this device, so it works where there is no signal.',
  },

  account: {
    title: 'Account',
    lead: 'Sign up with your email to keep your favourites and history when you change phones.',
    leadTrial: 'The first month is free.',
    modeIn: 'Sign in',
    modeUp: 'Sign up',

    email: 'Email address',
    password: 'Password',
    passwordNew: 'New password',
    passwordHint: '{n} characters or more',
    show: 'Show password',
    hide: 'Hide password',

    submitIn: 'Sign in',
    submitUp: 'Create account',
    submitReset: 'Send reset email',
    submitPassword: 'Change password',
    working: 'Working…',

    forgot: 'Forgotten your password?',
    resetTitle: 'Reset your password',
    resetLead: 'We will email you a link to set a new password.',
    resetSent: 'Reset email sent',
    resetSentBody: 'Open the link in the email we sent you.',
    resetBrand: 'Kurumayose Navi',
    resetSentTitle: 'Check your email',
    resetSentLead: 'We sent a password reset link to:',
    resetChangeEmail: 'Change',
    resetChangeEmailLabel: 'Use a different email address',
    resetStepsTitle: 'What to do next',
    resetStepOpen: 'Open the email',
    resetStepOpenHint: 'The subject is “Reset Your Password” and the sender is “Supabase Auth”',
    resetStepLink: 'Tap “Reset Password” in the email',
    resetStepSet: 'Set a new password',
    resetStepSetHintApp:
      'The link opens in your browser. Afterwards, go back to the app on your home screen and sign in.',
    resetOpenMail: 'Open {name}',
    resetMailNames: {
      gmail: 'Gmail',
      outlook: 'Outlook',
      yahoo: 'Yahoo! Mail',
      icloud: 'iCloud Mail',
    },
    resetHelpTitle: 'Didn’t get the email?',
    resetHelpSpam: 'Check your spam or junk folder',
    resetHelpWait: 'It can take a few minutes to arrive',
    resetHelpTypo: 'Make sure the address above is spelled correctly',
    resetHelpCarrier:
      'Mobile carrier addresses (docomo, au, SoftBank and others) may be set to reject email sent from computers. Check your mail filter settings.',
    resetResend: 'Send again',
    resetResendIn: 'Send again ({s}s)',
    resetResent: 'Sent again',
    resetBack: 'Back to sign in',

    recoveryTitle: 'Set a new password',
    recoveryCancel: 'Cancel and go back to sign in',
    recoveryLead: 'Enter your new password.',
    changed: 'Password changed',

    confirmTitle: 'Confirmation email sent',
    confirmBody: 'We sent it to {email}. Open the link to finish signing up.',

    welcome: 'Welcome',
    signedIn: 'Signed in',
    signedOut: 'Signed out',
    signOut: 'Sign out',
    signOutConfirm: 'Sign out?',
    signOutBody: 'Your favourites and history stay on this device.',

    lockedTitle: 'Your free trial has ended',
    lockedTitlePaid: 'Your paid period has ended',
    lockedBody:
      'Searching for facilities is unavailable until payment is arranged. Everything returns as soon as it is.',
    lockedBodyPaid:
      'Searching for facilities is unavailable until renewal is arranged. Everything returns as soon as it is.',
    lockedAction: 'Go to payment',
    lockedCheck: 'Already paid? Check again',
    lockedChecking: 'Checking...',

    trialTitle: 'Free month',
    trialLeft: '{left} left (until {date})',
    trialEnded: 'Ended on {date}',
    paidLeft: '{left} left (until {date})',
    paidEnded: 'Ended on {date}. Please renew to continue',
    statusPaid: 'Active',
    statusFree: {
      surveyor: 'Free (field surveyor)',
      owner: 'Free (operator)',
      trial: 'Free (trial period)',
      top: 'Free until {date} (top contributor)',
    },
    freeBody: {
      surveyor: 'You are registered as a field surveyor, so you can use the app free of charge with no end date. No payment is needed.',
      owner: 'This is the operator account, so you can use the app free of charge with no end date. No payment is needed.',
      trial:
        'The app is in its trial period, so it is free to use. You can keep using it after your free month ends. We will let you know at least 30 days before paid service begins. No payment is needed.',
      top: 'You were a top contributor last month, so the app is free until {date}. No payment is needed. Thank you.',
    },
    statusBlocked: 'Suspended',

    displayName: 'Name',
    displayNameHint: 'Not set',
    save: 'Save',
    saved: 'Saved',

    manage: 'Account',
    avatar: 'Photo',
    avatarChange: 'Choose a photo',
    avatarRemove: 'Remove',
    avatarOnlyWeb: 'You can change this in a browser',
    avatarSaved: 'Photo updated',
    avatarRemoved: 'Photo removed',
    avatarTooBig: 'That photo is too large',
    avatarUnreadable: 'That photo could not be read',
    avatarApply: 'OK',
    avatarPending: 'Press OK to use this photo',
    avatarNotYet: 'Not changed yet',
    passwordChange: 'Change password',
    passwordCurrent: 'Current password',
    passwordChanged: 'Password changed',

    passwordAgain: 'Password (again)',
    agreeTerms: 'Terms of Use',
    agreePrivacy: 'Privacy Policy',
    agreeAnd: ' and ',
    agreeTail: '',
    agreeBoth: 'I agree to the Terms of Use and Privacy Policy',
    agreeTermsOnly: 'I agree to the Terms of Use',
    agreePrivacyOnly: 'I agree to the Privacy Policy',
    remember: 'Remember on this device',
    welcomeTitle: 'Welcome',
    welcomeBody: 'Sign in with your registered email address.',

    danger: 'Account',
    signOutAll: 'Sign out everywhere',
    signOutAllBody: 'Ends every sign-in, including this device.',
    signedOutAll: 'Signed out on every device',
    takenOver: 'Signed in on another device',
    takenOverBody: 'An account can be used on one device at a time. You have been signed out here.',
    leave: 'Delete account',
    leaveConfirm: 'Delete your account?',
    leaveBody: 'Your email, photo, favourites and history will all be removed.',
    leaveNote: 'This cannot be undone.',
    leaveYes: 'Delete',
    leaveDone: 'Your account has been deleted',
    blockedTitle: 'This account is suspended',
    blockedBody: 'If this seems wrong, please contact the provider.',
    offlineLimitTitle: 'Please open the app where there is a signal',
    offlineLimitBody: 'Without a signal, the app can be used for up to {n} days after it was last checked. Once the signal returns, it checks automatically and you can carry on.',
    offlineRetry: 'Check again',
    offlineChecking: 'Checking…',

    menuOpen: 'Account menu',
    menuProfile: 'Profile',
    menuSettings: 'Settings',

    error: {
      invalidLogin: 'That email or password is not right',
      alreadyRegistered: 'That email is already registered',
      weakPassword: 'That password is too short',
      invalidEmail: 'That does not look like an email address',
      notConfirmed: 'Please open the link in the confirmation email',
      samePassword: 'That is the same as your current password',
      wrongCurrent: 'That is not your current password',
      mismatch: 'The passwords do not match',
      blocked: 'This account has been suspended',
      signupClosed: 'Sign-ups are closed at the moment',
      rateLimited: 'Too many attempts. Please try again later',
      network: 'Could not connect. Please try where there is a signal. Once you have signed in, the app also works without a signal',
      offline: 'Please sign out where there is a signal. If you sign out without one, you cannot sign back in until the signal returns',
      unknown: 'That did not work',
      empty: 'Please enter your email and password',
      emptyEmail: 'Please enter your email address',
      agree: 'Please read the Terms of Use and Privacy Policy, then tick the box to agree',
      short: 'Passwords need {n} characters or more',
    },
  },

  plan: {
    title: 'Your free month has ended',
    body: 'Choose a plan to carry on using the app.',
    bodyLeft: '{left} left in your free month',
    open: 'See the plans',
    close: 'Close',
    names: {
      monthly: '1 month',
      quarterly: '3 months',
      half: '6 months',
      yearly: '12 months (paid upfront)',
    },
    price: '¥{yen}',
    choose: 'Choose this plan',
    chosen: 'Thank you',
    chosenBody: 'We will be in touch once payment is set up. You can keep using the app until then.',
    current: 'Chosen: {name}',
    change: 'Change',
    notYet: 'Nothing is charged on this screen.',

    statusTitle: 'Your plan',
    statusTrial: 'Free month',
    statusEndedShort: 'Free month ended',
    statusEndedPaid: 'Paid period ended',
    until: 'until {date}',
    chosenAt: 'Chosen on {date}',
    notChosen: 'No plan chosen yet',
    retired: 'This plan is no longer offered. Please choose again below.',
    chosenLabel: 'Chosen plan',
    choiceTitle: 'Choose a plan',
    afterTrial:
      'You can keep using the app for now, even after the free month ends. We will be in touch once payment is set up.',
    contact: 'For anything else, please contact the provider.',

    transferTitle: 'Where to pay',
    transferLead: 'Please transfer to the account below. Any bank in Japan can send this transfer.',
    transferBank: 'Bank',
    transferAccount: 'Account',
    transferHolder: 'Account name',
    transferAmount: 'Amount',
    transferName: 'Sender name',
    transferNameHow: 'Please put this number before your name.',
    transferNameExample: 'e.g. {code}YAMADA TARO',
    transferAfter: 'We will confirm your transfer and let you know when your plan starts.',
    reportTitle: 'Once you have transferred',
    reportLead: 'Tap the button below and we will be notified. We will check the account and then confirm that your plan has started.',
    reportButton: 'I have made the transfer',
    reportSending: 'Sending…',
    reportDone: 'Thank you — we have been notified',
    reportDoneBody: 'Checking takes a little time. This screen will change to “Active” once we have confirmed it.',
    reportFailed: 'We could not send this. Please try again where there is a signal.',
    transferNotReady: 'Payment details are being prepared',
    transferNotReadyBody: 'We will show them here as soon as they are ready.',
    futsu: 'Ordinary',
    touza: 'Current',
  },

  notices: {
    title: 'Notices',
    titleCount: 'Notices ({n})',
    readAll: 'Mark all read',
    readAllLabel: 'Mark every notice as read',
    emptyTitle: 'No notices',
    emptyBody: 'Newly added facilities and cautions that apply right now appear here.',
    sectionCautions: 'Cautions that apply now',
    sectionAdded: 'Newly added facilities',
    sectionTrial: 'About your payment',
    trialTitle: 'Your free trial ends in {n} days',
    paidExpiryTitle: 'Your plan ends in {n} days',
    trialBody:
      'After {date}, only the settings screen stays available until payment is made. Tap to continue.',
    addedNote: 'Facilities added since this device last downloaded, for up to 14 days.',
    addedBody: 'Newly added.',

    sectionChanged: 'Guidance that changed',
    changedBody: '{items} changed. Please check before you go.',
    changeApproach: 'How to approach',
    changeCoords: 'Navigation target',
    changeHeight: 'Height limit',
    changeRoof: 'Roof',
    changeHours: 'Opening hours',
    changeEntry: 'Entrances',
    changePhoto: 'Photos',
    changeName: 'Facility name',
    changeAddress: 'Address',

    sectionCategory: 'Category changes',
    categoryAdded: '“{name}” has been added.',
    categoryRenamed: 'A category was renamed to “{name}”.',
    categoryRemoved: '“{name}” is no longer shown.',
  },

  sync: {
    staleMessage: 'Could not fetch the latest data. Showing what was downloaded last time.',
    failedMessage: 'Could not fetch the data. Please open the app once where there is a signal.',
    never: 'never',
  },

  when: {
    justNow: 'just now',
    minutesAgo: '{n} min ago',
    hoursAgo: '{n} hr ago',
    yesterday: 'yesterday',
    daysAgo: '{n} days ago',
    /*
      日付の並びが言語で違う。日本語は「9月5日」、英語は「5 Sep」。
      月の名前は months から引く。
    */
    date: '{d} {mon}',
    spanMonthsDays: '{m} months {d} days',
    spanMonths: '{m} months',
    spanDays: '{d} days',
    months: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
  },

  weekday: { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' },
  weekdayGroup: { weekdays: 'Weekdays', weekend: 'Weekends' },

  entryKind: {
    dropoff: 'Drop-off',
    entrance: 'Entrance',
    parking_entrance: 'Car park entrance',
    bus_stop: 'Bus stop',
    service: 'Service entrance',
  },

  photoKind: {
    approach: 'Approach road',
    dropoff: 'Drop-off',
    entrance: 'Entrance',
    night: 'At night',
    diagram: 'Approach diagram',
    exterior: 'Exterior',
    other: 'Other',
  },

  map: {
    cannotShow: 'The map cannot be shown',
    noKey: 'No Google Maps key is configured. The list works as usual.',
    noPins: 'No facility in this filter has coordinates.',
    loadFailed: 'Could not load the map',
    noCoords: 'No coordinates registered',
  },

  navApp: {
    google: 'Google Maps',
    yahoo: 'Yahoo! Car Navi',
    apple: 'Maps',
    web: 'Browser',
    shareText: 'Entrance guide for {name}',
  },

  photo: {
    prev: 'Previous photo',
    next: 'Next photo',
    zoomHint: 'Pinch or double-tap to zoom',
  },

  intro: {
    skip: 'Skip the intro',
    skipHint: 'Tap the screen to skip',
    sound: 'Turn on sound',
  },

  comingSoon: {
    title: 'Coming soon',
  },
};

export const dictionaries: Record<Locale, Dictionary> = { ja, en };

export type { Dictionary };

/**
 * 文中の差し込みを埋める。
 *
 * 「{n} 件」のような文言に値を入れる。並び順が言語で変わるため、
 * 文字列をつなぐのではなく、埋める場所を文言の側に持たせている。
 * 英語では「{d} {mon}」、日本語では「{m}月{d}日」のように、
 * 同じ値でも置く順が違う。
 */
export function fill(template: string, values: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(String(value));
  }
  return out;
}

/**
 * 残りの長さを書く。「11か月 20日」「28日」「3か月」。
 *
 * **月だけで丸めない。** 端数の日数まで出す（ご指摘 2026-09-15）。
 * 端数が無いときだけ「3か月」と書く。「3か月 0日」は読みにくい。
 */
export function formatSpan(t: Dictionary, span: { months: number; days: number }): string {
  if (span.months <= 0) return fill(t.when.spanDays, { d: span.days });
  if (span.days <= 0) return fill(t.when.spanMonths, { m: span.months });
  return fill(t.when.spanMonthsDays, { m: span.months, d: span.days });
}

/** 日付を、その言語の並びで書く。 */
export function formatDate(t: Dictionary, d: Date): string {
  return fill(t.when.date, {
    m: d.getMonth() + 1,
    d: d.getDate(),
    mon: t.when.months[d.getMonth()],
  });
}
