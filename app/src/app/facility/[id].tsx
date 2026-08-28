import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PhotoViewer } from '@/components/photo-viewer';
import { describeSchedule, splitByActive } from '@/lib/cautions';
import { fetchFacilityDetail } from '@/lib/facilities';
import { copyCoordinates, openNavigation } from '@/lib/nav';
import { photoUrl } from '@/lib/supabase';
import {
  ENTRY_POINT_KIND_LABEL,
  PHOTO_KIND_LABEL,
  type Caution,
  type EntryPoint,
  type FacilityDetail,
  type Photo,
} from '@/lib/types';
import { HIT, RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

export default function FacilityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [detail, setDetail] = useState<FacilityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchFacilityDetail(id)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setError('接続できませんでした。電波の状況をご確認ください。'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? '施設が見つかりませんでした。'}</Text>
      </View>
    );
  }

  const { facility, entryPoints, cautionsByEntryPoint, photosByEntryPoint } = detail;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {/* 見出しは expo-router の作法どおり画面内から指定する */}
      <Stack.Screen options={{ title: facility.name }} />

      <View style={styles.header}>
        <Text style={styles.name}>{facility.name}</Text>
        <Text style={styles.address}>
          {facility.prefecture}
          {facility.city ?? ''}
          {facility.address_line}
        </Text>
        {facility.summary && <Text style={styles.summary}>{facility.summary}</Text>}
      </View>

      {entryPoints.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>
            この施設の入口はまだ登録されていません。
          </Text>
        </View>
      ) : (
        entryPoints.map((ep) => (
          <EntryPointCard
            key={ep.id}
            facilityName={facility.name}
            entryPoint={ep}
            cautions={cautionsByEntryPoint[ep.id] ?? []}
            photos={photosByEntryPoint[ep.id] ?? []}
            styles={styles}
            c={c}
          />
        ))
      )}
    </ScrollView>
  );
}

/** 走行前に一目で確かめたい条件 */
interface Attribute {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}

