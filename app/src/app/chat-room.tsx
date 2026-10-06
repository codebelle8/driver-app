import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { avatarUrlOf } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import {
  deleteMessage,
  loadFeed,
  MAX_MESSAGE,
  PAGE,
  postMessage,
  reportMessage,
  watchChat,
  type ChatFeed,
  type ChatMessage,
} from '@/lib/chat';
import { useChatUnread } from '@/lib/chat-unread';
import { usePresence } from '@/lib/presence';
import { confirmDelete } from '@/lib/confirm';
import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { notify } from '@/lib/notice';
import { HIT, RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 「情報交換」チャンネル（2026-10-05）。会員どうしの書き込み。
 *
 * **全員に見える掲示板の形。** 1対1のやりとりは無い。
 *
 * **上にルールを常に出す。** 個人が特定できる情報・人を傷つける書き込みは
 * しない、ルールに反するものは運営が非表示にする。書く前に目に入る位置に置く。
 *
 * **通報と削除は、長押しではなく小さな文字の釦で出す。** 長押しは、
 * 知らないと見つけられない（ブラウザでは右クリックの扱いにもなる）。
 *
 * **新しい書き込み**: Realtime の合図で読み直し、届かない環境のために
 * 開いているあいだは POLL_MS ごとにも読み直す。
 */

const POLL_MS = 20_000;

export default function ChatRoomScreen() {
  const c = useTheme();
  const t = useT();
  const styles = makeStyles(c);
  const router = useRouter();
  const { account } = useAccount();
  const { markRead } = useChatUnread();
  /* オンライン状態（2026-10-06）。いまアプリを開いている方の目印 */
  const { online } = usePresence();

  const [feed, setFeed] = useState<ChatFeed | null>(null);
  const [failed, setFailed] = useState(false);
  /** さかのぼって読んだ分（古い順に足していく） */
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const atBottom = useRef(true);

  const reload = useCallback(async () => {
    const f = await loadFeed('general');
    if (!f) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setFeed(f);
    setMore(f.messages.length >= PAGE);
    /*
      開いているあいだに読み込んだ分までを既読にする（2026-10-05）。
      時刻はサーバーの書き込みの時刻を使う（端末の時計はずれうる）。
    */
    const newest = f.messages[0]?.createdAt;
    if (newest) await markRead(newest);
  }, [markRead]);

  useFocusEffect(
    useCallback(() => {
      reload();
      const stop = watchChat(() => reload());
      const timer = setInterval(reload, POLL_MS);
      return () => {
        stop();
        clearInterval(timer);
      };
    }, [reload]),
  );

  /* 古い順に並べる（新しいものが下） */
  const latest = feed ? [...feed.messages].reverse() : [];
  const seen = new Set(latest.map((m) => m.id));
  const messages = [...older.filter((m) => !seen.has(m.id)), ...latest];
  const lastId = messages[messages.length - 1]?.id;

  /* 新しい書き込みが来たら下へ（読み返している途中なら動かさない） */
  useEffect(() => {
    if (atBottom.current) scroller.current?.scrollToEnd({ animated: false });
  }, [lastId]);

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    const f = await loadFeed('general', first.createdAt);
    if (!f) return;
    setOlder((list) => [...[...f.messages].reverse(), ...list]);
    setMore(f.messages.length >= PAGE);
  }

  async function onSend() {
    if (!account || sending || !draft.trim()) return;
    setSending(true);
    const r = await postMessage(account.userId, draft);
    setSending(false);
    if (r.ok) {
      setDraft('');
      atBottom.current = true;
      await reload();
    } else {
      notify(t.chatRoom.error[r.problem], undefined, 'error');
    }
  }

  function onDelete(m: ChatMessage) {
    confirmDelete({
      title: t.chatRoom.deleteTitle,
      message: m.body.slice(0, 80),
      yes: t.chatRoom.delete,
      onYes: async () => {
        const r = await deleteMessage(m.id);
        if (r.ok) {
          setOlder((list) => list.filter((x) => x.id !== m.id));
          await reload();
        } else notify(t.chatRoom.error[r.problem], undefined, 'error');
      },
    });
  }

  function onReport(m: ChatMessage) {
    if (!account) return;
    confirmDelete({
      title: t.chatRoom.reportTitle,
      message: t.chatRoom.reportBody,
      note: t.chatRoom.reportNote,
      yes: t.chatRoom.report,
      onYes: async () => {
        const r = await reportMessage(m.id, account.userId);
        if (r.ok || r.problem === 'already') notify(t.chatRoom.reported, t.chatRoom.reportedBody);
        else notify(t.chatRoom.error[r.problem], undefined, 'error');
      },
    });
  }

  const me = feed?.me;
  const when = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    return d.toDateString() === now.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/*
          上の帯・ルール・一覧・書く欄を、ひとつの PageWidth に入れる。
          PageWidth は flex: 1 を持つため、2つに分けると画面が割れ、
          一覧が狭くなって書く欄の下が空く（2026-10-05 に画面で確認）。
        */}
        <PageWidth>
          <View style={styles.head}>
            <IconButton icon="chevron-back" label={t.common.back} onPress={() => router.back()} />
            <Text style={styles.heading}>{t.chat.generalName}</Text>
            {online.size > 0 && (
              <View style={styles.onlineCount} testID="online-count">
                <View style={styles.onlineDotSmall} />
                <Text style={styles.onlineCountText}>{fill(t.chatRoom.onlineCount, { n: String(online.size) })}</Text>
              </View>
            )}
          </View>
          <View style={styles.rules}>
            <Ionicons name="shield-checkmark-outline" size={16} color={c.accent} />
            <Text style={styles.rulesText}>{t.chatRoom.rules}</Text>
          </View>

        {feed === null && !failed ? (
          <View style={styles.center}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : feed === null ? (
          <View style={styles.center}>
            <Text style={styles.muted}>{t.chatRoom.loadFailed}</Text>
            <Pressable onPress={reload} style={styles.retry} accessibilityRole="button">
              <Text style={styles.retryText}>{t.ranking.retry}</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            ref={scroller}
            style={styles.flex}
            contentContainerStyle={styles.list}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
            }}
            scrollEventThrottle={200}
            onContentSizeChange={() => {
              if (atBottom.current) scroller.current?.scrollToEnd({ animated: false });
            }}
          >
            {more && (
              <Pressable onPress={loadOlder} style={styles.older} accessibilityRole="button">
                <Text style={styles.olderText}>{t.chatRoom.older}</Text>
              </Pressable>
            )}
            {messages.length === 0 && <Text style={[styles.muted, styles.empty]}>{t.chatRoom.empty}</Text>}
            {messages.map((m) => (
              <View key={m.id} style={[styles.msg, m.mine && styles.msgMine]} testID="chat-message">
                {!m.mine && (
                  <View style={styles.avatarBox}>
                    {m.avatarPath ? (
                      <Image source={{ uri: avatarUrlOf(m.avatarPath) }} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, styles.avatarEmpty]}>
                        <Text style={styles.avatarText}>{(m.name ?? '？').slice(0, 1)}</Text>
                      </View>
                    )}
                    {/*
                      オンラインの印。色だけに頼らず、読み上げにも「オンライン」と伝える。
                      地の色の縁取りで、写真の上でも見分けられるようにする。
                    */}
                    {!!m.author && online.has(m.author) && (
                      <View
                        style={styles.onlineDot}
                        testID="online-dot"
                        accessibilityLabel={t.chatRoom.online}
                        accessible
                      />
                    )}
                  </View>
                )}
                <View style={[styles.msgBody, m.mine && styles.msgBodyMine]}>
                  <Text style={styles.meta}>
                    {m.mine ? t.ranking.you : (m.name ?? t.chatRoom.noName)}
                    {'　'}
                    {when(m.createdAt)}
                  </Text>
                  <View style={[styles.bubble, m.mine && styles.bubbleMine]}>
                    <Text style={styles.text} selectable>
                      {m.body}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => (m.mine ? onDelete(m) : onReport(m))}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={m.mine ? t.chatRoom.delete : t.chatRoom.report}
                  >
                    <Text style={styles.action}>{m.mine ? t.chatRoom.delete : t.chatRoom.report}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

          {/* 書く */}
          <View style={styles.composer}>
            {me && !me.canPost ? (
              <Text style={styles.cannot}>{me.blocked ? t.chatRoom.blocked : t.chatRoom.muted}</Text>
            ) : (
              <>
                {me && !me.hasName && <Text style={styles.nameHint}>{t.chatRoom.noNameHint}</Text>}
                <View style={styles.inputRow}>
                  <TextInput
                    value={draft}
                    onChangeText={(v) => setDraft(v.slice(0, MAX_MESSAGE))}
                    placeholder={t.chatRoom.placeholder}
                    placeholderTextColor={c.textFaint}
                    multiline
                    maxLength={MAX_MESSAGE}
                    style={styles.input}
                    accessibilityLabel={t.chatRoom.placeholder}
                  />
                  <Pressable
                    onPress={onSend}
                    disabled={!draft.trim() || sending || !feed}
                    style={[styles.send, (!draft.trim() || sending || !feed) && styles.sendOff]}
                    accessibilityRole="button"
                    accessibilityLabel={t.chatRoom.send}
                    accessibilityState={{ disabled: !draft.trim() || sending || !feed }}
                  >
                    <Ionicons name="send" size={18} color={c.accentText} />
                  </Pressable>
                </View>
                {draft.length > MAX_MESSAGE - 100 && (
                  <Text style={styles.count}>
                    {fill(t.submit.bodyCount, { n: String(draft.length), max: String(MAX_MESSAGE) })}
                  </Text>
                )}
              </>
            )}
          </View>
        </PageWidth>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
    },
    heading: { fontSize: TEXT.titleLarge, fontWeight: '800', color: c.text },
    rules: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.sm,
      marginHorizontal: SPACE.lg,
      marginBottom: SPACE.sm,
      padding: SPACE.sm,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
    },
    rulesText: { flex: 1, fontSize: TEXT.small, color: c.text, lineHeight: 18 },
    center: { flex: 1, padding: SPACE.xl, alignItems: 'center', gap: SPACE.md },
    muted: { fontSize: TEXT.sub, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    empty: { marginTop: SPACE.xl },
    retry: {
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.accent,
    },
    retryText: { fontSize: TEXT.body, fontWeight: '700', color: c.accentInk },

    list: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.sm,
      gap: SPACE.md,
    },
    older: { alignSelf: 'center', paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md },
    olderText: { fontSize: TEXT.sub, fontWeight: '700', color: c.accentInk },

    msg: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, maxWidth: '88%' },
    msgMine: { alignSelf: 'flex-end' },
    avatarBox: { width: 32, height: 32, marginTop: 16 },
    avatar: { width: 32, height: 32, borderRadius: 16 },
    onlineDot: {
      position: 'absolute',
      right: -1,
      bottom: -1,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#22c55e',
      borderWidth: 2,
      borderColor: c.bg,
    },
    onlineCount: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' },
    onlineDotSmall: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
    onlineCountText: { fontSize: TEXT.small, color: c.textMuted },
    avatarEmpty: { backgroundColor: c.border, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: TEXT.sub, fontWeight: '700', color: c.textMuted },
    msgBody: { flexShrink: 1, gap: 3, alignItems: 'flex-start' },
    msgBodyMine: { alignItems: 'flex-end' },
    meta: { fontSize: TEXT.small, color: c.textMuted },
    bubble: {
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.md,
      borderTopLeftRadius: 4,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    bubbleMine: {
      borderTopLeftRadius: RADIUS.md,
      borderTopRightRadius: 4,
      backgroundColor: c.accentSoft,
      borderColor: c.accent,
    },
    text: { fontSize: TEXT.body, color: c.text, lineHeight: 21 },
    action: { fontSize: TEXT.micro, color: c.textFaint, textDecorationLine: 'underline' },

    composer: {
      paddingHorizontal: SPACE.lg,
      paddingTop: SPACE.sm,
      paddingBottom: SPACE.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bg,
      gap: 4,
    },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm },
    input: {
      flex: 1,
      minHeight: HIT.min,
      maxHeight: 140,
      paddingHorizontal: SPACE.md,
      paddingVertical: 10,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      color: c.text,
      fontSize: TEXT.bodyStrong,
    },
    send: {
      width: HIT.min,
      height: HIT.min,
      borderRadius: HIT.min / 2,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendOff: { opacity: 0.45 },
    count: { alignSelf: 'flex-end', fontSize: TEXT.small, color: c.textMuted },
    nameHint: { fontSize: TEXT.small, color: c.textMuted },
    cannot: { fontSize: TEXT.sub, color: c.warn, textAlign: 'center', paddingVertical: SPACE.sm },
  });
}
