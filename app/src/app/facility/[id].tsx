import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PhotoViewer } from '@/components/photo-viewer';
import { FacilityMap } from '@/components/facility-map';
import { describeSchedule, splitByActive } from '@/lib/cautions';
import { fetchFacilityDetail } from '@/lib/facilities';
import { useLayout } from '@/lib/layout';
import { isFavorite, toggleFavorite } from '@/lib/favorites';
import { recordVisit } from '@/lib/history';
import { ensureSynced } from '@/lib/sync';
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

/** 地図の高さ。周囲の道が読める程度に取る。 */
const MAP_HEIGHT = 260;

/**
 * 広い画面で、左（進入口の説明）に使う幅。
 *
 * 右は地図。残りを縦長で使う。横一杯に伸ばした帯状の地図では、
 * ピンのまわりが見えない。地図の寸法は枠を実測して決める。
 */
const SPLIT_TEXT_WIDTH = 520;

type Section = 'summary' | 'photos' | 'diagram' | 'cautions';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'summary', label: '概要', icon: 'business-outline' },
  { key: 'photos', label: '写真', icon: 'images-outline' },
  { key: 'diagram', label: '案内図', icon: 'map-outline' },
  { key: 'cautions', label: '注意', icon: 'alert-circle-outline' },
];

export default function FacilityScreen() {
  const { isWide } = useLayout();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useTheme();
  const styles = makeStyles(c);

  const [detail, setDetail] = useState<FacilityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('summary');
  const [openAt, setOpenAt] = useState<number | null>(null);
  /** この施設をお気に入りに留めてあるか */
  const [pinned, setPinned] = useState(false);
  /** 広い画面で地図を置く枠の実寸 */
  const [mapBox, setMapBox] = useState({ width: 0, height: 0 });
  const { width: winWidth } = Dimensions.get('window');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        /*
          取り込みの完了を待つ。

          この画面は、共有された URL から直接開かれることがある。
          その場合は探す画面を通らないため、以前は取り込みが
          一度も走らず、端末のデータベースが空のままだった。
          結果として「施設を読み込めませんでした」で行き止まりになる。

          ensureSynced は結果を控えているので、探す画面から来た
          場合は待たされない。
        */
        await ensureSynced();

        const found = await fetchFacilityDetail(id);
        if (!alive) return;
        setDetail(found);
        if (!found) setError('この施設は見つかりませんでした。');

        /*
          読めたものだけを履歴に残す。
          存在しない id で開かれた場合まで残すと、履歴から
          開けない行が並ぶことになる。
        */
        if (found) void recordVisit(id);
      } catch {
        if (alive) setError('施設を読み込めませんでした。');
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  /*
    留めてあるかを読む。

    施設が変わったら読み直す。共有された URL から直接開かれることも
    あるため、画面を出すたびに確かめる。

    **早期 return より前に置くこと。**
      この下には「読み込み中」「開けなかった」で描画を打ち切る分岐がある。
      その後ろへ置くと、状態によってフックの数が変わり、React が
      「Rendered more hooks than during the previous render」で止まる。
      実際にそれで画面が真っ白になった。
  */
  useEffect(() => {
    if (!id) return;
    let alive = true;
    isFavorite(id).then((v) => {
      if (alive) setPinned(v);
    });
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
            <>
              <Ionicons name="alert-circle-outline" size={30} color={c.textFaint} />
              <Text style={styles.errorText}>{error}</Text>
              {/*
                行き止まりにしない。
                共有された URL から直接開かれ、読めなかった場合、
                戻る先が無いと画面から出られなくなる。
              */}
              <Pressable
                onPress={() => router.replace('/')}
                style={({ pressed }) => [styles.errorAction, pressed && styles.errorActionOn]}
                accessibilityRole="button"
              >
                <Ionicons name="search" size={15} color={c.accent} />
                <Text style={styles.errorActionText}>施設を探す</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color={c.accent} />
              {/* 何を待っているのかを書く。無言で回るだけでは不安になる。 */}
              <Text style={styles.errorText}>施設の情報を読み込んでいます…</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { facility, entryPoints } = detail!;
  /*
    タイルを並べるのに実寸が要る。

    狭い画面は横幅いっぱい。広い画面では右の列に縦長で置くため、
    その列の幅を渡す。以前は画面幅をそのまま使っており、1920px の
    画面で 1920×270 の細長い帯になり、ピンが上端に寄って
    肝心の車寄せのまわりが見えなかった。
  */
  /*
    広い画面では、地図を置く枠を実測して使う。

    画面幅から左の列と左メニューを引いて求めていたが、左メニューの幅を
    見込みで引いていたため、右側に数十pxの隙間が残った。
    枠そのものを測れば、見込みは要らない。
  */
  const mapWidth = isWide ? mapBox.width : winWidth - SPACE.lg * 2;
  const mapHeight = isWide ? mapBox.height : MAP_HEIGHT;

  const main = entryPoints[0];
  const hasNav = main && main.nav_lat !== null && main.nav_lng !== null;

  /*
    留める／外すを切り替える。

    先に画面を変えてから書き込む。押した手応えが遅れると、
    効いていないと思ってもう一度押されやすい。
  */
  async function onPin() {
    if (!id) return;
    setPinned((v) => !v);
    const now = await toggleFavorite(id);
    setPinned(now);
  }

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
      {/*
        上部の帯。

        記号はすべて IconButton を通す。以前は Pressable に記号を置いた
        だけで、乗せても押しても見た目が変わらなかった。
      */}
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" size={22} label="戻る" onPress={() => router.back()} />
        <Text style={styles.topTitle}>車寄せ案内</Text>
        <View style={styles.topRight}>
          <IconButton
            icon="share-outline"
            label="座標を複製"
            onPress={onCopy}
            disabled={!hasNav}
          />
          <IconButton
            icon="heart-outline"
            iconOn="heart"
            on={pinned}
            label={pinned ? 'お気に入りから外す' : 'お気に入りに入れる'}
            onPress={onPin}
          />
        </View>
      </View>

      {/*
        広い画面では左に説明、右に地図を置く。

        地図は縦長のまま動かさない。説明を読み進めるあいだも
        「どこに着けるのか」が視界に残っていてほしい。
      */}
      <View style={isWide ? styles.split : styles.splitOff}>
      <ScrollView
        style={isWide ? styles.splitText : undefined}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {/*
          車寄せのまわりの地図。

          出すのは進入口の座標であって、建物の中心ではない。
          着けたい場所そのものを見せないと、この画面の意味がない。
          進入口に座標が無ければ施設の座標へ落とす。

          地図を押してナビを開始する作りはやめた。指で動かす操作と
          区別が付かないため。ナビの開始は下の「経路」が担う。
        */}
        {!isWide && (
          <View style={styles.map}>
            <FacilityMap
              lat={main?.nav_lat ?? facility.lat}
              lng={main?.nav_lng ?? facility.lng}
              label={main ? ENTRY_POINT_KIND_LABEL[main.kind] : undefined}
              width={mapWidth}
              height={mapHeight}
            />
          </View>
        )}

        {/* 名前・住所 */}
        <View style={styles.headBlock}>
          {/* 下から引き上げる作りを示す印。指で扱う画面だけに出す。 */}
          {!isWide && <View style={styles.grip} />}
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
              style={({ hovered, pressed }) => [
                styles.action,
                styles.actionMain,
                hovered && styles.actionMainHover,
                pressed && styles.actionPressed,
                !hasNav && styles.actionOff,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="navigate" size={15} color={c.accentText} />
              <Text style={styles.actionMainText}>経路</Text>
            </Pressable>
            {/*
              上の心印と同じ働き。押す場所が2つあるのは、
              走行前に急いで押す場面で、指の届く側を選べるようにするため。
              状態は同じものを見ているので、片方を押せば両方が変わる。
            */}
            <Pressable
              onPress={onPin}
              style={({ hovered, pressed }) => [
                styles.action,
                hovered && styles.actionHover,
                pressed && styles.actionPressed,
                pinned && styles.actionOn,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: pinned }}
              accessibilityLabel={pinned ? 'お気に入りから外す' : 'お気に入りに入れる'}
            >
              <Ionicons name={pinned ? 'star' : 'star-outline'} size={15} color={c.accent} />
              <Text style={styles.actionText}>{pinned ? '保存済み' : '保存'}</Text>
            </Pressable>
            <Pressable
              onPress={onCopy}
              disabled={!hasNav}
              style={({ hovered, pressed }) => [
                styles.action,
                hovered && styles.actionHover,
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


        {isWide && (
          <SectionTabs section={section} onChange={setSection} styles={styles} c={c} wide />
        )}

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

      {isWide && (
        <View
          style={styles.splitMap}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setMapBox({ width: Math.round(width), height: Math.round(height) });
          }}
        >
          <FacilityMap
            lat={main?.nav_lat ?? facility.lat}
            lng={main?.nav_lng ?? facility.lng}
            label={main ? ENTRY_POINT_KIND_LABEL[main.kind] : undefined}
            width={mapWidth}
            height={mapHeight}
          />
        </View>
      )}
      </View>

      {/*
        狭い画面では切り替えを下へ固定する。

        中身の上に置くと、写真や案内図を送ったあとに切り替えたくなった際、
        いちど上まで戻す必要がある。探す画面の下部タブと同じ位置にすることで、
        どの画面でも指の届く場所が変わらない。

        広い画面では逆で、下端は指の届く場所ではなく、ただ遠い。
        中身のすぐ上へ置く（左の列の中）。
      */}
      {!isWide && (
        <SectionTabs section={section} onChange={setSection} styles={styles} c={c} />
      )}

      <PhotoViewer photos={viewable} index={openAt} onClose={() => setOpenAt(null)} />
    </SafeAreaView>
  );
}

/**
 * 概要・写真・案内図・注意の切り替え。
 *
 * 狭い画面では下端に固定し、広い画面では中身のすぐ上に横一列で置く。
 * どちらも同じ並び・同じ記号にして、画面が変わっても迷わないようにする。
 */
function SectionTabs({
  section,
  onChange,
  styles,
  c,
  wide,
}: {
  section: Section;
  onChange: (s: Section) => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  wide?: boolean;
}) {
  return (
    <View style={wide ? styles.tabsWide : styles.tabs}>
      {SECTIONS.map((item) => {
        const on = item.key === section;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={wide ? [styles.tabWide, on && styles.tabWideOn] : styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Ionicons
              name={item.icon}
              size={wide ? 16 : 21}
              color={on ? c.accent : c.textFaint}
            />
            <Text
              style={[
                wide ? styles.tabWideText : styles.tabText,
                on && styles.tabTextOn,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.xl },
    errorText: { fontSize: 13, color: c.textMuted, textAlign: 'center' },
    errorAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: 9,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    errorActionOn: { backgroundColor: c.surface2 },
    errorActionText: { fontSize: 13, fontWeight: '700', color: c.accent },
    page: { paddingBottom: SPACE.lg },

    /*
      広い画面の2段組み。

      左は説明。幅を決め打ちにする。伸ばすと1行が長くなりすぎて、
      目が行末から次の行頭へ戻れなくなる。
      右は地図。残りを使い、縦長のまま動かさない。

      幅は flexBasis まで指定する。ScrollView は自前で flex: 1 を持ち、
      それに含まれる flexBasis: 0% が width より優先されるため。
    */
    split: { flex: 1, flexDirection: 'row' },
    splitOff: { flex: 1 },
    splitText: {
      width: SPLIT_TEXT_WIDTH,
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: SPLIT_TEXT_WIDTH,
    },
    /*
      余白を入れない。

      枠を実測して地図の寸法に使うため、余白があるとその分だけ
      はみ出す。探す画面の地図と同じく、端まで敷き詰める。
    */
    splitMap: {
      flex: 1,
      borderLeftWidth: 1,
      borderLeftColor: c.border,
    },

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
      height: MAP_HEIGHT,
      marginHorizontal: SPACE.lg,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
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
    /* マウスを乗せたとき。押せることを見た目で示す。 */
    actionHover: { backgroundColor: c.surface2, borderColor: c.borderStrong },
    actionMainHover: { opacity: 0.9 },
    /* 留めてある状態 */
    actionOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
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
    // 広い画面では中身のすぐ上に、横一列で置く
    tabsWide: {
      flexDirection: 'row',
      gap: SPACE.xs,
      marginHorizontal: SPACE.lg,
      marginTop: SPACE.md,
      padding: 3,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface2,
    },
    tabWide: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 34,
      borderRadius: RADIUS.sm,
    },
    tabWideOn: { backgroundColor: c.surface },
    tabWideText: { fontSize: 12, color: c.textFaint, fontWeight: '600' },
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
