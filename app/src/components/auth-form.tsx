import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  PASSWORD_MIN,
  sendReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
  type Problem,
} from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { isInstalled } from '@/lib/install';
import { notify } from '@/lib/notice';
import { loadRemembered, remember } from '@/lib/remember';
import { loadSite, type Site } from '@/lib/site';
import { HIT_SLOP, RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 登録・ログイン・再設定の入力。
 *
 * **1枚にまとめている**
 *   別々の画面にすると、行き来のたびに打った文字が消える。
 *   走行前に片手で打つ場面で、それは重い。枠は同じまま、押す先だけが
 *   入れ替わる形にしている。
 *
 * **起動時の入口と、アカウントの画面で同じものを使う**
 *   同じ入力を二か所に書くと、片方だけ直る。ここ1つに集める。
 *
 * **記憶したら、押すだけで入れる**
 *   ご指示による。印を付けた方は、次に開いたときに両方が入っている。
 *   パスワードを端末へそのまま残すことになるため、画面にもそう書く。
 *
 * **登録には確認の欄を置く**
 *   打ち間違えたまま登録すると、本人にも二度と入れない。
 *   いまはメールの送信口が無く、再設定でも救えない。
 *
 * **登録には、利用規約とプライバシーポリシーへの同意を求める**（2026-10-08 ご回答）
 *   規約を会員との約束として効かせるには、登録の前に示しておく必要がある。
 *   掲載先（サイト設定）が入っているときだけ欄を出す。読めない規約に同意を
 *   求めても意味が無いため。掲載先を入れた時点で、自動的に出るようになる。
 *
 * **再設定は、送った後の画面を独り立ちさせる**（2026-10-29）
 *   以前は「届いたメールのリンクをお開きください」の一行だけだった。
 *   知らない差出人からのメールは、迷惑メールと見分けがつかない。
 *   どこへ送ったか・何という件名と差出人で届くか・何を押すか・届かない
 *   ときどうするかを、その場に残す。送り直しは 60 秒あける（Supabase も
 *   同じ宛先へは 60 秒あけないと受け付けない）。
 *
 *   件名・差出人・ボタンの名前は、届くメール（supabase/templates/
 *   reset-password.html と Supabase の設定）に合わせてある。
 */

type Mode = 'in' | 'up' | 'reset';

/** 欄のすぐ下に出す言い分。Problem に、こちらで見つけるぶんを足す。 */
export type Trouble = Problem | 'empty' | 'emptyEmail' | 'short' | 'agree';

/** 再設定のメールを送り直せるまでの秒数 */
const RESEND_WAIT = 60;

/** 再設定の画面に置くアプリのアイコン（icon.png を 192px に縮めたもの） */
const MARK = require('@/assets/brand/mark-192.png');

/**
 * よく使われるメールの、ブラウザで開ける入口。
 *
 * 宛先のドメインで当てる。当たらないもの（会社のメールなど）には
 * ボタンを出さない。押しても関係の無い受信箱が開くだけになる。
 */
const MAIL_SERVICES: { key: 'gmail' | 'outlook' | 'yahoo' | 'icloud'; domains: RegExp; url: string }[] = [
  { key: 'gmail', domains: /^(gmail\.com|googlemail\.com)$/, url: 'https://mail.google.com/mail/u/0/#inbox' },
  {
    key: 'outlook',
    domains: /^(outlook\.(com|jp)|hotmail\.(com|co\.jp)|live\.(com|jp)|msn\.com)$/,
    url: 'https://outlook.live.com/mail/0/',
  },
  { key: 'yahoo', domains: /^(yahoo\.co\.jp|ymail\.ne\.jp)$/, url: 'https://mail.yahoo.co.jp/' },
  { key: 'yahoo', domains: /^yahoo\.com$/, url: 'https://mail.yahoo.com/' },
  { key: 'icloud', domains: /^(icloud\.com|me\.com|mac\.com)$/, url: 'https://www.icloud.com/mail/' },
];

/** 携帯会社のメール。パソコンからのメールを断る設定が多い */
const CARRIER_MAIL =
  /@(docomo\.ne\.jp|ezweb\.ne\.jp|au\.com|softbank\.ne\.jp|i\.softbank\.jp|ymobile\.ne\.jp|uqmobile\.jp)$/i;

function mailServiceOf(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return MAIL_SERVICES.find((m) => m.domains.test(domain)) ?? null;
}

/** 動きを控える設定か（ブラウザ）。端末側は AccessibilityInfo で別に見る */
function prefersReducedMotion(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function AuthForm({
  onModeChange,
}: {
  /** 入口の画面が、再設定のあいだ「ようこそ」を下げるために使う */
  onModeChange?: (mode: Mode) => void;
} = {}) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const { ready, recovering, doneRecovering } = useAccount();

  /*
    入れたら、探す画面へ渡す。

    **ここを渡さないと、出た場所に戻る。** ログアウトはアカウントの
    画面から行うため、入り直すとアカウントの画面がそのまま出ていた。
    入り直した方の用事は施設を探すことで、自分の情報を見ることではない。

    replace にするのは、戻る操作で入口へ引き返さないようにするため。
    無料期間が切れている場合は、この先で設定へ回される（plan-gate）。
  */
  const router = useRouter();
  const toSearch = () => router.replace('/');

  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  /** 確認メール・再設定メールを送った先。送った後の案内に使う。 */
  const [sentTo, setSentTo] = useState<string | null>(null);
  /* 規約類の掲載先（ログインする前でも読める）。同意の欄に使う */
  const [site, setSite] = useState<Site | null>(null);
  const [agreed, setAgreed] = useState(false);
  /* 再設定のメールを送り直せるまでの残り秒数と、送り直せたか */
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);
  const termsUrl = site?.termsUrl || null;
  const privacyUrl = site?.privacyUrl || null;
  const needsConsent = mode === 'up' && !!(termsUrl || privacyUrl);

  useEffect(() => {
    let alive = true;
    loadSite().then((v) => {
      if (alive) setSite(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* 控えてあるものを入れておく。押すだけで入れるように。 */
  useEffect(() => {
    let alive = true;
    loadRemembered().then((r) => {
      if (!alive) return;
      if (r.email) setEmail(r.email);
      if (r.password) setPassword(r.password);
      setKeep(r.full || !r.email);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const clear = () => {
    setTrouble(null);
    setSentTo(null);
    setResent(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    clear();
    onModeChange?.(next);
  };

  /** 送り直す。宛先は最初に送ったアドレスのまま。 */
  async function onResend() {
    if (busy || cooldown > 0 || !sentTo) return;
    setTrouble(null);
    setResent(false);
    setBusy(true);
    try {
      const r = await sendReset(sentTo);
      if (!r.ok) return setTrouble(r.problem);
      setResent(true);
      setCooldown(RESEND_WAIT);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (busy) return;
    clear();

    if (mode === 'reset') {
      if (!email.trim()) return setTrouble('emptyEmail');
    } else {
      if (!email.trim() || !password) return setTrouble('empty');
      if (password.length < PASSWORD_MIN) return setTrouble('short');
      // 登録のときだけ、確認と突き合わせる
      if (mode === 'up' && password !== confirm) return setTrouble('mismatch');
      // 登録のときは、規約類への同意も（掲載先があるときだけ）
      if (needsConsent && !agreed) return setTrouble('agree');
    }

    setBusy(true);
    try {
      if (mode === 'reset') {
        const r = await sendReset(email);
        if (!r.ok) return setTrouble(r.problem);
        // 帯は出さない。画面ごと「送った後」に替わるので、それで伝わる。
        setSentTo(email.trim());
        setCooldown(RESEND_WAIT);
        return;
      }

      if (mode === 'up') {
        const r = await signUp(email, password, needsConsent ? { termsUrl, privacyUrl } : undefined);
        if (!r.ok) return setTrouble(r.problem);
        await remember(email, password, keep);
        setConfirm('');
        if (r.value.needsConfirm) {
          setSentTo(email.trim());
          notify(t.account.confirmTitle, t.account.resetSentBody);
        } else {
          notify(t.account.welcome);
          toSearch();
        }
        return;
      }

      const r = await signIn(email, password);
      if (!r.ok) return setTrouble(r.problem);
      await remember(email, password, keep);
      notify(t.account.signedIn);
      toSearch();
    } finally {
      setBusy(false);
    }
  }

  /** 再設定のリンクから戻ってきた後、新しいパスワードを決める */
  async function onNewPassword() {
    if (busy) return;
    clear();
    if (password.length < PASSWORD_MIN) return setTrouble('short');
    if (password !== confirm) return setTrouble('mismatch');

    setBusy(true);
    try {
      const r = await updatePassword(password);
      if (!r.ok) return setTrouble(r.problem);
      setPassword('');
      setConfirm('');
      doneRecovering();
      notify(t.account.changed);
      toSearch();
    } finally {
      setBusy(false);
    }
  }

  /*
    再設定の途中を最優先で出す。

    リンクから戻ると、Supabase はログイン済みの状態にする。そのまま
    「ログイン中の画面」を出すと、新しいパスワードを決める場所へ
    たどり着けない。
  */
  if (recovering) {
    return (
      <View style={s.wrap}>
        <Text style={s.sectionTitle}>{t.account.recoveryTitle}</Text>
        <Text style={s.lead}>{t.account.recoveryLead}</Text>

        <PasswordField
          value={password}
          onChange={setPassword}
          reveal={reveal}
          onReveal={setReveal}
          label={t.account.passwordNew}
          hint={fill(t.account.passwordHint, { n: PASSWORD_MIN })}
          newPassword
        />
        <PasswordField
          value={confirm}
          onChange={setConfirm}
          reveal={reveal}
          onReveal={setReveal}
          label={t.account.passwordAgain}
          newPassword
        />
        <TroubleLine trouble={trouble} />

        <Submit
          label={busy ? t.account.working : t.account.submitPassword}
          disabled={busy}
          onPress={onNewPassword}
        />

        {/*
          やめる道。

          決めるまで中へ通さない作りにしたため、これが無いと、
          気が変わった方が何もできなくなる。出て、今までの
          パスワードでログインし直していただく。
        */}
        <Pressable
          onPress={async () => {
            await signOut();
            doneRecovering();
          }}
          accessibilityRole="button"
          style={s.linkRow}
        >
          <Text style={s.link}>{t.account.recoveryCancel}</Text>
        </Pressable>
      </View>
    );
  }

  const emailField = (
    <>
      <Text style={s.label}>{t.account.email}</Text>
      <TextInput
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setTrouble(null);
        }}
        style={s.input}
        placeholder="you@example.com"
        placeholderTextColor={c.textFaint}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        inputMode="email"
        accessibilityLabel={t.account.email}
        onSubmitEditing={mode === 'reset' ? onSubmit : undefined}
      />
    </>
  );

  const backToSignIn = (
    <Pressable
      onPress={() => switchMode('in')}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      style={[s.linkRow, s.linkRowIcon]}
    >
      <Ionicons name="arrow-back" size={16} color={c.accentInk} />
      <Text style={s.link}>{t.account.resetBack}</Text>
    </Pressable>
  );

  if (mode === 'reset' && sentTo) {
    return (
      <ResetSent
        email={sentTo}
        cooldown={cooldown}
        busy={busy}
        resent={resent}
        trouble={trouble}
        onResend={onResend}
        onChangeEmail={() => {
          // 打った文字は残したまま、入力へ戻す
          setSentTo(null);
          setTrouble(null);
          setResent(false);
        }}
        back={backToSignIn}
      />
    );
  }

  if (mode === 'reset') {
    return (
      <View style={s.wrap}>
        <ResetHero badge="key" />
        <Text style={s.heroTitle}>{t.account.resetTitle}</Text>
        <Text style={s.heroLead}>{t.account.resetLead}</Text>

        {emailField}
        <TroubleLine trouble={trouble} />

        <Submit
          label={busy ? t.account.working : t.account.submitReset}
          disabled={busy || !ready}
          onPress={onSubmit}
        />
        {backToSignIn}
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      {/*
        引き継ぎの説明は出さない（ご指示による）。
        残すのは無料期間の一言だけ。
      */}
      <Text style={s.leadStrong}>{t.account.leadTrial}</Text>

      {/* ログインと新規登録の切り替え。枠は同じまま中身だけ変える。 */}
      <View style={s.tabs}>
        {(['in', 'up'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => switchMode(m)}
            accessibilityRole="tab"
            aria-selected={mode === m}
            style={[s.tab, mode === m && s.tabOn]}
          >
            <Text style={[s.tabText, mode === m && s.tabTextOn]}>
              {m === 'in' ? t.account.modeIn : t.account.modeUp}
            </Text>
          </Pressable>
        ))}
      </View>

      {emailField}

      <PasswordField
        value={password}
        onChange={(v) => {
          setPassword(v);
          setTrouble(null);
        }}
        reveal={reveal}
        onReveal={setReveal}
        label={t.account.password}
        hint={mode === 'up' ? fill(t.account.passwordHint, { n: PASSWORD_MIN }) : undefined}
        newPassword={mode === 'up'}
      />

      {/*
        確認の欄。登録のときだけ。

        打ち間違えたまま登録すると、本人にも二度と入れない。
        いまはメールの送信口が無く、再設定でも救えない。
      */}
      {mode === 'up' && (
        <PasswordField
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setTrouble(null);
          }}
          reveal={reveal}
          onReveal={setReveal}
          label={t.account.passwordAgain}
          newPassword
        />
      )}

      {/*
        利用規約・プライバシーポリシーへの同意（2026-10-08）。登録のときだけ、
        掲載先があるときだけ。言葉を押すと文面が開く（web では本物のリンク）。
      */}
      {needsConsent && (
        <View style={s.check} testID="signup-consent">
          <Pressable
            onPress={() => {
              setAgreed(!agreed);
              setTrouble(null);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            aria-checked={agreed}
            accessibilityLabel={
              termsUrl && privacyUrl
                ? t.account.agreeBoth
                : termsUrl
                  ? t.account.agreeTermsOnly
                  : t.account.agreePrivacyOnly
            }
            hitSlop={HIT_SLOP}
          >
            <View style={[s.box, agreed && s.boxOn]}>
              {agreed && <Ionicons name="checkmark" size={15} color={c.accentText} />}
            </View>
          </Pressable>
          <Text style={[s.checkBody, s.checkText]}>
            {!!termsUrl && <LegalLink url={termsUrl} label={t.account.agreeTerms} />}
            {!!termsUrl && !!privacyUrl && t.account.agreeAnd}
            {!!privacyUrl && <LegalLink url={privacyUrl} label={t.account.agreePrivacy} />}
            {t.account.agreeTail}
          </Text>
        </View>
      )}

      {/*
        記憶する。

        パスワードを端末へそのまま残すことになる。伏せずに書く。
      */}
      <Pressable
        onPress={() => setKeep(!keep)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: keep }}
        aria-checked={keep}
        accessibilityLabel={t.account.remember}
        style={s.check}
      >
        <View style={[s.box, keep && s.boxOn]}>
          {keep && <Ionicons name="checkmark" size={15} color={c.accentText} />}
        </View>
        {/* 添えの一文は出さない（ご指示による）。 */}
        <View style={s.checkBody}>
          <Text style={s.checkText}>{t.account.remember}</Text>
        </View>
      </Pressable>

      <TroubleLine trouble={trouble} />

      {/* 登録の確認メールを送った後の案内。押す先が無いので、帯ではなく画面に残す。 */}
      {sentTo && (
        <View style={s.sent}>
          <Ionicons name="mail-outline" size={18} color={c.accent} />
          <Text style={s.sentText}>{fill(t.account.confirmBody, { email: sentTo })}</Text>
        </View>
      )}

      <Submit
        label={busy ? t.account.working : mode === 'up' ? t.account.submitUp : t.account.submitIn}
        disabled={busy || !ready}
        onPress={onSubmit}
      />

      <Pressable
        onPress={() => switchMode('reset')}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        style={s.linkRow}
      >
        <Text style={s.link}>{t.account.forgot}</Text>
      </Pressable>
    </View>
  );
}

/**
 * 再設定の画面の頭。アプリのアイコンに、いまの段の印（鍵・封筒）を添える。
 *
 * 入口の画面ではロゴを上に出しているが、再設定のあいだはそちらを下げ、
 * ここを看板にする（アカウントの画面にはロゴが無いため、ここに持たせる）。
 */
function ResetHero({ badge, pop }: { badge: 'key' | 'mail'; pop?: Animated.Value }) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const scale = pop ? pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) : 1;

  return (
    <View style={s.hero}>
      <View style={s.markWrap}>
        <Image source={MARK} style={s.mark} accessible={false} accessibilityIgnoresInvertColors />
        <Animated.View style={[s.badge, { transform: [{ scale }] }]}>
          <Ionicons name={badge === 'mail' ? 'mail' : 'key'} size={13} color={c.accentText} />
        </Animated.View>
      </View>
      <Text style={s.heroBrand}>{t.account.resetBrand}</Text>
    </View>
  );
}

/**
 * 再設定のメールを送った後。
 *
 * 並べる順は、読む方がすること順。どこへ送ったか → 何をするか →
 * メールを開く入口 → 届かないとき → 送り直す → 戻る。
 */
function ResetSent({
  email,
  cooldown,
  busy,
  resent,
  trouble,
  onResend,
  onChangeEmail,
  back,
}: {
  email: string;
  cooldown: number;
  busy: boolean;
  resent: boolean;
  trouble: Trouble | null;
  onResend: () => void;
  onChangeEmail: () => void;
  back: ReactNode;
}) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const [helpOpen, setHelpOpen] = useState(false);

  const service = mailServiceOf(email);
  const carrier = CARRIER_MAIL.test(email);
  // ホーム画面のアプリから始めた方は、リンクがブラウザで開く。戻り方を添える
  const fromApp = isInstalled();

  /*
    出るときに、下からそっと上げる。印は少し遅れて弾ませる。
    動きを控える設定なら、はじめから止まった形で出す。
  */
  const still = Platform.OS === 'web' && prefersReducedMotion();
  const [rise] = useState(() => new Animated.Value(still ? 1 : 0));
  const [pop] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    let alive = true;
    const run = (reduce: boolean) => {
      if (!alive) return;
      if (reduce) {
        rise.setValue(1);
        pop.setValue(1);
        return;
      }
      const native = Platform.OS !== 'web';
      Animated.parallel([
        Animated.timing(rise, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: native,
        }),
        Animated.spring(pop, {
          toValue: 1,
          delay: 140,
          friction: 5,
          tension: 140,
          useNativeDriver: native,
        }),
      ]).start();
    };
    if (Platform.OS === 'web') run(still);
    else {
      AccessibilityInfo.isReduceMotionEnabled().then(run, () => run(false));
      AccessibilityInfo.announceForAccessibility(t.account.resetSentTitle);
    }
    return () => {
      alive = false;
    };
    // 出たときに一度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lift = rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  const steps = [
    { text: t.account.resetStepOpen, hint: t.account.resetStepOpenHint },
    { text: t.account.resetStepLink, hint: t.account.resetStepLinkHint },
    { text: t.account.resetStepSet, hint: fromApp ? t.account.resetStepSetHintApp : null },
  ];

  const tips = [
    ...(carrier ? [t.account.resetHelpCarrier] : []),
    t.account.resetHelpSpam,
    t.account.resetHelpWait,
    t.account.resetHelpTypo,
  ];

  const waiting = cooldown > 0;

  return (
    <Animated.View style={[s.wrap, { opacity: rise, transform: [{ translateY: lift }] }]}>
      <ResetHero badge="mail" pop={pop} />

      {/* 画面が替わったことを、読み上げにも伝える */}
      <View accessibilityLiveRegion="polite" style={s.heroText}>
        <Text style={s.heroTitle} accessibilityRole="header">
          {t.account.resetSentTitle}
        </Text>
        <Text style={s.heroLead}>{t.account.resetSentLead}</Text>
      </View>

      {/* 送り先。打ち間違いに気づけるよう、そのまま出す */}
      <View style={s.emailChip}>
        <Ionicons name="mail-outline" size={16} color={c.textMuted} />
        <Text style={s.emailText} numberOfLines={1} ellipsizeMode="middle" selectable>
          {email}
        </Text>
        <View style={s.emailDivider} />
        <Pressable
          onPress={onChangeEmail}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t.account.resetChangeEmailLabel}
        >
          <Text style={s.emailChange}>{t.account.resetChangeEmail}</Text>
        </Pressable>
      </View>

      {/* このあとの手順。順番に意味があるので番号を振る */}
      <View style={s.steps}>
        <Text style={s.stepsTitle}>{t.account.resetStepsTitle}</Text>
        {steps.map((step, i) => (
          <View key={step.text} style={s.step}>
            <View style={s.stepRail}>
              <View style={s.stepNum}>
                <Text style={s.stepNumText}>{i + 1}</Text>
              </View>
              {i < steps.length - 1 && <View style={s.stepLine} />}
            </View>
            <View style={[s.stepBody, i === steps.length - 1 && s.stepBodyLast]}>
              <Text style={s.stepText}>{step.text}</Text>
              {!!step.hint && <Text style={s.stepHint}>{step.hint}</Text>}
            </View>
          </View>
        ))}
      </View>

      {service && (
        <Pressable
          onPress={() => void Linking.openURL(service.url)}
          accessibilityRole="link"
          style={s.openMail}
        >
          <Ionicons name="mail-open-outline" size={18} color={c.accentText} />
          <Text style={s.openMailText}>
            {fill(t.account.resetOpenMail, { name: t.account.resetMailNames[service.key] })}
          </Text>
          <Ionicons name="open-outline" size={15} color={c.accentText} />
        </Pressable>
      )}

      {/* 届かないとき。いつも要るものではないので畳んでおく */}
      <View style={s.help}>
        <Pressable
          onPress={() => setHelpOpen(!helpOpen)}
          accessibilityRole="button"
          accessibilityState={{ expanded: helpOpen }}
          aria-expanded={helpOpen}
          style={s.helpHead}
        >
          <Ionicons name="help-circle-outline" size={18} color={c.textMuted} />
          <Text style={s.helpTitle}>{t.account.resetHelpTitle}</Text>
          <Ionicons name={helpOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.textMuted} />
        </Pressable>
        {helpOpen && (
          <View style={s.helpBody}>
            {tips.map((tip) => (
              <View key={tip} style={s.tip}>
                <View style={s.tipDot} />
                <Text style={s.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <TroubleLine trouble={trouble} />
      {resent && (
        <View style={s.resent} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={16} color={c.accent} />
          <Text style={s.resentText}>{t.account.resetResent}</Text>
        </View>
      )}

      <Pressable
        onPress={onResend}
        disabled={busy || waiting}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || waiting }}
        style={[s.resend, (busy || waiting) && s.resendOff]}
      >
        <Ionicons name="refresh" size={16} color={busy || waiting ? c.textFaint : c.accentInk} />
        <Text style={[s.resendText, (busy || waiting) && s.resendTextOff]}>
          {busy
            ? t.account.working
            : waiting
              ? fill(t.account.resetResendIn, { s: cooldown })
              : t.account.resetResend}
        </Text>
      </Pressable>

      {back}
    </Animated.View>
  );
}

/**
 * 規約類へのリンク（同意の欄の中）。web では本物の <a>（新しいタブで開く）。
 * 長押しの「新しいタブで開く」や、宛先の確認ができるように。
 */
function LegalLink({ url, label }: { url: string; label: string }) {
  const c = useTheme();
  const s = makeStyles(c);
  const asAnchor =
    Platform.OS === 'web' ? ({ href: url, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } as object) : null;
  return (
    <Text
      {...asAnchor}
      onPress={Platform.OS === 'web' ? undefined : () => void Linking.openURL(url)}
      accessibilityRole="link"
      style={s.legalLink}
    >
      {label}
    </Text>
  );
}

/** パスワードの欄。見せる・隠すを添える。 */
export function PasswordField({
  value,
  onChange,
  reveal,
  onReveal,
  label,
  hint,
  newPassword = false,
}: {
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  onReveal: (v: boolean) => void;
  label: string;
  hint?: string;
  newPassword?: boolean;
}) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);

  return (
    <>
      <View style={s.labelRow}>
        <Text style={s.label}>{label}</Text>
        {hint && <Text style={s.labelHint}>{hint}</Text>}
      </View>
      <View style={s.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          style={[s.input, s.inputFlex]}
          secureTextEntry={!reveal}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          accessibilityLabel={label}
        />
        {/*
          見せる・隠す。

          走行前に片手で打つと打ち間違いが起きる。見られて困る場所でも
          ないため、確かめられるようにしておく。
        */}
        <Pressable
          onPress={() => onReveal(!reveal)}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={reveal ? t.account.hide : t.account.show}
          style={s.reveal}
        >
          <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={c.textMuted} />
        </Pressable>
      </View>
    </>
  );
}

/** うまくいかなかった理由。欄のすぐ下に出す。 */
export function TroubleLine({ trouble }: { trouble: Trouble | null }) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  if (!trouble) return null;

  const text =
    trouble === 'short'
      ? fill(t.account.error.short, { n: PASSWORD_MIN })
      : t.account.error[trouble];

  return (
    <View style={s.trouble} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={16} color={c.danger} />
      <Text style={s.troubleText}>{text}</Text>
    </View>
  );
}

export function Submit({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const s = makeStyles(c);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[s.submit, disabled && s.submitOff]}
    >
      <Text style={s.submitText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { gap: SPACE.sm },
    sectionTitle: { fontSize: TEXT.title, fontWeight: '800', color: c.text },
    lead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20 },
    leadStrong: { fontSize: TEXT.sub, color: c.accentInk, fontWeight: '700' },

    tabs: {
      flexDirection: 'row',
      gap: SPACE.xs,
      marginTop: SPACE.sm,
      padding: 3,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.border,
    },
    tab: {
      flex: 1,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
    },
    tabOn: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.accent },
    tabText: { fontSize: TEXT.bodyStrong, fontWeight: '700', color: c.textMuted },
    tabTextOn: { color: c.accentInk },

    labelRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: SPACE.sm,
    },
    label: { fontSize: TEXT.sub, fontWeight: '700', color: c.text, marginTop: SPACE.sm },
    labelHint: { fontSize: TEXT.small, color: c.textFaint },

    inputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
    inputFlex: { flex: 1 },
    input: {
      height: 48,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      color: c.text,
      fontSize: TEXT.bodyStrong,
    },
    reveal: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
    },

    /* 記憶する印 */
    check: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.sm,
      marginTop: SPACE.md,
      paddingVertical: SPACE.xs,
    },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    boxOn: { backgroundColor: c.accent, borderColor: c.accent },
    checkBody: { flex: 1, gap: 2 },
    checkText: { fontSize: TEXT.body, fontWeight: '700', color: c.text },
    legalLink: { color: c.accentInk, textDecorationLine: 'underline' },

    trouble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.xs,
      marginTop: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.sm,
      backgroundColor: c.dangerSoft,
    },
    troubleText: { flex: 1, fontSize: TEXT.sub, color: c.danger, lineHeight: 19 },

    sent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.sm,
      marginTop: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
    },
    sentText: { flex: 1, fontSize: TEXT.sub, color: c.text, lineHeight: 20 },

    submit: {
      marginTop: SPACE.lg,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.md,
      backgroundColor: c.accent,
    },
    submitOff: { opacity: 0.5 },
    submitText: { fontSize: TEXT.title, fontWeight: '800', color: c.accentText },

    linkRow: { marginTop: SPACE.md, alignItems: 'center', paddingVertical: SPACE.sm },
    linkRowIcon: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.xs },
    link: { fontSize: TEXT.sub, fontWeight: '700', color: c.accentInk },

    /* 再設定の画面の頭。アイコンと、段の印 */
    hero: { alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs },
    markWrap: { width: 64, height: 64 },
    mark: {
      width: 64,
      height: 64,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      boxShadow: '0 8px 20px rgba(11, 26, 51, 0.22)',
    },
    badge: {
      position: 'absolute',
      right: -7,
      bottom: -7,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
      borderWidth: 3,
      borderColor: c.surface,
    },
    heroBrand: {
      marginTop: SPACE.xs,
      fontSize: TEXT.small,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: c.textMuted,
    },
    heroText: { alignItems: 'center', gap: SPACE.xs },
    heroTitle: { fontSize: TEXT.heading, fontWeight: '800', color: c.text, textAlign: 'center' },
    heroLead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20, textAlign: 'center' },

    /* 送り先 */
    emailChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      maxWidth: '100%',
      gap: SPACE.sm,
      marginTop: SPACE.xs,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
    },
    emailText: { flexShrink: 1, fontSize: TEXT.body, fontWeight: '700', color: c.text },
    emailDivider: { width: 1, alignSelf: 'stretch', backgroundColor: c.border },
    emailChange: { fontSize: TEXT.sub, fontWeight: '700', color: c.accentInk },

    /* このあとの手順 */
    steps: {
      marginTop: SPACE.md,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
    },
    stepsTitle: {
      marginBottom: SPACE.sm,
      fontSize: TEXT.small,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: c.textMuted,
    },
    step: { flexDirection: 'row', gap: SPACE.md },
    stepRail: { width: 24, alignItems: 'center' },
    stepNum: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
    },
    stepNumText: {
      fontSize: TEXT.small,
      fontWeight: '800',
      color: c.accentText,
      fontVariant: ['tabular-nums'],
    },
    stepLine: { flex: 1, width: 2, marginVertical: 3, borderRadius: 1, backgroundColor: c.border },
    stepBody: { flex: 1, gap: 2, paddingTop: 2, paddingBottom: SPACE.md },
    stepBodyLast: { paddingBottom: 0 },
    stepText: { fontSize: TEXT.body, fontWeight: '700', color: c.text, lineHeight: 20 },
    stepHint: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 19 },

    /* メールを開く */
    openMail: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.sm,
      marginTop: SPACE.md,
      height: 52,
      borderRadius: RADIUS.md,
      backgroundColor: c.accent,
    },
    openMailText: { fontSize: TEXT.title, fontWeight: '800', color: c.accentText },

    /* 届かないとき */
    help: {
      marginTop: SPACE.sm,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    helpHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      minHeight: 48,
      paddingHorizontal: SPACE.md,
    },
    helpTitle: { flex: 1, fontSize: TEXT.body, fontWeight: '700', color: c.text },
    helpBody: { gap: SPACE.sm, paddingHorizontal: SPACE.md, paddingBottom: SPACE.md },
    tip: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
    tipDot: { width: 5, height: 5, marginTop: 8, borderRadius: 3, backgroundColor: c.textFaint },
    tipText: { flex: 1, fontSize: TEXT.sub, color: c.text, lineHeight: 20 },

    /* 送り直す */
    resent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.xs,
      marginTop: SPACE.sm,
    },
    resentText: { fontSize: TEXT.sub, fontWeight: '700', color: c.accentInk },
    resend: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.sm,
      marginTop: SPACE.sm,
      height: 48,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surface,
    },
    resendOff: { borderColor: c.border, backgroundColor: c.surface2 },
    resendText: {
      fontSize: TEXT.bodyStrong,
      fontWeight: '700',
      color: c.accentInk,
      fontVariant: ['tabular-nums'],
    },
    resendTextOff: { color: c.textFaint },
  });
