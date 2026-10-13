import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { useAccount } from '@/lib/account-context';
import { fetchFacilityDetail } from '@/lib/facilities';
import { useLocale, useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { entryPointName, facilityName } from '@/lib/localized';
import { notify } from '@/lib/notice';
import { currentCoords } from '@/lib/place';
import {
  canAttachPhotos,
  MAX_BODY,
  MAX_PHOTOS,
  pickPhoto,
  sendSubmission,
  SUBMISSION_KINDS,
  type SubmissionKind,
} from '@/lib/submissions';
import { ensureSynced } from '@/lib/sync';
import { useVoiceFont, VOICE_FONT } from '@/lib/voice-font';
import type { EntryPoint } from '@/lib/types';
import { HIT, RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 情報を送る（2026-10-05）。
 *
 * 施設の画面の「現地と違うところがあれば、情報を送る」から開く。
 * どの施設か（facility）と、そのとき選んでいた入口（entry）を受け取る。
 *
 * **先に種類を選んでいただく**
 *   「何についての情報か」が分かれば、管理画面で振り分けやすい。
 *   文だけだと、読むまで何の話か分からない。
 *
 * **入口は、2つ以上ある施設でだけ尋ねる**
 *   1つなら尋ねる意味がない。施設の画面で選んでいた入口を初めから選んでおく。
 *
 * **位置は、本人が選んだときだけ**
 *   初めは切ってある。入れた時点で測り、取れたかどうかをその場で出す。
 *   送るときになって測ると、取れなかったことに気づけない。
 */

/** 写真の下書き。画面に出すための一時的な URL を持つ */
interface Draft {
  blob: Blob;
  url: string;
}

type Where = 'off' | 'finding' | 'found' | 'failed';

export default function SubmitScreen() {
  const { facility: facilityId, entry } = useLocalSearchParams<{ facility: string; entry?: string }>();
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  /* 「あなたの声が、アプリを進化させる。」の手書き風の書体（2026-10-13） */
  const voiceFont = useVoiceFont();
  const { locale } = useLocale();
  const styles = makeStyles(c);
  const { account } = useAccount();

  const [name, setName] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryPoint[]>([]);
  const [kind, setKind] = useState<SubmissionKind | null>(null);
  const [entryId, setEntryId] = useState<string | null>(entry ? String(entry) : null);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<Draft[]>([]);
  const [where, setWhere] = useState<Where>('off');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* 画面を閉じたら、写真の一時的な URL を片付ける */
  const drafts = useRef<Draft[]>([]);
  useEffect(() => {
    drafts.current = photos;
  }, [photos]);
  useEffect(
    () => () => {
      for (const d of drafts.current) URL.revokeObjectURL(d.url);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      await ensureSynced().catch(() => undefined);
      const found = facilityId ? await fetchFacilityDetail(String(facilityId)).catch(() => null) : null;
      if (!alive || !found) return;
      setName(facilityName(found.facility, locale));
      const active = found.entryPoints.filter((e) => e.is_active !== false);
      setEntries(active);
      /* 入口が1つなら、その入口についての情報として送る */
      if (active.length === 1) setEntryId(active[0].id);
    })();
    return () => {
      alive = false;
    };
  }, [facilityId, locale]);

  async function onAddPhoto() {
    if (photos.length >= MAX_PHOTOS) return;
    const r = await pickPhoto();
    if (r.ok) {
      setPhotos((list) => [...list, { blob: r.blob, url: URL.createObjectURL(r.blob) }]);
    } else if (r.reason === 'unreadable') {
      notify(t.submit.photoUnreadable, undefined, 'error');
    }
  }

  function onRemovePhoto(i: number) {
    setPhotos((list) => {
      const gone = list[i];
      if (gone) URL.revokeObjectURL(gone.url);
      return list.filter((_, k) => k !== i);
    });
  }

  async function onToggleWhere() {
    if (where !== 'off') {
      setWhere('off');
      setCoords(null);
      return;
    }
    setWhere('finding');
    const at = await currentCoords();
    setCoords(at);
    setWhere(at ? 'found' : 'failed');
  }

  const trimmed = body.trim();
  const ready = !!account && !!facilityId && !!kind && trimmed.length > 0 && !sending;

  async function onSend() {
    if (!account || !facilityId || !kind) return;
    if (!trimmed) {
      setError(t.submit.needBody);
      return;
    }
    setSending(true);
    setError(null);
    const r = await sendSubmission(account.userId, {
      facilityId: String(facilityId),
      entryPointId: entryId,
      kind,
      body: trimmed,
      photos: photos.map((p) => p.blob),
      coords: where === 'found' ? coords : null,
    });
    setSending(false);
    if (r.ok) {
      notify(t.submit.sent, t.submit.sentBody);
      router.back();
    } else {
      setError(t.submit.error[r.problem]);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <PageWidth>
        <View style={styles.head}>
          <IconButton icon="chevron-back" label={t.common.back} onPress={() => router.back()} />
          <Text style={styles.heading}>{t.submit.title}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!!name && <Text style={styles.facility}>{name}</Text>}
          {/* ご要望（2026-10-13）。手書き風の書体で、送る方への一言として */}
          <Text style={[styles.voice, voiceFont && { fontFamily: VOICE_FONT }]} testID="submit-voice">
            {t.brand.voice}
          </Text>
          <Text style={styles.lead}>{t.submit.lead}</Text>

          {/* 種類 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.submit.kindTitle}</Text>
            <View style={styles.choices} accessibilityRole="radiogroup">
              {SUBMISSION_KINDS.map((k) => {
                const on = kind === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setKind(k)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    accessibilityLabel={t.submit.kinds[k]}
                    style={[styles.choice, on && styles.choiceOn]}
                  >
                    <Ionicons
                      name={on ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={on ? c.accent : c.textFaint}
                    />
                    <Text style={styles.choiceText}>{t.submit.kinds[k]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 入口（2つ以上あるときだけ） */}
          {entries.length >= 2 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.submit.entryTitle}</Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {[...entries.map((e) => ({ id: e.id as string | null, label: `${e.code}  ${entryPointName(e, locale)}` })),
                  { id: null, label: t.submit.entryAny }].map((o) => {
                  const on = entryId === o.id;
                  return (
                    <Pressable
                      key={o.id ?? 'any'}
                      onPress={() => setEntryId(o.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      aria-checked={on}
                      accessibilityLabel={o.label}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* 内容 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.submit.bodyTitle}</Text>
            <TextInput
              value={body}
              onChangeText={(v) => {
                setBody(v.slice(0, MAX_BODY));
                if (error) setError(null);
              }}
              placeholder={t.submit.bodyPlaceholder}
              placeholderTextColor={c.textFaint}
              multiline
              maxLength={MAX_BODY}
              style={styles.input}
              accessibilityLabel={t.submit.bodyTitle}
            />
            <Text style={styles.count}>
              {fill(t.submit.bodyCount, { n: String(body.length), max: String(MAX_BODY) })}
            </Text>
          </View>

          {/* 写真（ブラウザだけ） */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{fill(t.submit.photoTitle, { max: String(MAX_PHOTOS) })}</Text>
            {canAttachPhotos() ? (
              <View style={styles.photos}>
                {photos.map((p, i) => (
                  <View key={p.url} style={styles.thumb}>
                    <Image source={{ uri: p.url }} style={styles.thumbImg} contentFit="cover" />
                    <Pressable
                      onPress={() => onRemovePhoto(i)}
                      style={styles.thumbRemove}
                      accessibilityRole="button"
                      accessibilityLabel={fill(t.submit.photoRemove, { n: String(i + 1) })}
                    >
                      <Ionicons name="close" size={16} color="#ffffff" />
                    </Pressable>
                  </View>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <Pressable
                    onPress={onAddPhoto}
                    style={({ hovered }) => [styles.addPhoto, hovered && styles.addPhotoHover]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="camera-outline" size={22} color={c.accent} />
                    <Text style={styles.addPhotoText}>{t.submit.photoAdd}</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Text style={styles.note}>{t.submit.photoNative}</Text>
            )}
          </View>

          {/* いまいる場所を添える */}
          <Pressable
            onPress={onToggleWhere}
            disabled={where === 'finding'}
            style={[styles.toggle, where !== 'off' && styles.toggleOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: where !== 'off' }}
            aria-checked={where !== 'off'}
            accessibilityLabel={t.submit.whereTitle}
          >
            <Ionicons
              name={where === 'off' ? 'location-outline' : 'location'}
              size={20}
              color={c.accent}
            />
            <View style={styles.toggleBody}>
              <Text style={styles.toggleTitle}>{t.submit.whereTitle}</Text>
              <Text style={[styles.note, where === 'failed' && styles.warn]}>
                {where === 'finding'
                  ? t.submit.whereFinding
                  : where === 'found'
                    ? t.submit.whereFound
                    : where === 'failed'
                      ? t.submit.whereFailed
                      : t.submit.whereNote}
              </Text>
            </View>
            <Ionicons
              name={where === 'off' ? 'square-outline' : 'checkbox'}
              size={22}
              color={where === 'off' ? c.textFaint : c.accent}
            />
          </Pressable>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={onSend}
            disabled={!ready}
            style={({ pressed }) => [styles.send, pressed && styles.sendPressed, !ready && styles.sendOff]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
          >
            <Text style={styles.sendText}>{sending ? t.submit.sending : t.submit.send}</Text>
          </Pressable>
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
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
    body: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      paddingHorizontal: SPACE.lg,
      paddingBottom: SPACE.xl,
      gap: SPACE.lg,
    },
    facility: { fontSize: TEXT.title, fontWeight: '800', color: c.text },
    voice: { fontSize: 21, lineHeight: 32, letterSpacing: 0.5, color: c.accentInk },
    lead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20, marginTop: -SPACE.sm },

    section: { gap: SPACE.sm },
    sectionTitle: { fontSize: TEXT.bodyStrong, fontWeight: '800', color: c.text },
    note: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 19 },
    warn: { color: c.warn },

    choices: { gap: SPACE.xs },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      minHeight: HIT.min,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    choiceOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    choiceText: { flex: 1, fontSize: TEXT.body, color: c.text },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
    chip: {
      minHeight: HIT.min,
      justifyContent: 'center',
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    chipText: { fontSize: TEXT.body, color: c.text },
    chipTextOn: { fontWeight: '700' },

    input: {
      minHeight: 120,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      color: c.text,
      fontSize: TEXT.bodyStrong,
      lineHeight: 22,
      textAlignVertical: 'top',
    },
    count: { alignSelf: 'flex-end', fontSize: TEXT.small, color: c.textMuted },

    photos: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
    thumb: {
      width: 96,
      height: 96,
      borderRadius: RADIUS.sm,
      overflow: 'hidden',
      backgroundColor: c.surface,
    },
    thumbImg: { width: '100%', height: '100%' },
    thumbRemove: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPhoto: {
      width: 96,
      height: 96,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: SPACE.xs,
    },
    addPhotoHover: { backgroundColor: c.accentSoft },
    addPhotoText: { fontSize: TEXT.small, fontWeight: '700', color: c.accentInk, textAlign: 'center' },

    toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    toggleOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    toggleBody: { flex: 1, gap: 2 },
    toggleTitle: { fontSize: TEXT.body, fontWeight: '700', color: c.text },

    error: { fontSize: TEXT.sub, color: c.danger, lineHeight: 20 },

    send: {
      minHeight: HIT.primary,
      borderRadius: RADIUS.md,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACE.lg,
    },
    sendPressed: { opacity: 0.85 },
    sendOff: { opacity: 0.5 },
    sendText: { fontSize: TEXT.bodyStrong, fontWeight: '700', color: c.accentText },
  });
}
