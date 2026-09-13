/**
 * 表示文言の辞書。
 *
 * 言語は Cookie に保存し、サーバー側で読んでから描画する。
 * クライアント側で切り替えると一瞬だけ英語が見えるなどのちらつきが出るため。
 */

export const LOCALES = ['ja', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ja';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

const ja = {
  brand: {
    name: '車寄せナビ',
    sub: '管理画面',
    tagline: 'ドライバー専用',
    footerName: '車寄せナビ — 車寄せ案内システム',
  },
  nav: {
    dashboard: 'ダッシュボード',
    facilities: '施設一覧',
    categories: 'カテゴリ',
    members: '会員・お支払い',
    push: '通知',
    accounts: 'アカウント',
    history: '操作履歴',
    site: 'サイト設定',
    menu: 'メニュー',
    closeMenu: 'メニューを閉じる',
    scrollTop: '先頭へ戻る',
    signOut: 'ログアウト',
    roleAdmin: '管理者',
    roleEditor: '編集者',
    roleSurveyor: '調査員',
  },


  role: {
    admin: '管理者',
    editor: '編集者',
    surveyor: '調査員',
    adminDesc: 'すべての操作。アカウントの発行・停止と操作履歴の閲覧を含みます',
    editorDesc: '施設の登録・編集・公開・削除。アカウント管理はできません',
    surveyorDesc: '下書きの登録・編集のみ。公開済みの情報は変更できません',
  },

  auditAction: {
    insert: '追加',
    update: '変更',
    delete: '削除',
    publish: '公開',
  },

  auditTable: {
    facilities: '施設',
    entry_points: '入口・車寄せ',
    cautions: '注意事項',
    photos: '写真',
    categories: 'カテゴリ',
    admin_profiles: 'アカウント',
  },

  /*
    会員（ドライバー）とお支払い。

    「アカウント」は管理画面を操作する人、こちらはアプリを使う人。
    名前が似ているため、画面の説明で違いを言い切る。
  */
  push: {
    title: 'プッシュ通知',
    description: 'ドライバーの端末へ、アプリを開いていなくても届く知らせを送ります。',

    keysTitle: '配信の鍵',
    keysBody:
      '通知を送るには、配信の鍵をひとつ作ります。作るのは一度だけです。作り直すと、いま受け取っている端末がすべて受け取れなくなります。',
    keysMake: '配信の鍵を作る',
    keysReady: '鍵は用意できています。',
    keysWarn: '作り直しはできません。いま受け取っている端末が、すべて受け取れなくなるためです。',

    sendTitle: '知らせを送る',
    sendHint:
      'いま {n} 台へ届きます。押した時点で鳴ります。取り消しはできません。',
    subject: '件名',
    subjectPlaceholder: '例: 帝国ホテル東京の進入口が変わりました',
    body: '本文',
    bodyHint: '120文字以内。端末側で切り詰められるため、短く。',
    openAt: '押したときに開く画面',
    openAtHint: '空欄なら「お知らせ」を開きます',
    send: '送る',
    sending: '送っています...',

    targetsTitle: '届く先',
    targetsCount: '受け取る設定にしている端末が {n} 台あります。',
    noTargets: '届く先がありません',
    noTargetsBody:
      'ドライバーがマイページで「お知らせの通知」を入れると、ここに数が出ます。iPhone はホーム画面へ追加した場合のみ受け取れます。',
  },

  site: {
    title: 'サイト設定',
    description: 'アプリの「このアプリについて」に出す、掲載先と連絡先です。',

    linksTitle: '規約類の掲載先',
    linksHint:
      '入れた項目だけがアプリに出ます。空のままの項目は出ません。ホームページなどに掲載し、そのURLを貼り付けてください。',

    operatorName: '運営者名',
    operatorNameHint: '特定商取引法に基づく表記に使うお名前（社名・屋号）です。',
    contactEmail: 'お問い合わせ先（メール）',
    contactEmailHint: 'ドライバーが押すと、この宛先へのメールが開きます。',
    termsUrl: '利用規約のURL',
    privacyUrl: 'プライバシーポリシーのURL',
    lawUrl: '特定商取引法に基づく表記のURL',

    whyTitle: 'お金を受け取る前に、この3つが要ります',
    whyBody:
      '継続してお金をいただくには、販売者名・連絡先・金額・支払いの時期・解約の条件を書いた「特定商取引法に基づく表記」が要ります。メールアドレスや顔写真をお預かりするため、プライバシーポリシーも要ります。文面はこちらでお作りできます。',

    save: '保存',
    saving: '保存しています…',
  },

  members: {
    title: '会員・お支払い',
    description: 'アプリをお使いのドライバーと、銀行振込の受取口座を管理します。',

    transferTitle: 'お振込先（受取口座）',
    transferHint:
      'ここに入れたものが、そのままドライバーの画面に出ます。空のあいだは「準備中」と出ます。',
    bankName: '金融機関名',
    branchName: '支店名',
    accountType: '種別',
    futsu: '普通',
    touza: '当座',
    accountNumber: '口座番号',
    accountNumberHint: '数字のみ',
    accountHolder: '口座名義',
    accountHolderKana: '口座名義（カナ）',
    accountHolderKanaHint: '通帳の表記に合わせてください',
    note: '添える一言',
    noteHint: '振込手数料の扱いなど。空欄で構いません',
    notePlaceholder: '振込手数料はお客様のご負担でお願いいたします。',
    save: '保存する',
    saving: '保存しています...',

    listTitle: 'ご登録のドライバー',
    empty: 'まだご登録がありません',
    emptyBody: 'アプリからご登録いただくと、ここに並びます。',
    colNo: '会員番号',
    colEmail: 'メールアドレス',
    colState: '状態',
    colTrial: '無料期間の終わり',
    colPlan: 'ご希望の料金',
    statePaid: 'ご利用中',
    stateTrial: '無料期間',
    planMonthly: '月額',
    planYearly: '年額',
    markPaid: '入金を確認した',
    undoPaid: '無料期間へ戻す',
    stateBlocked: '停止中',
    stateExpired: '期限切れ',
    daysLeft: 'あと {n} 日',
    overdue: '{n} 日超過',
    countTrial: '無料期間 {n} 名',
    countExpired: '期限切れ {n} 名',
    countPaid: 'ご利用中 {n} 名',
    countBlocked: '停止中 {n} 名',
    mailTo: 'メールを送る',
    block: '利用を停止',
    unblock: '停止を解く',
  },

  accounts: {
    title: 'アカウント管理',
    description: '調査員・編集者のアカウントを発行し、権限を管理します。',
    newTitle: 'アカウントを発行する',
    email: 'メールアドレス',
    displayName: 'お名前',
    role: '役割',
    issue: '発行する',
    issuing: '発行しています...',
    issuedTitle: '初期パスワードを発行しました',
    issuedWarning:
      'このパスワードは今だけ表示されます。画面を離れると二度と確認できません。ご本人へお渡しください。',
    listTitle: '登録済みのアカウント',
    colName: 'お名前',
    colRole: '役割',
    colState: '状態',
    colCreated: '登録日',
    active: '有効',
    inactive: '停止中',
    suspend: '停止する',
    resume: '再開する',
    delete: '削除',
    deleteConfirm:
      '{name} さんのアカウントを完全に削除します。' +
      '操作履歴の実行者欄が空欄になります。' +
      'ログインを止めるだけであれば「停止する」をお使いください。',
    deleteNote:
      '「停止する」はログインを止めるだけで、お名前も操作履歴も残ります。' +
      '「削除」は認証情報ごと消すため、操作履歴の実行者が空欄になります。通常は停止をお勧めします。',
    self: 'ご自身',
    owner: '所有者',
    ownerLocked: '所有者のため操作できません',
    empty: 'まだアカウントがありません。',
    roleNote: '役割ごとにできることが異なります。',
    adminOnly: 'この画面は管理者のみご利用いただけます。',
  },

  audit: {
    title: '操作履歴',
    description: '誰がいつ何を変更したかの記録です。',
    colWhen: '日時',
    colWho: '操作した人',
    colWhat: '対象',
    colAction: '操作',
    colDetail: '内容',
    empty: 'まだ記録がありません。',
    unknownUser: '（削除された利用者）',
    filterAll: 'すべて',
    changedFields: '件の項目を変更',
    note: '記録はデータベース側で自動的に残ります。半年に一度、半年より古い記録の整理をお伺いします。同意をいただいたときだけ消し、それ以外の方法では消せません。',
  },

  /*
    ヘッダーの知らせの窓。

    文面はここで組み立てる。データベース側には種類と手がかりしか
    入れていない。文字を入れてしまうと、表示の言語を切り替えても
    前の言語のまま残る。
  */
  notices: {
    title: 'お知らせ',
    open: 'お知らせを開く',
    empty: '新しいお知らせはありません。',
    unread: '未対応 {n} 件',
    purgeTitle: '操作履歴の整理',
    purgeBody: '{date} より古い記録が {count} 件あります。消してよろしいでしょうか。',
    purgeApprove: '同意して消す',
    purgeDecline: '今回は見送る',
    purgeNote: '直近半年ぶんは残ります。消した記録は戻せません。',
    paymentTitle: 'お支払いの報告',
    paymentBody: '会員番号 {no} の方から、{plan}のお振込みを済ませたとご報告がありました。',
    paymentGo: '会員・お支払いへ',
    dismiss: '取り下げる',
    monthly: '月額',
    yearly: '年額',
    /* ヘッダーのベル。押すと一覧へ移る。重ねると中身が覗ける。 */
    hover: '押すと一覧をご覧いただけます',
    pageTitle: 'お知らせ',
    pageDescription: '履歴の整理のお伺いと、会員からのお支払いの報告です。',
    openTitle: '未対応',
    doneTitle: '対応が済んだもの',
    doneEmpty: 'まだありません。',
    stateDone: '対応済み',
    stateDismissed: '見送り',
    purgeRemoved: '{n} 件を整理しました',
    handledAt: '{date} に対応',
  },
  common: {
    save: '保存',
    saving: '保存しています…',
    prev: '前へ',
    next: '次へ',
    pagination: 'ページ送り',
    range: '{from}〜{to} 件目',
    saved: '保存しました',
    cancel: 'キャンセル',
    delete: '削除',
    /*
      消す前の確かめ。

      取り消せない操作は、押した瞬間ではなく一度受け止める。
      何が・いくつ消えるのかを本文に書き、戻せないことは
      行を分けて添える（noUndo）。本文の末尾に続けて書くと、
      折り返しが語の途中に落ちて読みにくかった。
    */
    deleteHeading: '削除しますか？',
    deleteOneConfirm: '「{name}」を削除します。',
    deleteManyConfirm: '{count} 件を削除します。',
    noUndo: '元には戻せません。',
    /* まとめて消すための選択 */
    select: '選択',
    selectAll: 'すべて選ぶ',
    unselectAll: 'すべて外す',
    selectCancel: 'やめる',
    deleteSelected: '削除 ({count})',
    close: '閉じる',
    add: '追加',
    back: '一覧へ戻る',
    loading: '読み込んでいます…',
    required: '必須',
    yes: 'あり',
    no: 'なし',
    unknown: '未確認',
    available: '可',
    unavailable: '不可',
    count: '件',
    places: 'か所',
    sheets: '枚',
    theme: '表示を切り替え',
    themeLight: '明るい表示',
    themeDark: '暗い表示',
    language: '言語',
  },
  status: {
    draft: '下書き',
    published: '公開中',
    archived: '非表示',
  },
  login: {
    email: 'メールアドレス',
    password: 'パスワード',
    submit: 'ログイン',
    pending: 'ログインしています…',
    failed: 'メールアドレスまたはパスワードが正しくありません。',
    noPermission:
      'このアカウントには管理画面の利用権限がありません。管理者にご連絡ください。',
  },
  dashboard: {
    title: 'ダッシュボード',
    description: '登録状況と、公開までに残っている作業の一覧',
    newFacility: '施設を新規登録',
    facilityCount: '登録施設数',
    entryPointCount: '入口・車寄せ',
    photoCount: '登録写真',
    draftCount: '下書きのまま',
    remainingTitle: '公開までに残っている作業',
    placeholderPhotos: '仮画像が残っている写真',
    placeholderHint: '実写真が届き次第、管理画面から差し替えてください',
    placeholderDone: 'すべて実写真に差し替え済みです',
    missingNav: 'ナビ座標が未設定の入口',
    missingNavHint: '座標が無い入口を含む施設は公開できません',
    missingNavDone: 'すべての入口に座標が設定されています',
    recent: '最近更新した施設',
    empty: 'まだ施設が登録されていません。「施設を新規登録」から追加してください。',
  },
  facilities: {
    title: '施設一覧',
    showing: '件を表示しています',
    searchPlaceholder: '施設名・かな・別名・住所で検索',
    allCategories: 'すべてのカテゴリ',
    allStatuses: 'すべての状態',
    filter: '絞り込む',
    entryPoints: '入口',
    emptyFiltered: '該当する施設がありません',
    emptyFilteredHint: '検索条件を変えてお試しください。別名でも検索できます。',
    empty: 'まだ施設が登録されていません',
    emptyHint:
      '「施設を新規登録」から最初の施設を追加してください。写真や座標は後からでも追加できます。',
    loadFailed: '読み込みに失敗しました',
  },
  facilityForm: {
    newTitle: '施設を新規登録',
    newDescription: '施設コードはカテゴリに応じて自動採番されます',
    newNotice:
      '入口・車寄せの情報と写真は、この施設を保存したあとに登録できます。分かっている範囲だけ入力して保存して問題ありません。',
    createdNotice: '施設を登録しました。続けて入口・車寄せの情報を追加してください。',
    submitCreate: '登録して次へ進む',
    submitUpdate: '変更を保存',
    sectionBasic: '基本情報',
    sectionAddress: '所在地',
    sectionNote: '管理用メモ',
    sectionFacility: '施設の基本情報',
    name: '施設名',
    nameKana: '施設名（かな）',
    nameKanaHint: '検索に使用します。ひらがな・カタカナどちらでも可',
    aliases: '別名・略称',
    aliasesHint:
      'ドライバーが口頭で言う呼び方。複数ある場合は「;」で区切ってください。検索の精度に直結します',
    category: 'カテゴリ',
    categoryPlaceholder: '選択してください',
    status: '公開状態',
    statusDraftLabel: '下書き（アプリに表示されません）',
    postalCode: '郵便番号',
    prefecture: '都道府県',
    city: '市区町村',
    address: '住所',
    addressHint: '町名・番地・建物名',
    summary: '施設概要',
    summaryHint: 'アプリの施設詳細に表示されます。2〜3行程度',
    lat: '代表地点の緯度',
    latHint: '地図の初期表示に使います。ナビの目的地には使いません',
    lng: '代表地点の経度',
    note: 'メモ',
    noteHint: 'アプリには表示されません',
    invalidInput: '入力内容をご確認ください。',

    /*
      英語表記。

      アプリの言語を英語にしたときに使う。空欄なら日本語を
      そのまま出すため、埋まっていない項目があっても差し支えない。
    */
    sectionEnglish: '英語表記',
    englishNote:
      'アプリを英語表示にしたときに使います。空欄の項目は日本語のまま出ます。',
    nameEn: '施設名（英語）',
    nameEnHint: '看板に出ている英名を優先してください（例: Imperial Hotel, Tokyo）',
    prefectureEn: '都道府県（英語）',
    cityEn: '市区町村（英語）',
    addressEn: '住所（英語）',
    addressEnHint: '英語では小さい単位から並べます（例: 1-chome, Uchisaiwaicho）',
    summaryEn: '施設概要（英語）',
  },
  publish: {
    title: '公開状態',
    publish: 'この施設を公開する',
    cannotPublish: '公開できません',
    unpublish: '下書きに戻す',
    blockers: '公開前に解消が必要な項目',
    warnings: '公開は可能ですが、確認をおすすめします',
    warningNote:
      '仮画像のままでも公開できます。文章と座標が正しければ、ドライバーには既に十分な価値があります。',
    ready: '必要な項目はすべて揃っています。いつでも公開できます。',
    surveyorNote: '公開の切り替えは管理者が行います',
    /* 施設そのものを消す。取り消せない。 */
    deleteTitle: 'この施設を削除',
    deleteButton: '施設を削除する',
    deleteNote:
      '入口・注意事項・写真もまとめて消えます。写真は保存領域からも削除されます。',
    deletePublishedNote:
      'この施設は公開中です。削除すると、アプリの検索結果から消えます。'
      + 'すでに履歴やお気に入りに入れているドライバーには、'
      + '「管理者が削除しました」とお知らせします。',
    deleteConfirmBody: '「{name}」と、その入口・注意事項・写真をすべて削除します。',
    deleteManagerOnly: '施設の削除は管理者・編集者が行います',
    readOnlyTitle: 'この施設は公開中のため、変更できません',
    readOnlyBody:
      '公開後の内容を変更できるのは管理者・編集者のみです。'
      + '修正が必要な箇所がございましたら、管理者へお知らせください。',
  },
  entryPoint: {
    heading: '入口・車寄せ',
    add: '入口・車寄せを追加',
    addTitle: '入口・車寄せを追加',
    empty:
      '入口・車寄せがまだ登録されていません。ここがアプリの中核データです。同じ建物でも入口ごとに経路も注意点も異なるため、入口の数だけ登録してください。',
    code: '入口記号',
    codeHint: '写真のファイル名と対応します',
    kind: '区分',
    name: '名称',
    approachText: '進入方法の説明',
    approachTextHint: 'ドライバーに話しかけるつもりで書いてください',
    approachFrom: '進入元の道路・方向',
    approachFromHint: 'ナビが正しい側から到着するために重要です',
    navTitle: 'ナビ投入座標',
    navHint:
      '建物の中心ではなく、車寄せに入るために曲がる地点（進入レーンの入口）を指定してください。ここがこのアプリの価値の中心です。PC版 Google マップで地点を右クリック → 一番上の数値をクリックするとコピーできます。',
    navLat: 'ナビ緯度',
    navLng: 'ナビ経度',
    dropoffTitle: '停車位置座標',
    dropoffHint: '進入地点と実際の停車位置が離れている場合のみ入力してください。',
    /* 英語表記。空欄なら日本語のまま出る。 */
    sectionEnglish: '英語表記（任意）',
    nameEn: '名称（英語）',
    approachTextEn: '進入方法の説明（英語）',
    approachTextEnHint: 'ここが読めないと、英語表示にする意味がありません',
    approachFromEn: '進入元の道路・方向（英語）',
    mapHint: '地図を押すと座標が入ります。置く先:',
    mapMissingKey: '地図の利用設定が未完了です。NEXT_PUBLIC_GOOGLE_MAPS_API_KEY をご確認ください。',
    mapFailed: '地図を読み込めませんでした。通信とキーの制限設定をご確認ください。',
    dropoffLat: '停車位置 緯度',
    dropoffLng: '停車位置 経度',
    heightLimit: '高さ制限 (cm)',
    heightLimitHint: 'ハイヤー・ワゴンの可否判断に使います',
    roofed: '屋根',
    open24h: '24時間利用',
    active: 'この入口を有効にする',
    activeHint: '（一時閉鎖中はチェックを外すとアプリに表示されません）',
    note: '管理用メモ',
    deleteThis: 'この入口を削除',
    inactive: '無効',
    noCoords: '座標未設定',
    photos: '写真',
    saveNew: '入口を追加',
    saveEdit: '変更を保存',
  },
  caution: {
    heading: '注意事項',
    empty: '注意事項は登録されていません。',
    add: '+ 注意事項を追加',
    body: '本文',
    bodyPlaceholder: '17〜20時は送迎バスが停車するため手前のレーンは通過できません。',
    severity: '重要度',
    severityInfo: '情報',
    severityWarn: '注意',
    severityCritical: '重要（常に強調表示）',
    timeFrom: '開始時刻',
    timeTo: '終了時刻',
    weekdays: '適用曜日',
    weekdaysHint: '指定しない場合は全曜日に適用されます',
    /* 英語表記。空欄なら日本語のまま出る。 */
    bodyEn: '本文（英語）',
    always: '常時',
  },
  photo: {
    heading: '写真・進入案内図',
    empty: '写真がまだありません。',
    emptyHint:
      '写真が無くても保存できます。文章と座標が正しければ、ドライバーには既に十分な価値があります。',
    kind: '種類',
    caption: 'キャプション',
    captionHint: 'アプリの写真下に表示されます',
    file: '画像ファイル',
    fileHint: '長辺1600px以上を推奨。アップロード時に自動で圧縮・リサイズされます',
    selected: '選択中',
    upload: '写真を追加',
    uploading: 'アップロードしています…',
    placeholder: '仮画像',
    dropHint: 'この枠に画像を落としても選択できます',
    moveUp: '前へ移動',
    moveDown: '後ろへ移動',
    replace: '画像を差し替える（種別・説明・順番はそのまま）',
  },
  categories: {
    title: 'カテゴリ',
    description: 'アプリの絞り込みチップに、この順序で表示されます',
    sortOrder: '表示順',
    name: 'カテゴリ名',
    prefix: '施設コード接頭辞',
    facilityCount: '登録施設数',
    state: '状態',
    active: '有効',
    inactive: '無効',
    prefixTitle: '接頭辞について',
    prefixBody:
      '接頭辞は施設コード（HTL-0001）の採番と、写真ファイル名の規則に使われます。一度データを登録したあとに変更すると、入稿済みの写真との対応が崩れます。',
    prefixNote: '既に登録済みの施設コードは、接頭辞を変えても変わりません。',
    add: 'カテゴリを追加',
    adding: '追加しています…',
    edit: '編集',
    save: '保存',
    saving: '保存しています…',
    cancel: 'やめる',
    code: '識別子',
    codeHint: '英小文字。あとから変更できません（例: hotel）',
    prefixHint: '英大文字2〜5文字（例: HTL）',
    nameHint: 'アプリの絞り込みチップに出る名前',
    nameEn: 'カテゴリ名（英語）',
    activeLabel: 'アプリに表示する',
    moveUp: '前へ移動',
    moveDown: '後ろへ移動',
    delete: '削除',
    deleteConfirm: 'このカテゴリを削除します。',
    inUseHint: '施設が紐づいているカテゴリは削除できません。「停止」で一覧から隠せます。',
  },
  kind: {
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
  weekday: { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土', 7: '日' },
} as const;

/**
 * `as const` によって ja の各値はリテラル型（"保存" など）になる。
 * そのままだと en 側が代入できないため、値の型を string へ広げる。
 * キーの過不足は引き続き検出されるので、訳し忘れは型エラーになる。
 */
type Dictionary = {
  [K in keyof typeof ja]: {
    -readonly [K2 in keyof (typeof ja)[K]]: string;
  };
};

const en: Dictionary = {
  brand: {
    name: 'Kurumayose Navi',
    sub: 'Admin',
    tagline: 'For drivers only',
    footerName: 'Kurumayose Navi — Drop-off Guidance System',
  },
  nav: {
    dashboard: 'Dashboard',
    facilities: 'Facilities',
    categories: 'Categories',
    members: 'Members',
    push: 'Notifications',
    accounts: 'Accounts',
    history: 'History',
    site: 'Site settings',
    menu: 'Menu',
    closeMenu: 'Close the menu',
    scrollTop: 'Back to top',
    signOut: 'Sign out',
    roleAdmin: 'Administrator',
    roleEditor: 'Editor',
    roleSurveyor: 'Investigator',
  },


  role: {
    admin: 'Administrator',
    editor: 'Editor',
    surveyor: 'Investigator',
    adminDesc:
      'Everything, including issuing or suspending accounts and viewing the activity history',
    editorDesc: 'Register, edit, publish and delete facilities. Cannot manage accounts',
    surveyorDesc: 'Register and edit drafts only. Cannot change published information',
  },

  auditAction: {
    insert: 'Added',
    update: 'Changed',
    delete: 'Deleted',
    publish: 'Published',
  },

  auditTable: {
    facilities: 'Facility',
    entry_points: 'Entrance',
    cautions: 'Caution',
    photos: 'Photo',
    categories: 'Category',
    admin_profiles: 'Account',
  },

  push: {
    title: 'Push notifications',
    description: 'Send a message that reaches drivers even when the app is closed.',

    keysTitle: 'Sending key',
    keysBody:
      'To send notifications, create one sending key. You only do this once. Creating a new one stops every device that is currently subscribed.',
    keysMake: 'Create the key',
    keysReady: 'The key is ready.',
    keysWarn: 'It cannot be recreated: every subscribed device would stop receiving.',

    sendTitle: 'Send a message',
    sendHint: 'This reaches {n} devices. They ring as soon as you press. It cannot be undone.',
    subject: 'Subject',
    subjectPlaceholder: 'e.g. The entrance at Imperial Hotel Tokyo has changed',
    body: 'Message',
    bodyHint: 'Up to 120 characters. Devices truncate long text.',
    openAt: 'Screen to open',
    openAtHint: 'Leave blank to open Notices',
    send: 'Send',
    sending: 'Sending…',

    targetsTitle: 'Who receives this',
    targetsCount: '{n} devices are subscribed.',
    noTargets: 'No devices yet',
    noTargetsBody:
      'Drivers turn this on under Settings. On iPhone it works only when the app is added to the home screen.',
  },

  site: {
    title: 'Site settings',
    description: 'The links and contact address shown under "About this app".',

    linksTitle: 'Where the documents are published',
    linksHint:
      'Only the fields you fill in appear in the app. Publish each document on your website and paste its URL here.',

    operatorName: 'Operator name',
    operatorNameHint: 'The company or trade name used in the Japanese legal notice.',
    contactEmail: 'Contact email',
    contactEmailHint: 'Tapping it in the app opens a new mail to this address.',
    termsUrl: 'Terms of use URL',
    privacyUrl: 'Privacy policy URL',
    lawUrl: 'Legal notice (Japan) URL',

    whyTitle: 'These three are required before charging',
    whyBody:
      'Japanese law requires a notice stating the seller, contact details, price, when payment is taken and how to cancel. A privacy policy is required because email addresses and photos are stored. We can draft all of them.',

    save: 'Save',
    saving: 'Saving...',
  },

  members: {
    title: 'Members and payment',
    description: 'Drivers using the app, and the bank account that receives their payments.',

    transferTitle: 'Bank account for payments',
    transferHint:
      'What you enter here is shown to drivers as-is. While it is empty, the app says it is being prepared.',
    bankName: 'Bank',
    branchName: 'Branch',
    accountType: 'Type',
    futsu: 'Ordinary',
    touza: 'Current',
    accountNumber: 'Account number',
    accountNumberHint: 'Digits only',
    accountHolder: 'Account name',
    accountHolderKana: 'Account name (kana)',
    accountHolderKanaHint: 'Match the passbook',
    note: 'Extra note',
    noteHint: 'Who pays the transfer fee, and so on. May be left blank',
    notePlaceholder: 'Transfer fees are paid by the sender.',
    save: 'Save',
    saving: 'Saving…',

    listTitle: 'Registered drivers',
    empty: 'No drivers yet',
    emptyBody: 'They will appear here once they sign up in the app.',
    colNo: 'No.',
    colEmail: 'Email',
    colState: 'Status',
    colTrial: 'Free month ends',
    colPlan: 'Chosen plan',
    statePaid: 'Active',
    stateTrial: 'Free month',
    planMonthly: 'Monthly',
    planYearly: 'Yearly',
    markPaid: 'Payment received',
    undoPaid: 'Back to free month',
    stateBlocked: 'Suspended',
    stateExpired: 'Expired',
    daysLeft: '{n} days left',
    overdue: '{n} days overdue',
    countTrial: '{n} on the free month',
    countExpired: '{n} expired',
    countPaid: '{n} active',
    countBlocked: '{n} suspended',
    mailTo: 'Send an email',
    block: 'Suspend',
    unblock: 'Unsuspend',
  },

  accounts: {
    title: 'Account management',
    description: 'Issue accounts for investigators and editors, and manage their permissions.',
    newTitle: 'Issue an account',
    email: 'Email address',
    displayName: 'Name',
    role: 'Role',
    issue: 'Issue',
    issuing: 'Issuing...',
    issuedTitle: 'Initial password issued',
    issuedWarning:
      'This password is shown only once. It cannot be retrieved after you leave this page. Please pass it to the account holder.',
    listTitle: 'Registered accounts',
    colName: 'Name',
    colRole: 'Role',
    colState: 'State',
    colCreated: 'Created',
    active: 'Active',
    inactive: 'Suspended',
    suspend: 'Suspend',
    resume: 'Resume',
    delete: 'Delete',
    deleteConfirm:
      'Permanently delete the account for {name}. ' +
      'The actor in the activity history will be left blank. ' +
      'To only stop them signing in, use Suspend instead.',
    deleteNote:
      'Suspend only stops sign-in; the name and activity history remain. ' +
      'Delete removes the credentials, so the actor is left blank. Suspend is usually the better choice.',
    self: 'You',
    owner: 'Owner',
    ownerLocked: 'The owner cannot be changed here',
    empty: 'No accounts yet.',
    roleNote: 'Each role can do different things.',
    adminOnly: 'This page is available to administrators only.',
  },

  audit: {
    title: 'Activity history',
    description: 'A record of who changed what, and when.',
    colWhen: 'When',
    colWho: 'Who',
    colWhat: 'Target',
    colAction: 'Action',
    colDetail: 'Detail',
    empty: 'No records yet.',
    unknownUser: '(deleted user)',
    filterAll: 'All',
    changedFields: 'field(s) changed',
    note: 'Records are written automatically by the database. Every six months we ask whether to clear entries older than six months. They are removed only with your consent, and there is no other way to delete them.',
  },

  notices: {
    title: 'Notifications',
    open: 'Open notifications',
    empty: 'Nothing new.',
    unread: '{n} to handle',
    purgeTitle: 'Clearing the activity log',
    purgeBody: 'There are {count} entries older than {date}. May we remove them?',
    purgeApprove: 'Agree and remove',
    purgeDecline: 'Not this time',
    purgeNote: 'The last six months are kept. Removed entries cannot be restored.',
    paymentTitle: 'Payment reported',
    paymentBody: 'Member {no} reports they have made the {plan} transfer.',
    paymentGo: 'Go to members',
    dismiss: 'Dismiss',
    monthly: 'monthly',
    yearly: 'annual',
    hover: 'Open the list',
    pageTitle: 'Notifications',
    pageDescription: 'Requests to clear the activity log, and payments reported by members.',
    openTitle: 'To handle',
    doneTitle: 'Already handled',
    doneEmpty: 'Nothing yet.',
    stateDone: 'Handled',
    stateDismissed: 'Declined',
    purgeRemoved: '{n} entries removed',
    handledAt: 'Handled {date}',
  },
  common: {
    save: 'Save',
    saving: 'Saving…',
    prev: 'Previous',
    next: 'Next',
    pagination: 'Pagination',
    range: '{from}-{to} of {total}',
    saved: 'Saved',
    cancel: 'Cancel',
    delete: 'Delete',
    deleteHeading: 'Delete?',
    deleteOneConfirm: 'Delete "{name}".',
    deleteManyConfirm: 'Delete {count} items.',
    noUndo: 'This cannot be undone.',
    select: 'Select',
    selectAll: 'Select all',
    unselectAll: 'Clear all',
    selectCancel: 'Cancel',
    deleteSelected: 'Delete ({count})',
    close: 'Close',
    add: 'Add',
    back: 'Back to list',
    loading: 'Loading…',
    required: 'Required',
    yes: 'Yes',
    no: 'No',
    unknown: 'Unconfirmed',
    available: 'Available',
    unavailable: 'Not available',
    count: '',
    places: '',
    sheets: '',
    theme: 'Toggle appearance',
    themeLight: 'Light appearance',
    themeDark: 'Dark appearance',
    language: 'Language',
  },
  status: {
    draft: 'Draft',
    published: 'Published',
    archived: 'Hidden',
  },
  login: {
    email: 'Email address',
    password: 'Password',
    submit: 'Sign in',
    pending: 'Signing in…',
    failed: 'The email address or password is incorrect.',
    noPermission:
      'This account does not have permission to use the admin panel. Please contact an administrator.',
  },
  dashboard: {
    title: 'Dashboard',
    description: 'Registration status and what remains before publishing',
    newFacility: 'Add facility',
    facilityCount: 'Facilities',
    entryPointCount: 'Entrances & drop-offs',
    photoCount: 'Photos',
    draftCount: 'Still in draft',
    remainingTitle: 'Remaining before publishing',
    placeholderPhotos: 'Placeholder photos remaining',
    placeholderHint: 'Replace them from the admin panel once real photos arrive',
    placeholderDone: 'All placeholders have been replaced with real photos',
    missingNav: 'Entrances without navigation coordinates',
    missingNavHint: 'A facility with an entrance lacking coordinates cannot be published',
    missingNavDone: 'Every entrance has coordinates set',
    recent: 'Recently updated facilities',
    empty: 'No facilities registered yet. Use "Add facility" to create one.',
  },
  facilities: {
    title: 'Facilities',
    showing: 'shown',
    searchPlaceholder: 'Search by name, kana, alias or address',
    allCategories: 'All categories',
    allStatuses: 'All statuses',
    filter: 'Filter',
    entryPoints: 'Entrances',
    emptyFiltered: 'No matching facilities',
    emptyFilteredHint: 'Try different criteria. Aliases are searchable too.',
    empty: 'No facilities registered yet',
    emptyHint:
      'Use "Add facility" to create your first one. Photos and coordinates can be added later.',
    loadFailed: 'Failed to load',
  },
  facilityForm: {
    newTitle: 'Add facility',
    newDescription: 'The facility code is assigned automatically from the category',
    newNotice:
      'Entrances, drop-offs and photos can be added after saving this facility. It is fine to save with only what you know so far.',
    createdNotice: 'Facility created. Next, add the entrance and drop-off details.',
    submitCreate: 'Save and continue',
    submitUpdate: 'Save changes',
    sectionBasic: 'Basic information',
    sectionAddress: 'Location',
    sectionNote: 'Internal note',
    sectionFacility: 'Facility information',
    name: 'Facility name',
    nameKana: 'Name (kana)',
    nameKanaHint: 'Used for search. Hiragana or katakana are both fine',
    aliases: 'Aliases',
    aliasesHint:
      'How drivers refer to it in speech. Separate multiple entries with ";". This directly affects search accuracy',
    category: 'Category',
    categoryPlaceholder: 'Please select',
    status: 'Publication status',
    statusDraftLabel: 'Draft (not shown in the app)',
    postalCode: 'Postal code',
    prefecture: 'Prefecture',
    city: 'City / ward',
    address: 'Address',
    addressHint: 'Town, block number and building name',
    summary: 'Overview',
    summaryHint: 'Shown on the facility detail screen. Two or three lines',
    lat: 'Representative latitude',
    latHint: 'Used for the initial map view. Not used as the navigation destination',
    lng: 'Representative longitude',
    note: 'Note',
    noteHint: 'Not shown in the app',
    invalidInput: 'Please check your input.',
    sectionEnglish: 'English',
    englishNote:
      'Used when the app is set to English. Fields left blank fall back to Japanese.',
    nameEn: 'Facility name (English)',
    nameEnHint: 'Prefer the name on the building (e.g. Imperial Hotel, Tokyo)',
    prefectureEn: 'Prefecture (English)',
    cityEn: 'City / ward (English)',
    addressEn: 'Address (English)',
    addressEnHint: 'English puts the smallest unit first (e.g. 1-chome, Uchisaiwaicho)',
    summaryEn: 'Summary (English)',
  },
  publish: {
    title: 'Publication status',
    publish: 'Publish this facility',
    cannotPublish: 'Cannot publish yet',
    unpublish: 'Return to draft',
    blockers: 'Must be resolved before publishing',
    warnings: 'You can publish, but please review',
    warningNote:
      'You can publish with placeholders still in place. If the text and coordinates are correct, drivers already get real value.',
    ready: 'Everything required is in place. You can publish at any time.',
    surveyorNote: 'Publishing is handled by an administrator',
    deleteTitle: 'Delete this facility',
    deleteButton: 'Delete facility',
    deleteNote:
      'Its entrances, cautions and photos are removed too. Photo files are deleted from storage.',
    deletePublishedNote:
      'This facility is published. Deleting it removes it from the app’s search results. '
      + 'Drivers who saved it will be told that an administrator deleted it.',
    deleteConfirmBody: 'Delete "{name}" together with its entrances, cautions and photos.',
    deleteManagerOnly: 'Deleting a facility is handled by an administrator or editor',
    readOnlyTitle: 'This facility is published and cannot be changed',
    readOnlyBody:
      'Only administrators and editors can change published content. '
      + 'Please contact an administrator if something needs correcting.',
  },
  entryPoint: {
    heading: 'Entrances & drop-offs',
    add: 'Add entrance / drop-off',
    addTitle: 'Add entrance / drop-off',
    empty:
      'No entrances registered yet. This is the core data of the app. Even within one building, each entrance has a different route and different cautions, so register every one of them.',
    code: 'Entrance code',
    codeHint: 'Matches the photo file naming',
    kind: 'Type',
    name: 'Name',
    approachText: 'How to approach',
    approachTextHint: 'Write it as if speaking directly to the driver',
    approachFrom: 'Approaching road and direction',
    approachFromHint: 'Essential so navigation arrives from the correct side',
    navTitle: 'Navigation coordinates',
    navHint:
      'Specify the point where the driver turns in (the entrance to the approach lane), not the centre of the building. This is the core value of this app. In Google Maps on a PC, right-click the point and click the numbers at the top to copy them.',
    navLat: 'Navigation latitude',
    navLng: 'Navigation longitude',
    dropoffTitle: 'Stopping position',
    dropoffHint: 'Only fill this in if the approach point and the actual stopping position differ.',
    sectionEnglish: 'English (optional)',
    nameEn: 'Name (English)',
    approachTextEn: 'Approach instructions (English)',
    approachTextEnHint: 'Without this, switching the app to English has little value',
    approachFromEn: 'Approach road / direction (English)',
    mapHint: 'Click the map to set coordinates. Target:',
    mapMissingKey: 'Map is not configured. Check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.',
    mapFailed: 'Could not load the map. Check the network and the key restrictions.',
    dropoffLat: 'Stopping latitude',
    dropoffLng: 'Stopping longitude',
    heightLimit: 'Height limit (cm)',
    heightLimitHint: 'Used to judge whether larger vehicles can enter',
    roofed: 'Roofed',
    open24h: 'Open 24 hours',
    active: 'Enable this entrance',
    activeHint: '(Uncheck while temporarily closed to hide it from the app)',
    note: 'Internal note',
    deleteThis: 'Delete this entrance',
    inactive: 'Disabled',
    noCoords: 'No coordinates',
    photos: 'Photos',
    saveNew: 'Add entrance',
    saveEdit: 'Save changes',
  },
  caution: {
    heading: 'Cautions',
    empty: 'No cautions registered.',
    add: '+ Add caution',
    body: 'Text',
    bodyPlaceholder:
      'Between 17:00 and 20:00 shuttle buses stop here, so the near lane cannot be used.',
    severity: 'Severity',
    severityInfo: 'Information',
    severityWarn: 'Caution',
    severityCritical: 'Critical (always highlighted)',
    timeFrom: 'From',
    timeTo: 'To',
    weekdays: 'Applicable days',
    weekdaysHint: 'If none are selected it applies to every day',
    bodyEn: 'Text (English)',
    always: 'Always',
  },
  photo: {
    heading: 'Photos & approach diagram',
    empty: 'No photos yet.',
    emptyHint:
      'You can save without photos. If the text and coordinates are correct, drivers already get real value.',
    kind: 'Type',
    caption: 'Caption',
    captionHint: 'Shown beneath the photo in the app',
    file: 'Image file',
    fileHint:
      'At least 1600px on the long edge is recommended. Images are compressed and resized on upload',
    selected: 'Selected',
    upload: 'Add photo',
    uploading: 'Uploading…',
    placeholder: 'Placeholder',
    dropHint: 'You can also drop an image onto this area',
    moveUp: 'Move earlier',
    moveDown: 'Move later',
    replace: 'Replace image (kind, caption and order are kept)',
  },
  categories: {
    title: 'Categories',
    description: 'Shown in this order as filter chips in the app',
    sortOrder: 'Order',
    name: 'Category',
    prefix: 'Code prefix',
    facilityCount: 'Facilities',
    state: 'State',
    active: 'Active',
    inactive: 'Inactive',
    add: 'Add category',
    adding: 'Adding…',
    edit: 'Edit',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    code: 'Identifier',
    codeHint: 'Lowercase letters. Cannot be changed later (e.g. hotel)',
    prefixHint: '2-5 uppercase letters (e.g. HTL)',
    nameHint: 'The name shown on the filter chip in the app',
    nameEn: 'Category name (English)',
    activeLabel: 'Show in the app',
    moveUp: 'Move earlier',
    moveDown: 'Move later',
    delete: 'Delete',
    deleteConfirm: 'Delete this category.',
    inUseHint: 'A category with facilities cannot be deleted. Use Inactive to hide it.',
    prefixTitle: 'About the prefix',
    prefixBody:
      'The prefix is used to assign facility codes (HTL-0001) and to name photo files. Changing it after data has been registered breaks the link with photos already submitted.',
    prefixNote:
      'Facility codes already assigned do not change when the prefix is edited.',
  },
  kind: {
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
  weekday: { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' },
};

export const dictionaries: Record<Locale, Dictionary> = { ja, en };

export type { Dictionary };

/** まとめて削除の枠に渡す文言 */
export type BulkLabels = {
  select: string;
  selectAll: string;
  unselectAll: string;
  selectCancel: string;
  /** 「削除 ({count})」 */
  deleteSelected: string;
  heading: string;
  /** 「{count} 件を削除します。」 */
  confirmMany: string;
  noUndo: string;
  delete: string;
  cancel: string;
};

/**
 * 辞書から、まとめて削除の枠に要る文言を集める。
 *
 * 呼ぶ側が3か所あり、そのたびに10項目を書き写すと、
 * 増やしたときに一部だけ古いままになる。
 *
 * 部品側（bulk-delete.tsx）ではなくここに置いているのは、
 * あちらが 'use client' のため。サーバー側で描く画面からは、
 * client の付いた出口を呼べない。
 */
export function bulkLabels(t: Dictionary): BulkLabels {
  return {
    select: t.common.select,
    selectAll: t.common.selectAll,
    unselectAll: t.common.unselectAll,
    selectCancel: t.common.selectCancel,
    deleteSelected: t.common.deleteSelected,
    heading: t.common.deleteHeading,
    confirmMany: t.common.deleteManyConfirm,
    noUndo: t.common.noUndo,
    delete: t.common.delete,
    cancel: t.common.cancel,
  };
}
