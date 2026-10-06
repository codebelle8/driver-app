import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthForm, PasswordField, TroubleLine, type Trouble } from '@/components/auth-form';
import { Avatar } from '@/components/avatar';
import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import {
  PASSWORD_MIN,
  changePassword,
  clearAvatar,
  deleteMyAccount,
  endsAt,
  freeShown,
  isExpired,
  remaining,
  signOut,
  signOutEverywhere,
  updateDisplayName,
  uploadAvatar,
} from '@/lib/account';
import { freeText } from '@/lib/free-text';
import { useAccount } from '@/lib/account-context';
import { canPickAvatar, pickAvatar } from '@/lib/avatar';
import { confirmDelete } from '@/lib/confirm';
import { useT } from '@/lib/i18n/context';
import { fill, formatDate, formatSpan } from '@/lib/i18n/dictionaries';
import { notify } from '@/lib/notice';
import { forgetRemembered } from '@/lib/remember';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * アカウント。お名前・顔写真・パスワードと、退会。
 *
 * **入力そのものは共通の部品に任せる**
 *   登録・ログイン・再設定は起動時の入口と同じものを使う
 *   （components/auth-form.tsx）。二か所に書くと片方だけ直る。
 *
 * **ブラウザの alert は使わない**
 *   失敗は欄のすぐ下に出す。うまくいったことは下の帯で伝える。
 *
 * **取り消せない操作は、下にまとめて置く**
 *   退会と、すべての端末からのログアウト。押し間違いを避けるため、
 *   お名前や写真を直す欄からは離す。
 */
export default function AccountScreen() {
  const c = useTheme();
  const t = useT();
  const router = useRouter();
  const styles = makeStyles(c);
  const { account, recovering } = useAccount();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <PageWidth>
        <View style={styles.head}>
          <IconButton icon="chevron-back" label={t.common.back} onPress={() => router.back()} />
          <Text style={styles.heading}>{t.account.title}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {account && !recovering ? <SignedIn styles={styles} c={c} t={t} /> : <AuthForm />}
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}

