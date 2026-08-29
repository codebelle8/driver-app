import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { HIT_SLOP, RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 施設の詳細。
 *
 * 画面の並びは「地図 → 名前と住所 → 操作 → 中身」。
 * 到着直前に開く画面なので、どこへ着けるかを最初に見せ、
 * ナビの開始を指の届く位置に置く。
 *
 * 下の切り替え（概要・写真・案内図・注意）は、1画面に全部を積むと
 * 縦に長くなりすぎるため。走行前に見る場所を選べるようにする。
 */

type Section = 'summary' | 'photos' | 'diagram' | 'cautions';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'summary', label: '概要', icon: 'business-outline' },
  { key: 'photos', label: '写真', icon: 'images-outline' },
  { key: 'diagram', label: '案内図', icon: 'map-outline' },
  { key: 'cautions', label: '注意', icon: 'alert-circle-outline' },
];

export default function FacilityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useTheme();
  const styles = makeStyles(c);

  const [detail, setDetail] = useState<FacilityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('summary');
  const [openAt, setOpenAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const found = await fetchFacilityDetail(id);
        if (alive) setDetail(found);
      } catch {
        if (alive) setError('施設を読み込めませんでした。');
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const all = useMemo(() => {
    if (!detail) return { photos: [] as Photo[], diagrams: [] as Photo[], cautions: [] as Caution[] };
    const photos: Photo[] = [];
    const diagrams: Photo[] = [];
    const cautions: Caution[] = [];
    for (const ep of detail.entryPoints) {
      for (const p of detail.photosByEntryPoint[ep.id] ?? []) {
        (p.kind === 'diagram' ? diagrams : photos).push(p);
      }
      cautions.push(...(detail.cautionsByEntryPoint[ep.id] ?? []));
    }
    return { photos, diagrams, cautions };
  }, [detail]);

  /** 拡大表示は案内図と写真を1つの並びとして扱う */
  const viewable = useMemo(() => [...all.diagrams, ...all.photos], [all]);

  if (error || (detail === null && !error)) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <ActivityIndicator color={c.accent} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { facility, entryPoints } = detail!;
  const main = entryPoints[0];
  const hasNav = main && main.nav_lat !== null && main.nav_lng !== null;

  async function onNavigate() {
    if (!main || !hasNav) return;
    const used = await openNavigation({ lat: main.nav_lat!, lng: main.nav_lng! });
    if (!used) Alert.alert('地図アプリを開けませんでした');
  }

  async function onCopy() {
    if (!main || !hasNav) return;
    const text = await copyCoordinates({ lat: main.nav_lat!, lng: main.nav_lng! });
    Alert.alert('座標を複製しました', text);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 上部 */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={HIT_SLOP} accessibilityLabel="戻る">
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </Pressable>
        <Text style={styles.topTitle}>車寄せ案内</Text>
        <View style={styles.topRight}>
          <Pressable onPress={onCopy} hitSlop={HIT_SLOP} accessibilityLabel="座標を複製">
            <Ionicons name="share-outline" size={20} color={c.text} />
          </Pressable>
          <Pressable hitSlop={HIT_SLOP} accessibilityLabel="お気に入り">
            <Ionicons name="heart-outline" size={20} color={c.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        {/*
          地図の場所。
          地図そのものは、利用登録が済んでから入れる。
          それまでは「ここに何が入るか」が分かる形で場所を確保しておく。
        */}
        <View style={styles.map}>
          <View style={styles.mapPin}>
            <Ionicons name="location" size={30} color={c.accent} />
          </View>
          <Text style={styles.mapName}>{facility.name}</Text>
          <Text style={styles.mapSub}>
            {main ? ENTRY_POINT_KIND_LABEL[main.kind] : '入口の登録なし'}
          </Text>
          <View style={styles.mapNote}>
            <Text style={styles.mapNoteText}>地図は準備中です</Text>
          </View>
          <Pressable style={styles.mapLocate} hitSlop={HIT_SLOP} accessibilityLabel="現在地">
            <Ionicons name="locate" size={17} color={c.text} />
          </Pressable>
        </View>

        {/* 名前・住所 */}
        <View style={styles.headBlock}>
          <View style={styles.grip} />
          <Text style={styles.name}>{facility.name}</Text>
          {main && (
            <View style={styles.kindRow}>
              <Ionicons name="car-outline" size={13} color={c.textMuted} />
              <Text style={styles.kindText}>{ENTRY_POINT_KIND_LABEL[main.kind]}</Text>
            </View>
          )}
          <Text style={styles.address}>
            {facility.prefecture}
            {facility.city ?? ''}
            {facility.address_line}
          </Text>

          {/* 操作 */}
          <View style={styles.actions}>
            <Pressable
              onPress={onNavigate}
              disabled={!hasNav}
              style={({ pressed }) => [
                styles.action,
                styles.actionMain,
                pressed && styles.actionPressed,
                !hasNav && styles.actionOff,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="navigate" size={15} color={c.accentText} />
              <Text style={styles.actionMainText}>経路</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              accessibilityRole="button"
            >
              <Ionicons name="star-outline" size={15} color={c.accent} />
              <Text style={styles.actionText}>保存</Text>
            </Pressable>
            <Pressable
              onPress={onCopy}
              disabled={!hasNav}
              style={({ pressed }) => [
                styles.action,
                pressed && styles.actionPressed,
                !hasNav && styles.actionOff,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="share-social-outline" size={15} color={c.accent} />
              <Text style={styles.actionText}>共有</Text>
            </Pressable>
          </View>
        </View>


        <View style={styles.body}>
          {section === 'summary' && (
            <SummaryBlock entryPoints={entryPoints} styles={styles} c={c} />
          )}
          {section === 'photos' && (
            <PhotoGrid
              photos={all.photos}
              offset={all.diagrams.length}
              onOpen={setOpenAt}
              styles={styles}
            />
          )}
          {section === 'diagram' && (
            <PhotoGrid photos={all.diagrams} offset={0} onOpen={setOpenAt} styles={styles} large />
          )}
          {section === 'cautions' && <CautionBlock cautions={all.cautions} styles={styles} />}
        </View>
      </ScrollView>

      {/*
        切り替えは画面の下へ固定する。

        中身の上に置くと、写真や案内図を送ったあとに切り替えたくなった際、
        いちど上まで戻す必要がある。探す画面の下部タブと同じ位置にすることで、
        どの画面でも指の届く場所が変わらない。
      */}
      <View style={styles.tabs}>
        {SECTIONS.map((item) => {
          const on = item.key === section;
          return (
            <Pressable
              key={item.key}
              onPress={() => setSection(item.key)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Ionicons
                name={item.icon}
                size={21}
                color={on ? c.accent : c.textFaint}
              />
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <PhotoViewer photos={viewable} index={openAt} onClose={() => setOpenAt(null)} />
    </SafeAreaView>
  );
}

/** 進入口ごとの説明と条件 */
function SummaryBlock({
  entryPoints,
  styles,
  c,
}: {
  entryPoints: EntryPoint[];
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  if (entryPoints.length === 0) {
    return <Text style={styles.emptyText}>この施設の入口はまだ登録されていません。</Text>;
  }

  return (
    <View style={styles.stack}>
      {entryPoints.map((ep) => {
        const attrs = [
          ep.height_limit_cm !== null ? `高さ制限 ${ep.height_limit_cm}cm` : null,
          ep.is_roofed !== null ? (ep.is_roofed ? '屋根あり' : '屋根なし') : null,
          ep.is_24h !== null ? (ep.is_24h ? '24時間可' : '24時間不可') : null,
        ].filter(Boolean) as string[];

        return (
          <View key={ep.id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardBadge}>
                <Text style={styles.cardBadgeText}>{ep.code}</Text>
              </View>
              <Text style={styles.cardTitle}>{ep.name}</Text>
            </View>
            {ep.approach_text && <Text style={styles.cardBody}>{ep.approach_text}</Text>}
            {attrs.length > 0 && (
              <View style={styles.chips}>
                {attrs.map((a) => (
                  <View key={a} style={styles.chip}>
                    <Text style={styles.chipText}>{a}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function PhotoGrid({
  photos,
  offset,
  onOpen,
  styles,
  large = false,
}: {
  photos: Photo[];
  offset: number;
  onOpen: (index: number) => void;
  styles: ReturnType<typeof makeStyles>;
  large?: boolean;
}) {
  if (photos.length === 0) {
    return <Text style={styles.emptyText}>まだ登録されていません。</Text>;
  }

  return (
    <View style={styles.photoWrap}>
      {photos.map((p, i) => (
        <Pressable
          key={p.id}
          onPress={() => onOpen(offset + i)}
          style={[styles.photoItem, large && styles.photoItemLarge]}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${PHOTO_KIND_LABEL[p.kind]}を拡大する`}
        >
          <Image
            source={{ uri: photoUrl(p.storage_path) }}
            style={styles.photo}
            contentFit={large ? 'contain' : 'cover'}
            transition={150}
            cachePolicy="disk"
          />
          <View style={styles.photoTag}>
            <Text style={styles.photoTagText}>{PHOTO_KIND_LABEL[p.kind]}</Text>
          </View>
          {p.is_placeholder && (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>仮画像</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function CautionBlock({
  cautions,
  styles,
}: {
  cautions: Caution[];
  styles: ReturnType<typeof makeStyles>;
}) {
  const { active, inactive } = useMemo(() => splitByActive(cautions), [cautions]);

  if (cautions.length === 0) {
    return <Text style={styles.emptyText}>注意事項は登録されていません。</Text>;
  }

  return (
    <View style={styles.stack}>
      {active.map((x) => (
        <View key={x.id} style={styles.cautionNow}>
          <Text style={styles.cautionLabel}>
            いま注意{describeSchedule(x) ? `（${describeSchedule(x)}）` : ''}
          </Text>
          <Text style={styles.cautionBody}>{x.body}</Text>
        </View>
      ))}
      {inactive.map((x) => (
        <View key={x.id} style={styles.cautionOther}>
          <Text style={styles.cautionOtherText}>
            {describeSchedule(x) ? `${describeSchedule(x)}｜` : ''}
            {x.body}
          </Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorText: { fontSize: 13, color: c.textMuted },
    page: { paddingBottom: SPACE.lg },

    // --- 上部 ---
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.sm,
    },
    topTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: c.text },
    topRight: { flexDirection: 'row', gap: SPACE.md },

    // --- 地図の場所 ---
    map: {
      height: 260,
      marginHorizontal: SPACE.lg,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    mapPin: { marginBottom: 2 },
    mapName: { fontSize: 15, fontWeight: '800', color: c.text },
    mapSub: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    mapNote: {
      marginTop: SPACE.md,
      paddingHorizontal: SPACE.md,
      paddingVertical: 4,
      borderRadius: RADIUS.sm,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
    },
    mapNoteText: { fontSize: 10, color: c.textFaint },
    mapLocate: {
      position: 'absolute',
      right: SPACE.md,
      bottom: SPACE.md,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // --- 名前と操作 ---
    headBlock: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md },
    grip: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: SPACE.md,
    },
    name: { fontSize: 20, fontWeight: '800', color: c.text },
    kindRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    kindText: { fontSize: 12, color: c.textMuted },
    address: { fontSize: 12, color: c.textMuted, marginTop: 4 },

    actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
    action: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 40,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.accent,
    },
    actionMain: { backgroundColor: c.accent, borderColor: c.accent },
    actionPressed: { opacity: 0.75 },
    actionOff: { opacity: 0.4 },
    actionText: { fontSize: 13, fontWeight: '700', color: c.accent },
    actionMainText: { fontSize: 13, fontWeight: '700', color: c.accentText },

    // --- 中身の切り替え ---
    // 探す画面の下部タブと同じ見た目にそろえる
    tabs: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
      paddingTop: 6,
    },
    tab: { flex: 1, alignItems: 'center', gap: 3, paddingBottom: SPACE.sm },
    tabText: { fontSize: 11, color: c.textFaint, fontWeight: '600' },
    tabTextOn: { color: c.accent },

    body: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md },
    stack: { gap: SPACE.sm },
    emptyText: { fontSize: 12, color: c.textFaint, textAlign: 'center', paddingVertical: SPACE.xl },

    card: {
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
    cardBadge: {
      width: 26,
      height: 26,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBadgeText: { fontSize: 12, fontWeight: '800', color: c.accentText },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    cardBody: { fontSize: 13, color: c.text, lineHeight: 20, marginTop: SPACE.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SPACE.sm },
    chip: {
      paddingHorizontal: SPACE.sm,
      paddingVertical: 3,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipText: { fontSize: 11, color: c.textMuted },

    photoWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
    photoItem: {
      width: '48%',
      flexGrow: 1,
      aspectRatio: 4 / 3,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.border,
    },
    photoItemLarge: { width: '100%' },
    photo: { width: '100%', height: '100%' },
    photoTag: {
      position: 'absolute',
      left: 6,
      bottom: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: RADIUS.sm,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    photoTagText: { fontSize: 10, color: '#ffffff', fontWeight: '600' },
    photoPlaceholder: {
      position: 'absolute',
      right: 6,
      top: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: RADIUS.sm,
      backgroundColor: c.warnSoft,
    },
    photoPlaceholderText: { fontSize: 10, color: c.warn, fontWeight: '700' },

    cautionNow: {
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
    },
    cautionLabel: { fontSize: 11, fontWeight: '800', color: c.danger },
    cautionBody: { fontSize: 13, color: c.text, lineHeight: 20, marginTop: 3 },
    cautionOther: {
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    cautionOtherText: { fontSize: 12, color: c.textMuted, lineHeight: 18 },
  });
}
