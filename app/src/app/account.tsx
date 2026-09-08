import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { PlanPrompt } from '@/components/plan-prompt';
import {
  PASSWORD_MIN,
  changePassword,
  clearAvatar,
  daysLeft,
  isExpired,
  sendReset,
  signIn,
  signOut,
  signUp,
  updateDisplayName,
  updatePassword,
  uploadAvatar,
  type Problem,
} from '@/lib/account';
import { canPickAvatar, pickAvatar } from '@/lib/avatar';
import { useAccount } from '@/lib/account-context';
import { confirmDelete } from '@/lib/confirm';
import { useT } from '@/lib/i18n/context';
import { fill, formatDate } from '@/lib/i18n/dictionaries';
import { notify } from '@/lib/notice';
import { HIT_SLOP, RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * アカウント。登録・ログイン・再設定と、登録後の内容。
 *
 * **1枚にまとめている**
 *   登録・ログイン・再設定を別々の画面にすると、行き来のたびに
 *   打った文字が消える。走行前に片手で打つ場面で、それは重い。
 *   同じ枠のまま、押す先だけが入れ替わる形にしている。
 *
 * **ブラウザの alert は使わない**
 *   失敗は欄のすぐ下に出す。うまくいったことは下の帯（notice）で伝える。
 *   どちらもアプリの配色と書体に従う。
 *
 * **英語の文面をそのまま出さない**
 *   Supabase が返すのは英語で、版によって言い回しも変わる。
 *   種類だけを受け取り（lib/account.ts）、文言はこちらの辞書から出す。
 *
 * **登録していなくても使える**
 *   この画面へ来なければ、今までどおり193件を読める。
 *   ここは「引き継ぎたい方のための入口」で、関所ではない。
 */

/** いま何を尋ねているか */
type Mode = 'in' | 'up' | 'reset';

/** 欄のすぐ下に出す言い分。Problem に、こちらで見つけるぶんを足す。 */
type Trouble = Problem | 'empty' | 'emptyEmail' | 'short';

export default function AccountScreen() {
  const c = useTheme();
  const t = useT();
  const router = useRouter();
  const styles = makeStyles(c);

  const { account, ready, recovering, doneRecovering } = useAccount();

  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  /** 確認メール・再設定メールを送った先。送った後の案内に使う。 */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const clear = () => {
    setTrouble(null);
    setSentTo(null);
  };

  // --- 送る ------------------------------------------------------------------

  async function onSubmit() {
    if (busy) return;
    clear();

    if (mode === 'reset') {
      if (!email.trim()) return setTrouble('emptyEmail');
    } else {
      if (!email.trim() || !password) return setTrouble('empty');
      if (password.length < PASSWORD_MIN) return setTrouble('short');
    }

    setBusy(true);
    try {
      if (mode === 'reset') {
        const r = await sendReset(email);
        if (!r.ok) return setTrouble(r.problem);
        setSentTo(email.trim());
        notify(t.account.resetSent, t.account.resetSentBody);
        return;
      }

      if (mode === 'up') {
        const r = await signUp(email, password);
        if (!r.ok) return setTrouble(r.problem);
        setPassword('');
        if (r.value.needsConfirm) {
          setSentTo(email.trim());
          notify(t.account.confirmTitle, t.account.resetSentBody);
        } else {
          notify(t.account.welcome);
        }
        return;
      }

      const r = await signIn(email, password);
      if (!r.ok) return setTrouble(r.problem);
      setPassword('');
      notify(t.account.signedIn);
    } finally {
      setBusy(false);
    }
  }

  /** 再設定のリンクから戻ってきた後、新しいパスワードを決める */
  async function onNewPassword() {
    if (busy) return;
    clear();
    if (password.length < PASSWORD_MIN) return setTrouble('short');

    setBusy(true);
    try {
      const r = await updatePassword(password);
      if (!r.ok) return setTrouble(r.problem);
      setPassword('');
      doneRecovering();
      notify(t.account.changed);
    } finally {
      setBusy(false);
    }
  }

  function onSignOut() {
    confirmDelete({
      title: t.account.signOutConfirm,
      message: t.account.signOutBody,
      note: ' ',
      yes: t.account.signOut,
      onYes: () => {
        void signOut().then(() => notify(t.account.signedOut));
      },
    });
  }

  // --- 描く ------------------------------------------------------------------

  const head = (
    <View style={styles.head}>
      <IconButton icon="chevron-back" label={t.common.back} onPress={() => router.back()} />
      <Text style={styles.heading}>{t.account.title}</Text>
    </View>
  );

  /*
    再設定の途中を最優先で出す。

    リンクから戻ると、Supabase はログイン済みの状態にする。そのまま
    「ログイン中の画面」を出すと、新しいパスワードを決める場所へ
    たどり着けない。
  */
  if (recovering) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <PageWidth>
          {head}
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.sectionTitle}>{t.account.recoveryTitle}</Text>
            <Text style={styles.lead}>{t.account.recoveryLead}</Text>

            <PasswordField
              value={password}
              onChange={setPassword}
              reveal={reveal}
              onReveal={setReveal}
              label={t.account.passwordNew}
              hint={fill(t.account.passwordHint, { n: PASSWORD_MIN })}
              styles={styles}
              c={c}
              t={t}
            />
            <Trouble trouble={trouble} styles={styles} t={t} />

            <Submit
              label={busy ? t.account.working : t.account.submitPassword}
              disabled={busy}
              onPress={onNewPassword}
              styles={styles}
            />
          </ScrollView>
        </PageWidth>
      </SafeAreaView>
    );
  }

  if (account) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <PageWidth>
          {head}
          <ScrollView contentContainerStyle={styles.body}>
            <SignedIn onSignOut={onSignOut} styles={styles} c={c} t={t} />
          </ScrollView>
        </PageWidth>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageWidth>
        {head}
        <ScrollView contentContainerStyle={styles.body}>
          {mode === 'reset' ? (
            <>
              <Text style={styles.sectionTitle}>{t.account.resetTitle}</Text>
              <Text style={styles.lead}>{t.account.resetLead}</Text>
            </>
          ) : (
            <>
              <Text style={styles.lead}>{t.account.lead}</Text>
              <Text style={styles.leadStrong}>{t.account.leadTrial}</Text>

              {/* ログインと新規登録の切り替え。枠は同じまま中身だけ変える。 */}
              <View style={styles.tabs}>
                {(['in', 'up'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setMode(m);
                      clear();
                    }}
                    accessibilityRole="tab"
                    aria-selected={mode === m}
                    style={[styles.tab, mode === m && styles.tabOn]}
                  >
                    <Text style={[styles.tabText, mode === m && styles.tabTextOn]}>
                      {m === 'in' ? t.account.modeIn : t.account.modeUp}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>{t.account.email}</Text>
          <TextInput
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setTrouble(null);
            }}
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={c.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            inputMode="email"
            accessibilityLabel={t.account.email}
          />

          {mode !== 'reset' && (
            <PasswordField
              value={password}
              onChange={setPassword}
              reveal={reveal}
              onReveal={setReveal}
              label={t.account.password}
              hint={mode === 'up' ? fill(t.account.passwordHint, { n: PASSWORD_MIN }) : undefined}
              newPassword={mode === 'up'}
              styles={styles}
              c={c}
              t={t}
            />
          )}

          <Trouble trouble={trouble} styles={styles} t={t} />

          {/* 送った後の案内。押す先が無いので、帯ではなく画面に残す。 */}
          {sentTo && (
            <View style={styles.sent}>
              <Ionicons name="mail-outline" size={18} color={c.accent} />
              <Text style={styles.sentText}>
                {mode === 'reset'
                  ? t.account.resetSentBody
                  : fill(t.account.confirmBody, { email: sentTo })}
              </Text>
            </View>
          )}

          <Submit
            label={
              busy
                ? t.account.working
                : mode === 'reset'
                  ? t.account.submitReset
                  : mode === 'up'
                    ? t.account.submitUp
                    : t.account.submitIn
            }
            disabled={busy || !ready}
            onPress={onSubmit}
            styles={styles}
          />

          <Pressable
            onPress={() => {
              setMode(mode === 'reset' ? 'in' : 'reset');
              clear();
            }}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            style={styles.linkRow}
          >
            <Text style={styles.link}>
              {mode === 'reset' ? t.common.back : t.account.forgot}
            </Text>
          </Pressable>
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}

/** ログイン済みの内容。メール・無料期間・お名前・ログアウト。 */
function SignedIn({
  onSignOut,
  styles,
  c,
  t,
}: {
  onSignOut: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: ReturnType<typeof useT>;
}) {
  const { account, refresh } = useAccount();
  const [name, setName] = useState(account?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  /* 顔写真 */
  const [photoBusy, setPhotoBusy] = useState(false);

  /* パスワードの変更 */
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [reveal, setReveal] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwTrouble, setPwTrouble] = useState<Trouble | null>(null);

  if (!account) return null;

  const end = new Date(account.trialEndsAt);
  const over = isExpired(account);

  async function onSave() {
    if (!account || saving) return;
    setSaving(true);
    const r = await updateDisplayName(account.userId, name);
    setSaving(false);
    if (r.ok) {
      await refresh();
      notify(t.account.saved);
    }
  }

  async function onPickPhoto() {
    if (!account || photoBusy) return;
    const blob = await pickAvatar();
    if (!blob) return;

    setPhotoBusy(true);
    const r = await uploadAvatar(account.userId, blob, account.avatarPath);
    setPhotoBusy(false);
    if (r.ok) {
      await refresh();
      notify(t.account.avatarSaved);
    } else {
      notify(t.account.error[r.problem], undefined, 'error');
    }
  }

  async function onRemovePhoto() {
    if (!account || photoBusy) return;
    setPhotoBusy(true);
    const r = await clearAvatar(account.userId, account.avatarPath);
    setPhotoBusy(false);
    if (r.ok) {
      await refresh();
      notify(t.account.avatarRemoved);
    }
  }

  async function onChangePassword() {
    if (!account?.email || pwBusy) return;
    setPwTrouble(null);

    if (!current || !next) return setPwTrouble('empty');
    if (next.length < PASSWORD_MIN) return setPwTrouble('short');

    setPwBusy(true);
    const r = await changePassword(account.email, current, next);
    setPwBusy(false);
    if (!r.ok) return setPwTrouble(r.problem);

    setCurrent('');
    setNext('');
    notify(t.account.passwordChanged);
  }

  return (
    <>
      {/*
        顔写真。

        端末側（Expo Go・APK）では選べない。写真を選ぶ部品の追加と
        作り直しが要るため、まずブラウザで動く形にしている。
        押せない釦を出すより、変えられる場所をお伝えする。
      */}
      <View style={styles.photoRow}>
        <Avatar
          url={account.avatarUrl}
          name={account.displayName ?? account.email}
          size={72}
        />
        <View style={styles.photoSide}>
          <Text style={styles.label}>{t.account.avatar}</Text>
          {canPickAvatar() ? (
            <View style={styles.photoButtons}>
              <Pressable
                onPress={onPickPhoto}
                disabled={photoBusy}
                accessibilityRole="button"
                style={[styles.small, photoBusy && styles.smallOff]}
              >
                <Text style={styles.smallText}>{t.account.avatarChange}</Text>
              </Pressable>
              {!!account.avatarPath && (
                <Pressable
                  onPress={onRemovePhoto}
                  disabled={photoBusy}
                  accessibilityRole="button"
                  style={styles.smallGhost}
                >
                  <Text style={styles.smallGhostText}>{t.account.avatarRemove}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Text style={styles.hint}>{t.account.avatarOnlyWeb}</Text>
          )}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{t.account.email}</Text>
          <Text style={styles.cardValue}>{account.email ?? '—'}</Text>
        </View>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{t.account.trialTitle}</Text>
          <Text style={[styles.cardValue, over && styles.cardValueWarn]}>
            {account.status === 'active'
              ? t.account.statusPaid
              : account.status === 'blocked'
                ? t.account.statusBlocked
                : over
                  ? fill(t.account.trialEnded, { date: formatDate(t, end) })
                  : fill(t.account.trialLeft, {
                      n: daysLeft(account.trialEndsAt),
                      date: formatDate(t, end),
                    })}
          </Text>
        </View>
      </View>

      {/*
        料金のご案内。

        探す画面と違い、切れる前から出しておく。ここは自分から
        見に来る画面で、残り日数を確かめる場所にあたる。
      */}
      <PlanPrompt variant="panel" style={styles.planPanel} />

      <Text style={styles.label}>{t.account.displayName}</Text>
      <View style={styles.nameRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[styles.input, styles.nameInput]}
          placeholder={t.account.displayNameHint}
          placeholderTextColor={c.textFaint}
          accessibilityLabel={t.account.displayName}
        />
        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          style={styles.saveButton}
        >
          <Text style={styles.saveText}>{t.account.save}</Text>
        </Pressable>
      </View>

      {/*
        パスワードの変更。

        いまのパスワードを一度確かめてから変える。Supabase の側は
        聞かないため、席を離れた隙に変えられてしまう。
      */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.account.passwordChange}</Text>

        <PasswordField
          value={current}
          onChange={(v) => {
            setCurrent(v);
            setPwTrouble(null);
          }}
          reveal={reveal}
          onReveal={setReveal}
          label={t.account.passwordCurrent}
          styles={styles}
          c={c}
          t={t}
        />
        <PasswordField
          value={next}
          onChange={(v) => {
            setNext(v);
            setPwTrouble(null);
          }}
          reveal={reveal}
          onReveal={setReveal}
          label={t.account.passwordNew}
          hint={fill(t.account.passwordHint, { n: PASSWORD_MIN })}
          newPassword
          styles={styles}
          c={c}
          t={t}
        />

        <Trouble trouble={pwTrouble} styles={styles} t={t} />

        <Pressable
          onPress={onChangePassword}
          disabled={pwBusy}
          accessibilityRole="button"
          style={[styles.small, styles.smallWide, pwBusy && styles.smallOff]}
        >
          <Text style={styles.smallText}>
            {pwBusy ? t.account.working : t.account.submitPassword}
          </Text>
        </Pressable>
      </View>

      <Pressable onPress={onSignOut} accessibilityRole="button" style={styles.signOut}>
        <Ionicons name="log-out-outline" size={18} color={c.danger} />
        <Text style={styles.signOutText}>{t.account.signOut}</Text>
      </Pressable>
    </>
  );
}

/** パスワードの欄。見せる・隠すを添える。 */
function PasswordField({
  value,
  onChange,
  reveal,
  onReveal,
  label,
  hint,
  newPassword = false,
  styles,
  c,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  onReveal: (v: boolean) => void;
  label: string;
  hint?: string;
  newPassword?: boolean;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: ReturnType<typeof useT>;
}) {
  return (
    <>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.labelHint}>{hint}</Text>}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          style={[styles.input, styles.inputFlex]}
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
          style={styles.reveal}
        >
          <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={c.textMuted} />
        </Pressable>
      </View>
    </>
  );
}

/** うまくいかなかった理由。欄のすぐ下に出す。 */
function Trouble({
  trouble,
  styles,
  t,
}: {
  trouble: Trouble | null;
  styles: ReturnType<typeof makeStyles>;
  t: ReturnType<typeof useT>;
}) {
  if (!trouble) return null;
  const text =
    trouble === 'short'
      ? fill(t.account.error.short, { n: PASSWORD_MIN })
      : t.account.error[trouble];
  return (
    <View style={styles.trouble} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={16} color={styles.troubleText.color as string} />
      <Text style={styles.troubleText}>{text}</Text>
    </View>
  );
}

function Submit({
  label,
  disabled,
  onPress,
  styles,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.submit, disabled && styles.submitOff]}
    >
      <Text style={styles.submitText}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
    },
    heading: { fontSize: TEXT.titleLarge, fontWeight: '800', color: c.text },
    /*
      入力の列は広げない。

      PC では帯の幅いっぱいに伸び、1本の欄が 1000px を超えていた。
      目が行き来する距離が長くなるだけで、打ちやすくはならない。
    */
    body: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      paddingHorizontal: SPACE.lg,
      paddingBottom: SPACE.xl,
      gap: SPACE.sm,
    },

    sectionTitle: { fontSize: TEXT.title, fontWeight: '800', color: c.text },
    lead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20 },
    leadStrong: { fontSize: TEXT.sub, color: c.accent, fontWeight: '700' },

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
    tabTextOn: { color: c.accent },

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
    link: { fontSize: TEXT.sub, fontWeight: '700', color: c.accent },

    card: {
      marginTop: SPACE.sm,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    cardRow: {
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      gap: 2,
    },
    cardLabel: { fontSize: TEXT.small, color: c.textMuted },
    cardValue: { fontSize: TEXT.bodyStrong, fontWeight: '700', color: c.text },
    cardValueWarn: { color: c.warn },

    /* 顔写真 */
    photoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.lg,
      marginTop: SPACE.sm,
    },
    photoSide: { flex: 1, gap: SPACE.xs },
    photoButtons: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
    hint: { fontSize: TEXT.small, color: c.textMuted },

    small: {
      height: 40,
      paddingHorizontal: SPACE.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accent,
    },
    smallWide: { alignSelf: 'stretch', marginTop: SPACE.sm, height: 46 },
    smallOff: { opacity: 0.5 },
    smallText: { fontSize: TEXT.body, fontWeight: '700', color: c.accent },
    smallGhost: {
      height: 40,
      paddingHorizontal: SPACE.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    smallGhostText: { fontSize: TEXT.body, fontWeight: '700', color: c.textMuted },

    /* 節。パスワードの変更など、まとまりを分ける。 */
    section: {
      marginTop: SPACE.xl,
      paddingTop: SPACE.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    planPanel: { marginTop: SPACE.md },

    nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
    nameInput: { flex: 1 },
    saveButton: {
      height: 48,
      paddingHorizontal: SPACE.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accent,
    },
    saveText: { fontSize: TEXT.body, fontWeight: '700', color: c.accent },

    signOut: {
      marginTop: SPACE.xl,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.xs,
      height: 48,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    signOutText: { fontSize: TEXT.body, fontWeight: '700', color: c.danger },
  });
}
