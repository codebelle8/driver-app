import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  PASSWORD_MIN,
  sendReset,
  signIn,
  signUp,
  updatePassword,
  type Problem,
} from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { notify } from '@/lib/notice';
import { loadRemembered, remember } from '@/lib/remember';
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
 */

type Mode = 'in' | 'up' | 'reset';

/** 欄のすぐ下に出す言い分。Problem に、こちらで見つけるぶんを足す。 */
export type Trouble = Problem | 'empty' | 'emptyEmail' | 'short';

export function AuthForm({ onDone }: { onDone?: () => void }) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const { ready, recovering, doneRecovering } = useAccount();

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

  const clear = () => {
    setTrouble(null);
    setSentTo(null);
  };

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
        await remember(email, password, keep);
        setConfirm('');
        if (r.value.needsConfirm) {
          setSentTo(email.trim());
          notify(t.account.confirmTitle, t.account.resetSentBody);
        } else {
          notify(t.account.welcome);
          onDone?.();
        }
        return;
      }

      const r = await signIn(email, password);
      if (!r.ok) return setTrouble(r.problem);
      await remember(email, password, keep);
      notify(t.account.signedIn);
      onDone?.();
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
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      {mode === 'reset' ? (
        <>
          <Text style={s.sectionTitle}>{t.account.resetTitle}</Text>
          <Text style={s.lead}>{t.account.resetLead}</Text>
        </>
      ) : (
        <>
          <Text style={s.lead}>{t.account.lead}</Text>
          <Text style={s.leadStrong}>{t.account.leadTrial}</Text>

          {/* ログインと新規登録の切り替え。枠は同じまま中身だけ変える。 */}
          <View style={s.tabs}>
            {(['in', 'up'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  setMode(m);
                  clear();
                }}
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
        </>
      )}

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
      />

      {mode !== 'reset' && (
        <>
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
            <View style={s.checkBody}>
              <Text style={s.checkText}>{t.account.remember}</Text>
              <Text style={s.checkHint}>{t.account.rememberHint}</Text>
            </View>
          </Pressable>
        </>
      )}

      <TroubleLine trouble={trouble} />

      {/* 送った後の案内。押す先が無いので、帯ではなく画面に残す。 */}
      {sentTo && (
        <View style={s.sent}>
          <Ionicons name="mail-outline" size={18} color={c.accent} />
          <Text style={s.sentText}>
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
      />

      <Pressable
        onPress={() => {
          setMode(mode === 'reset' ? 'in' : 'reset');
          clear();
        }}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        style={s.linkRow}
      >
        <Text style={s.link}>{mode === 'reset' ? t.common.back : t.account.forgot}</Text>
      </Pressable>
    </View>
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
    checkHint: { fontSize: TEXT.small, color: c.textMuted, lineHeight: 17 },

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
  });