/** ログイン済みの内容。 */
function SignedIn({
  styles,
  c,
  t,
}: {
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: ReturnType<typeof useT>;
}) {
  const { account, refresh } = useAccount();
  const [name, setName] = useState(account?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  /* 顔写真 */
  const [photoBusy, setPhotoBusy] = useState(false);
  /*
    選んだが、まだ決めていない写真。

    選んだ時点で変えてしまうと、間違えて選んだときに元へ戻せない
    （前のものは消してある）。見てから決めていただく。
  */
  const [pending, setPending] = useState<{ blob: Blob; preview: string } | null>(null);

  /* パスワードの変更 */
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [reveal, setReveal] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwTrouble, setPwTrouble] = useState<Trouble | null>(null);

  if (!account) return null;

  /*
    見ている期間の終わり。**お支払い済みならその期間の終わり。**
    ご指示 2026-09-15。それまでは無料期間だけを見ていた。
  */
  const endIso = endsAt(account);
  const end = endIso ? new Date(endIso) : null;
  const over = isExpired(account);
  const paid = account.status === 'active';

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

  /** 見せていた仮の写真を捨てる。作った URL も返す。 */
  function dropPending() {
    setPending((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return null;
    });
  }

  async function onPickPhoto() {
    if (!account || photoBusy) return;

    const picked = await pickAvatar();
    // 閉じただけなら黙って戻る。読めなかったのなら伝える。
    if (!picked.ok) {
      if (picked.reason === 'unreadable') notify(t.account.avatarUnreadable, undefined, 'error');
      return;
    }

    // ここでは送らない。丸に映して、OK を押されてから送る。
    setPending((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return { blob: picked.blob, preview: URL.createObjectURL(picked.blob) };
    });
  }

  /** OK。ここで初めてサーバーへ送る。 */
  async function onApplyPhoto() {
    if (!account || !pending || photoBusy) return;

    setPhotoBusy(true);
    const r = await uploadAvatar(account.userId, pending.blob, account.avatarPath);
    setPhotoBusy(false);
    if (r.ok) {
      dropPending();
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

  function onSignOut() {
    confirmDelete({
      title: t.account.signOutConfirm,
      message: t.account.signOutBody,
      // 「元には戻せません。」は当てはまらない。空白1つで既定を打ち消す。
      note: ' ',
      yes: t.account.signOut,
      onYes: () => {
        void signOut().then((r) => {
          // 圏外では出ていかない（出ると、電波が戻るまで入り直せないため）
          if (r.ok) notify(t.account.signedOut);
          else notify(t.account.error[r.problem], undefined, 'error');
        });
      },
    });
  }

  function onSignOutAll() {
    confirmDelete({
      title: t.account.signOutAll,
      message: t.account.signOutAllBody,
      note: ' ',
      yes: t.account.signOutAll,
      onYes: () => {
        void signOutEverywhere().then(() => notify(t.account.signedOutAll));
      },
    });
  }

  function onLeave() {
    // 呼ばれる時点で必ずログイン済みだが、閉じ込めの中では型が緩む。
    const userId = account?.userId;
    if (!userId) return;

    confirmDelete({
      title: t.account.leaveConfirm,
      message: t.account.leaveBody,
      note: t.account.leaveNote,
      yes: t.account.leaveYes,
      onYes: () => {
        void deleteMyAccount(userId).then(async (r) => {
          if (!r.ok) return notify(t.account.error[r.problem], undefined, 'error');
          // 端末に控えたログインも消す。消えたアカウントでは、もう入れない。
          await forgetRemembered();
          notify(t.account.leaveDone);
        });
      },
    });
  }

  return (
    <>
      {/*
        顔写真。

        端末側（Expo Go・APK）では選べない。写真を選ぶ部品の追加と
        作り直しが要るため、まずブラウザで動く形にしている。
      */}
      <View style={styles.photoRow}>
        {/* 選んだ写真があれば、それを映す。まだ変わってはいない。 */}
        <Avatar
          url={pending?.preview ?? account.avatarUrl}
          name={account.displayName ?? account.email}
          size={72}
        />
        <View style={styles.photoSide}>
          <Text style={styles.label}>{t.account.avatar}</Text>

          {!canPickAvatar() ? (
            <Text style={styles.hint}>{t.account.avatarOnlyWeb}</Text>
          ) : pending ? (
            <>
              <Text style={styles.hint}>{t.account.avatarPending}</Text>
              <View style={styles.photoButtons}>
                <Pressable
                  onPress={onApplyPhoto}
                  disabled={photoBusy}
                  accessibilityRole="button"
                  style={[styles.small, photoBusy && styles.smallOff]}
                >
                  <Text style={styles.smallText}>
                    {photoBusy ? t.account.working : t.account.avatarApply}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={dropPending}
                  disabled={photoBusy}
                  accessibilityRole="button"
                  style={styles.smallGhost}
                >
                  <Text style={styles.smallGhostText}>{t.common.stop}</Text>
                </Pressable>
              </View>
            </>
          ) : (
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
            {account.status === 'blocked'
              ? t.account.statusBlocked
              : freeShown(account)
                ? freeText(t.account.statusFree, account, t)
              : /* 期限を持たない方（この欄を設ける前からの方）は日付を出さない */
                !end
                ? t.account.statusPaid
                : over
                  ? fill(paid ? t.account.paidEnded : t.account.trialEnded, {
                      date: formatDate(t, end),
                    })
                  : fill(paid ? t.account.paidLeft : t.account.trialLeft, {
                      left: formatSpan(t, remaining(account)),
                      date: formatDate(t, end),
                    })}
          </Text>
        </View>
      </View>

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
        />

        <TroubleLine trouble={pwTrouble} />

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

      <Pressable
        onPress={onSignOut}
        accessibilityRole="button"
        /* 記号の字が読み上げ名に混ざるため、名前を明示する。 */
        accessibilityLabel={t.account.signOut}
        style={styles.signOut}
      >
        <Ionicons name="log-out-outline" size={18} color={c.danger} />
        <Text style={styles.signOutText}>{t.account.signOut}</Text>
      </Pressable>

      {/*
        取り消せない操作。

        押し間違いを避けるため、お名前や写真を直す欄からは離して置く。
      */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.account.danger}</Text>

        <Pressable
          onPress={onSignOutAll}
          accessibilityRole="button"
          accessibilityLabel={t.account.signOutAll}
          style={styles.dangerRow}
        >
          <Ionicons name="phone-portrait-outline" size={18} color={c.textMuted} />
          <View style={styles.dangerBody}>
            <Text style={styles.dangerName}>{t.account.signOutAll}</Text>
            <Text style={styles.hint}>{t.account.signOutAllBody}</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          accessibilityLabel={t.account.leave}
          style={styles.dangerRow}
        >
          <Ionicons name="trash-outline" size={18} color={c.danger} />
          <View style={styles.dangerBody}>
            <Text style={[styles.dangerName, { color: c.danger }]}>{t.account.leave}</Text>
            <Text style={styles.hint}>{t.account.leaveBody}</Text>
          </View>
        </Pressable>
      </View>
    </>
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

    label: { fontSize: TEXT.sub, fontWeight: '700', color: c.text, marginTop: SPACE.sm },
    hint: { fontSize: TEXT.small, color: c.textMuted, lineHeight: 17 },
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

    /* 顔写真 */
    photoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.lg,
      marginTop: SPACE.sm,
    },
    photoSide: { flex: 1, gap: SPACE.xs },
    photoButtons: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },

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
    smallText: { fontSize: TEXT.body, fontWeight: '700', color: c.accentInk },
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
    sectionTitle: { fontSize: TEXT.title, fontWeight: '800', color: c.text },

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
    saveText: { fontSize: TEXT.body, fontWeight: '700', color: c.accentInk },

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

    dangerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.sm,
      marginTop: SPACE.md,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    dangerBody: { flex: 1, gap: 2 },
    dangerName: { fontSize: TEXT.body, fontWeight: '700', color: c.text },
  });
}
