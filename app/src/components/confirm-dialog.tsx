import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { attachConfirmHost, type ConfirmRequest } from '@/lib/confirm';
import { HIT, RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 消してよいかを尋ねる札。
 *
 * **ブラウザの confirm を置き換えるもの**
 *   以前は window.confirm を使っていた。出てくるのはブラウザが作る枠で、
 *   アプリの配色にも書体にも従わない。暗い配色で夜間に使っている最中に
 *   白い枠が出るのは、この用途では具合が悪い。並び順も決められず、
 *   「はい」がどちら側に出るかが環境ごとに変わる。
 *
 * **消す側を右に置き、色を分ける**
 *   日本語の画面では「決める」側を右に置くのが通例。取り消せない側だけ
 *   danger の色を当て、やめる側は縁だけにする。色を見分けにくい方にも
 *   下地の有無で違いが伝わる。
 *
 * **後ろを押したらやめる扱いにする**
 *   迷ったときに逃げ道が要る。取り消せない操作なので、
 *   曖昧なまま押した先が「消す」になってはいけない。
 *
 * **画面の外に一つだけ置く**
 *   一覧の行・見出し・画面の外と、呼ぶ場所が散らばる。
 *   そのたびに状態を持たせると同じ組み立てが増えるので、
 *   根に一つ置いて lib/confirm.ts から呼んでもらう。
 */
export function ConfirmHost() {
  const c = useTheme();
  const s = makeStyles(c);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => attachConfirmHost(setRequest), []);

  /*
    Esc で閉じる。

    キーボードで操作する方にとって、閉じる手立てが画面上の
    ボタンだけなのは行き止まりに近い。Modal の onRequestClose は
    Android の戻る操作しか拾わないため、web はここで拾う。
  */
  useEffect(() => {
    if (Platform.OS !== 'web' || !request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRequest(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request]);

  if (!request) return null;

  const close = () => setRequest(null);
  const accept = () => {
    close();
    request.onYes();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={close}
      // 読み上げに、後ろの画面ではなくこちらを読ませる
      accessibilityViewIsModal
    >
      {/* 後ろを暗くする層。押したらやめる。 */}
      <Pressable
        style={s.backdrop}
        onPress={close}
        accessibilityLabel="閉じる"
        testID="confirm-backdrop"
      >
        {/*
          札そのものは押しても閉じない。
          後ろの層の中にあるため、止めておかないと本文を選ぼうとした
          指の動きで閉じてしまう。
        */}
        <Pressable style={s.card} onPress={() => {}} testID="confirm-dialog">
          <Text style={s.title} accessibilityRole="header">
            {request.title}
          </Text>
          <Text style={s.message}>{request.message}</Text>
          {/*
            取り消せないことは行を分けて置く。
            本文に続けて書くと、折り返しが語の途中に落ちて読みにくい。
            色も分けて、読み飛ばしにくくする。
          */}
          <Text style={s.note}>{request.note}</Text>

          <View style={s.actions}>
            {/*
              testID を振ってあるのは検査のため。「やめる」は一覧の
              見出しにも同じ文言があり、名前だけでは選び分けられない。
            */}
            <DialogButton label="やめる" onPress={close} testID="confirm-cancel" />
            <DialogButton label={request.yes} onPress={accept} danger testID="confirm-accept" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * 札の中のボタン。
 *
 * IconButton と同じ考え方で、乗せたら淡く、押したら濃くする。
 * マウスで使う画面では、押せることが見た目でしか分からない。
 */
function DialogButton({
  label,
  onPress,
  danger = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  /** 取り消せない側 */
  danger?: boolean;
  testID?: string;
}) {
  const c = useTheme();
  const s = makeStyles(c);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const web =
    Platform.OS === 'web'
      ? {
          onHoverIn: () => setHovered(true),
          onHoverOut: () => setHovered(false),
        }
      : {};

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      {...web}
      style={[
        s.button,
        danger ? s.buttonDanger : s.buttonQuiet,
        (hovered || pressed) && (danger ? s.buttonDangerOn : s.buttonQuietOn),
        pressed && s.buttonPressed,
      ]}
    >
      <Text style={[s.buttonLabel, danger ? s.buttonLabelDanger : s.buttonLabelQuiet]}>
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACE.xl,
      // 後ろの画面が透けて見える程度に留める。何の上で尋ねられて
      // いるのかが分からなくなると、判断の材料が減る。
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    card: {
      width: '100%',
      // 文が横に長く伸びると読み返しにくい。読み幅で止める。
      maxWidth: 420,
      backgroundColor: c.surface,
      borderRadius: RADIUS.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: SPACE.xl,
      gap: SPACE.md,
      // 地色に近い札なので、浮いていることを影で示す
      boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
    },
    message: {
      fontSize: 15,
      lineHeight: 22,
      color: c.text,
    },
    note: {
      fontSize: 13,
      lineHeight: 20,
      color: c.danger,
      marginTop: -SPACE.xs,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: SPACE.md,
      marginTop: SPACE.sm,
    },
    button: {
      minHeight: HIT.min,
      minWidth: 104,
      paddingHorizontal: SPACE.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.md,
      borderWidth: 1,
    },
    buttonQuiet: {
      backgroundColor: 'transparent',
      borderColor: c.borderStrong,
    },
    buttonQuietOn: {
      backgroundColor: c.surface2,
    },
    buttonDanger: {
      backgroundColor: c.danger,
      borderColor: c.danger,
    },
    buttonDangerOn: {
      // 濃い地の上なので、暗くするより薄い膜を重ねるほうが分かる
      opacity: 0.88,
    },
    buttonPressed: {
      transform: [{ scale: 0.98 }],
    },
    buttonLabel: {
      fontSize: 15,
      fontWeight: '600',
    },
    buttonLabelQuiet: { color: c.text },
    // 白固定にしていたところ、暗い配色では地の赤が明るく、
    // 白い文字との差が 3:1 まで落ちていた。配色ごとに持たせる。
    buttonLabelDanger: { color: c.dangerText },
  });
}
