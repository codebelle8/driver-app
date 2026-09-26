import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { signOut } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { confirmDelete } from '@/lib/confirm';
import { useT } from '@/lib/i18n/context';
import { notify } from '@/lib/notice';
import { HIT_SLOP, RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 上部の帯の右端に置く、顔写真とその品書き。
 *
 * **登録している方にだけ出す**
 *   登録していない方に空の丸を出すと、押せるのか、何が入るのかが
 *   分からない。入口はマイページの1行に集めてある。
 *
 * **鐘の右へ置く**
 *   ご指示による。知らせ（毎日見るもの）より外側に、身の回りの設定を置く。
 *
 * **品書きは重ねて出す**
 *   帯の中に置くと、親の枠に切られて下半分が消える。画面全体へ
 *   重ねたうえで、右上へ寄せる。外側を押せば閉じる。
 */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const router = useRouter();
  const { account } = useAccount();
  const [open, setOpen] = useState(false);

  if (!account) return null;

  const size = compact ? 30 : 34;

  const go = (to: '/account' | '/mypage') => {
    setOpen(false);
    router.push(to);
  };

  const leave = () => {
    setOpen(false);
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
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t.account.menuOpen}
        aria-expanded={open}
        style={s.hit}
      >
        <Avatar url={account.avatarUrl} name={account.displayName ?? account.email} size={size} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* 外側を押したら閉じる */}
        <Pressable
          style={s.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel={t.common.close}
        />
        <View style={s.card} accessibilityRole="menu">
          <View style={s.who}>
            <Avatar url={account.avatarUrl} name={account.displayName ?? account.email} size={40} />
            <View style={s.whoText}>
              {!!account.displayName && (
                <Text style={s.whoName} numberOfLines={1}>
                  {account.displayName}
                </Text>
              )}
              <Text style={s.whoMail} numberOfLines={1}>
                {account.email}
              </Text>
            </View>
          </View>

          <Row
            icon="person-outline"
            label={t.account.menuProfile}
            onPress={() => go('/account')}
            s={s}
            c={c}
          />
          <Row
            icon="settings-outline"
            label={t.account.menuSettings}
            onPress={() => go('/mypage')}
            s={s}
            c={c}
          />
          <Row
            icon="log-out-outline"
            label={t.account.signOut}
            onPress={leave}
            danger
            s={s}
            c={c}
          />
        </View>
      </Modal>
    </>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger = false,
  s,
  c,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  s: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="menuitem"
      style={[s.row, hovered && s.rowOn]}
    >
      <Ionicons name={icon} size={18} color={danger ? c.danger : c.textMuted} />
      <Text style={[s.rowText, danger && { color: c.danger }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    hit: { alignItems: 'center', justifyContent: 'center' },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    card: {
      position: 'absolute',
      top: 56,
      right: SPACE.md,
      minWidth: 232,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      boxShadow: '0 12px 28px rgba(0,0,0,0.22)',
    },
    who: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    whoText: { flex: 1 },
    whoName: { fontSize: TEXT.body, fontWeight: '700', color: c.text },
    whoMail: { fontSize: TEXT.small, color: c.textMuted },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      // 走行前の車内でも押せる高さ
      height: 46,
    },
    rowOn: { backgroundColor: c.surface2 },
    rowText: { fontSize: TEXT.body, fontWeight: '600', color: c.text },
  });