function EntryPointCard({
  facilityName,
  entryPoint: ep,
  cautions,
  photos,
  styles,
  c,
}: {
  facilityName: string;
  entryPoint: EntryPoint;
  cautions: Caution[];
  photos: Photo[];
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  // 表示のたびに評価する。画面を開いたままの時間は短いため、
  // 分ごとの更新までは行わない。
  const { active, inactive } = useMemo(() => splitByActive(cautions), [cautions]);

  /*
    進入案内図は、他の写真と並べずに独立させる。

    案内図は「どの車線から入り、どこで曲がるか」を線で示したもので、
    現場写真とは役割が違う。横並びの中に紛れると、いちばん先に
    見るべきものが埋もれる。
  */
  const diagrams = useMemo(() => photos.filter((p) => p.kind === 'diagram'), [photos]);
  const shots = useMemo(() => photos.filter((p) => p.kind !== 'diagram'), [photos]);

  // 拡大表示。案内図と写真を1つの並びとして扱い、開いた位置を渡す。
  const viewable = useMemo(() => [...diagrams, ...shots], [diagrams, shots]);
  const [openAt, setOpenAt] = useState<number | null>(null);

  const hasNav = ep.nav_lat !== null && ep.nav_lng !== null;

  // 高さ制限・屋根・24時間は、走行前に一目で確かめたい条件。
  // 文字だけを並べるより、記号を添えたほうが視線が止まりやすい。
  const attributes = [
    ep.height_limit_cm !== null
      ? { icon: 'resize-outline', text: `高さ制限 ${ep.height_limit_cm}cm` }
      : null,
    ep.is_roofed !== null
      ? {
          icon: ep.is_roofed ? 'umbrella-outline' : 'rainy-outline',
          text: ep.is_roofed ? '屋根あり' : '屋根なし',
        }
      : null,
    ep.is_24h !== null
      ? {
          icon: ep.is_24h ? 'time-outline' : 'lock-closed-outline',
          text: ep.is_24h ? '24時間可' : '24時間不可',
        }
      : null,
  ].filter(Boolean) as Attribute[];

  async function onNavigate() {
    if (!hasNav) return;
    const used = await openNavigation({
      lat: ep.nav_lat!,
      lng: ep.nav_lng!,
      label: `${facilityName} ${ep.name}`,
    });
    if (used === 'web') {
      // ナビアプリが見つからなかったことは伝えたほうがよい。
      // 「思っていたのと違うものが開いた」と受け取られるため。
      Alert.alert(
        'ブラウザで開きました',
        'ナビアプリが見つかりませんでした。地図で経路をご確認ください。',
      );
    }
  }

  async function onCopy() {
    if (!hasNav) return;
    const text = await copyCoordinates({ lat: ep.nav_lat!, lng: ep.nav_lng! });
    Alert.alert('座標を複製しました', text);
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{ep.code}</Text>
        </View>
        <View style={styles.cardHeadText}>
          <Text style={styles.epName}>{ep.name}</Text>
          <Text style={styles.epKind}>{ENTRY_POINT_KIND_LABEL[ep.kind]}</Text>
        </View>
      </View>

      {/* いま該当する注意事項だけを、経路の説明より前に出す */}
      {active.map((caution) => (
        <View key={caution.id} style={styles.cautionActive}>
          <View style={styles.cautionActiveHead}>
            <Ionicons name="warning" size={15} color={c.danger} />
            <Text style={styles.cautionActiveLabel}>
              いま注意{describeSchedule(caution) ? `（${describeSchedule(caution)}）` : ''}
            </Text>
          </View>
          <Text style={styles.cautionActiveBody}>{caution.body}</Text>
        </View>
      ))}

      {hasNav ? (
        <Pressable
          onPress={onNavigate}
          onLongPress={onCopy}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel={`${ep.name}へナビを開始`}
          accessibilityHint="長押しで座標を複製します"
        >
          <View style={styles.navButtonRow}>
            <Ionicons name="navigate" size={22} color={c.accentText} />
            <Text style={styles.navButtonText}>ここへナビ開始</Text>
          </View>
          <Text style={styles.navButtonSub}>
            進入レーンの入口へ案内します（長押しで座標を複製）
          </Text>
        </Pressable>
      ) : (
        <View style={styles.navMissing}>
          <Text style={styles.navMissingText}>
            この入口はナビ用の座標が未登録です。下の説明をご確認ください。
          </Text>
        </View>
      )}

      {ep.approach_from && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>進入元</Text>
          <Text style={styles.fieldValue}>{ep.approach_from}</Text>
        </View>
      )}

      {ep.approach_text && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>進入方法</Text>
          <Text style={styles.approachText}>{ep.approach_text}</Text>
        </View>
      )}

      {attributes.length > 0 && (
        <View style={styles.attributes}>
          {attributes.map((a) => (
            <View key={a.text} style={styles.attribute}>
              <Ionicons name={a.icon} size={14} color={c.textMuted} />
              <Text style={styles.attributeText}>{a.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 進入案内図。叩くと画面いっぱいに開いて拡大できる。 */}
      {diagrams.map((p, i) => (
        <Pressable
          key={p.id}
          onPress={() => setOpenAt(i)}
          accessibilityRole="imagebutton"
          accessibilityLabel="進入案内図を拡大する"
          style={({ pressed }) => [styles.diagramWrap, pressed && styles.diagramPressed]}
        >
          <Image
            source={{ uri: photoUrl(p.storage_path) }}
            style={styles.diagram}
            // 図は切り取ると意味が変わる。全体を収める。
            contentFit="contain"
            transition={150}
            cachePolicy="disk"
          />
          <View style={styles.zoomHint}>
            <Ionicons name="expand-outline" size={14} color={c.accentText} />
            <Text style={styles.zoomHintText}>拡大</Text>
          </View>
          {p.is_placeholder && (
            <View style={styles.placeholderTag}>
              <Text style={styles.placeholderTagText}>仮画像</Text>
            </View>
          )}
        </Pressable>
      ))}

      {shots.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photos}
        >
          {shots.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => setOpenAt(diagrams.length + i)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${PHOTO_KIND_LABEL[p.kind]}の写真を拡大する`}
              style={styles.photoWrap}
            >
              <Image
                source={{ uri: photoUrl(p.storage_path) }}
                style={styles.photo}
                contentFit="cover"
                transition={150}
                // 既定値と同じだが明示しておく。同じ施設へ何度も向かうため、
                // 2回目以降は電波が弱くても表示できることが要件にあたる。
                cachePolicy="disk"
              />
              {p.caption && (
                <Text style={styles.photoCaption} numberOfLines={2}>
                  {p.caption}
                </Text>
              )}
              {p.is_placeholder && (
                <View style={styles.placeholderTag}>
                  <Text style={styles.placeholderTagText}>仮画像</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <PhotoViewer photos={viewable} index={openAt} onClose={() => setOpenAt(null)} />

      {/* いま関係のない注意事項は、読み飛ばせるよう最後に控えめに置く */}
      {inactive.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>そのほかの注意事項</Text>
          {inactive.map((caution) => (
            <Text key={caution.id} style={styles.cautionInactive}>
              {describeSchedule(caution) ? `${describeSchedule(caution)}｜` : ''}
              {caution.body}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
    errorText: { color: c.textMuted, fontSize: 15, paddingHorizontal: SPACE.xl, textAlign: 'center' },

    page: { padding: SPACE.lg, gap: SPACE.lg, backgroundColor: c.bg },

    header: { gap: SPACE.xs },
    name: { fontSize: 22, fontWeight: '800', color: c.text },
    address: { fontSize: 15, color: c.textMuted },
    summary: { fontSize: 15, color: c.textMuted, lineHeight: 22, marginTop: SPACE.xs },

    card: {
      backgroundColor: c.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACE.lg,
      gap: SPACE.md,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
    badge: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { fontSize: 20, fontWeight: '800', color: c.accentText },
    cardHeadText: { flex: 1 },
    epName: { fontSize: 18, fontWeight: '700', color: c.text },
    epKind: { fontSize: 13, color: c.textMuted },

    // 走行前に押される主要な操作。指の位置が定まらない車内でも
    // 確実に当たるよう、他より一段大きくしている。
    navButton: {
      minHeight: HIT.primary + 12,
      borderRadius: RADIUS.md,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACE.md,
      paddingHorizontal: SPACE.lg,
      gap: 2,
    },
    navButtonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
    navButtonText: { fontSize: 19, fontWeight: '800', color: c.accentText },
    navButtonSub: { fontSize: 12, color: c.accentText, opacity: 0.85 },

    navMissing: {
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
      padding: SPACE.md,
    },
    navMissingText: { fontSize: 14, color: c.textMuted, lineHeight: 20 },

    cautionActive: {
      borderRadius: RADIUS.md,
      backgroundColor: c.dangerSoft,
      borderLeftWidth: 4,
      borderLeftColor: c.danger,
      padding: SPACE.md,
      gap: 2,
    },
    cautionActiveHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    cautionActiveLabel: { fontSize: 12, fontWeight: '700', color: c.danger },
    cautionActiveBody: { fontSize: 16, color: c.text, lineHeight: 23 },
    cautionInactive: { fontSize: 14, color: c.textMuted, lineHeight: 21, marginTop: 2 },

    field: { gap: SPACE.xs },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: c.textFaint },
    fieldValue: { fontSize: 16, color: c.text },
    // 走行前に一度読んで頭に入れる文章。行間を広めに取る。
    approachText: { fontSize: 17, color: c.text, lineHeight: 27 },

    attributes: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
    attribute: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: SPACE.md,
      paddingVertical: 6,
    },
    attributeText: { fontSize: 13, color: c.textMuted },

    photos: { gap: SPACE.md, paddingVertical: SPACE.xs },
    // 進入案内図は横いっぱいに置く。図の細部を読ませるため、写真より大きく取る。
    diagramWrap: {
      marginTop: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
      overflow: 'hidden',
    },
    diagramPressed: { borderColor: c.accent },
    diagram: { width: '100%', aspectRatio: 4 / 3 },
    // 叩けば拡がることが分かるようにする。図だけでは操作できると気づけない。
    zoomHint: {
      position: 'absolute',
      right: SPACE.sm,
      bottom: SPACE.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.accent,
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACE.sm,
      paddingVertical: 3,
    },
    zoomHintText: { color: c.accentText, fontSize: 11, fontWeight: '700' },
    photoWrap: { width: 220, gap: SPACE.xs },
    photo: { width: 220, height: 150, borderRadius: RADIUS.md, backgroundColor: c.surface2 },
    photoCaption: { fontSize: 12, color: c.textMuted },
    placeholderTag: {
      position: 'absolute',
      top: SPACE.sm,
      left: SPACE.sm,
      backgroundColor: c.warnSoft,
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACE.sm,
      paddingVertical: 2,
    },
    placeholderTagText: { fontSize: 11, color: c.warn, fontWeight: '700' },

    emptyText: { fontSize: 15, color: c.textMuted },
  });
}
