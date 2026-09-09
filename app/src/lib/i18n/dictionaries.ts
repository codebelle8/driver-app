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
    mypage: 'マイページ',
    /** 読み上げに、選ばれていることを添える */
    showing: '{name}（表示中）',
  },

  brand: {
    tagline1: 'スムーズな到着を、',
    tagline2: 'もっと快適に。',
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
    accountTrial: '無料期間 残り {n} 日',
    accountEnded: '無料期間は終了しました',
    accountChecking: '確認しています…',
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

    recoveryTitle: '新しいパスワードを決める',
    recoveryLead: '新しいパスワードをご入力ください。',
    changed: 'パスワードを変えました',

    confirmTitle: '確認のメールをお送りしました',
    confirmBody: '{email} へお送りしました。リンクをお開きになると、ご登録が完了します。',

    welcome: 'ご登録ありがとうございます',
    signedIn: 'ログインしました',
    signedOut: 'ログアウトしました',
    signOut: 'ログアウト',
    signOutConfirm: 'ログアウトしますか',
    signOutBody: 'お気に入りと閲覧履歴は、この端末に残ります。',

    trialTitle: '無料期間',
    trialLeft: 'あと {n} 日（{date} まで）',
    trialEnded: '{date} に終了しました',
    statusPaid: 'ご利用中',
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
    remember: 'この端末に記憶する',
    welcomeTitle: 'ようこそ',
    welcomeBody: 'ご登録のメールアドレスでログインしてください。',

    /* 退会・他の端末 */
    danger: 'アカウントの操作',
    signOutAll: 'ほかの端末からもログアウト',
    signOutAllBody: 'この端末を含め、すべてのログインを切ります。',
    signedOutAll: 'すべての端末からログアウトしました',
    leave: '退会する',
    leaveConfirm: '退会しますか',
    leaveBody: 'メールアドレス・顔写真・お気に入り・閲覧履歴を、すべて消します。',
    leaveNote: '元には戻せません。',
    leaveYes: '退会する',
    leaveDone: '退会しました',
    blockedTitle: 'ご利用を停止しています',
    blockedBody: 'お心当たりがない場合は、提供元へお問い合わせください。',

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
      network: '通信できませんでした。電波の届く場所でお試しください',
      unknown: 'うまくいきませんでした',
      empty: 'メールアドレスとパスワードをご入力ください',
      emptyEmail: 'メールアドレスをご入力ください',
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
    bodyLeft: '無料期間はあと {n} 日です',
    open: '料金プランを見る',
    close: '閉じる',
    monthly: '月額',
    yearly: '年額',
    priceMonth: '{yen} 円 / 月',
    priceYear: '{yen} 円 / 年',
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
    until: '{date} まで',
    chosenAt: '{date} にお申し込み',
    notChosen: 'まだお選びいただいていません',
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
    addedNote: '前回この端末で取り込んだあとに増えた施設を、過去14日ぶんまで出しています。',
    addedBody: '新しく追加されました。',
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
    mypage: 'Settings',
    showing: '{name} (showing)',
  },

  brand: {
    tagline1: 'Arrive smoothly,',
    tagline2: 'every time.',
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
    accountTrial: '{n} days left in your free month',
    accountEnded: 'Your free month has ended',
    accountChecking: 'Checking…',
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

    recoveryTitle: 'Set a new password',
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

    trialTitle: 'Free month',
    trialLeft: '{n} days left (until {date})',
    trialEnded: 'Ended on {date}',
    statusPaid: 'Active',
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
    remember: 'Remember on this device',
    welcomeTitle: 'Welcome',
    welcomeBody: 'Sign in with your registered email address.',

    danger: 'Account',
    signOutAll: 'Sign out everywhere',
    signOutAllBody: 'Ends every sign-in, including this device.',
    signedOutAll: 'Signed out on every device',
    leave: 'Delete account',
    leaveConfirm: 'Delete your account?',
    leaveBody: 'Your email, photo, favourites and history will all be removed.',
    leaveNote: 'This cannot be undone.',
    leaveYes: 'Delete',
    leaveDone: 'Your account has been deleted',
    blockedTitle: 'This account is suspended',
    blockedBody: 'If this seems wrong, please contact the provider.',

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
      network: 'Could not connect. Please try where there is a signal',
      unknown: 'That did not work',
      empty: 'Please enter your email and password',
      emptyEmail: 'Please enter your email address',
      short: 'Passwords need {n} characters or more',
    },
  },

  plan: {
    title: 'Your free month has ended',
    body: 'Choose a plan to carry on using the app.',
    bodyLeft: '{n} days left in your free month',
    open: 'See the plans',
    close: 'Close',
    monthly: 'Monthly',
    yearly: 'Yearly',
    priceMonth: '¥{yen} / month',
    priceYear: '¥{yen} / year',
    choose: 'Choose this plan',
    chosen: 'Thank you',
    chosenBody: 'We will be in touch once payment is set up. You can keep using the app until then.',
    current: 'Chosen: {name}',
    change: 'Change',
    notYet: 'Nothing is charged on this screen.',

    statusTitle: 'Your plan',
    statusTrial: 'Free month',
    statusEndedShort: 'Free month ended',
    until: 'until {date}',
    chosenAt: 'Chosen on {date}',
    notChosen: 'No plan chosen yet',
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
    addedNote: 'Facilities added since this device last downloaded, for up to 14 days.',
    addedBody: 'Newly added.',
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

/** 日付を、その言語の並びで書く。 */
export function formatDate(t: Dictionary, d: Date): string {
  return fill(t.when.date, {
    m: d.getMonth() + 1,
    d: d.getDate(),
    mon: t.when.months[d.getMonth()],
  });
}
