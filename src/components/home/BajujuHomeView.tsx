import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { BajujuNotificationCategory } from '../../utils/bajujuNotificationCategories';
import { BajujuBottomNav } from '../navigation/BajujuBottomNav';
import { getExperienceCategoryIcon, normalizeExperienceCategory } from '../../constants/experienceCategories';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  BajujuIcon,
  BajujuIconName,
} from '../icons/BajujuIcon';

const bajujuLogo = require('../../../assets/brand/bajuju-logo.png');

const COLORS = {
  background: '#FFF7FB',
  white: '#FFFFFF',
  pink: '#E43F98',
  brightPink: '#F32189',
  softPink: '#FFF0F7',
  palePink: '#FFDDEB',
  howHighlight: '#F32189',
  green: '#2FAE66',
  greenSoft: '#EAF8F0',
  myEvents: '#168C9E',
  line: '#F3C6DC',
  plum: '#4B0C2D',
  muted: '#A95D86',
  accentText: '#C2287A',
  bodyText: '#6B3652',
};

type NextExperience = {
  id: string;
  title: string;
  meta: string;
  organizedByMe?: boolean;
};

export type HomeNearbyExperience = {
  id: string;
  title: string;
  category: string;
  city: string;
  date: string;
  photoUrl: string;
  distanceKm: number;
};

export type HomeGroupPreview = {
  id: string;
  name: string;
  city: string;
  province: string;
  coverUrl: string;
  memberCount: number;
  joinedByMe: boolean;
};

type BajujuHomeViewProps = {
  profilePhotoUrl: string;
  unreadNotificationsCount: number;
  notificationCounts: Record<BajujuNotificationCategory, number>;
  nextExperience?: NextExperience | null;
  groups?: HomeGroupPreview[];
  nearbyExperiences?: HomeNearbyExperience[];
  onOpenExperience: (id: string) => void;
  onOpenNextExperience?: () => void;
  onOpenNotifications: () => void;
  onOpenNotificationCategory: (category: BajujuNotificationCategory) => void;
  onOpenProfile: () => void;
  onFind: () => void;
  onOpenHowItWorks: () => void;
  onCreate: () => void;
  onOpenMyEvents: () => void;
  onOpenGroups: () => void;
  onCreateGroup: () => void;
  onOpenGroup: (groupId: string) => void;
  onShare: () => void;
};

export function BajujuHomeView({
  profilePhotoUrl,
  unreadNotificationsCount,
  notificationCounts,
  nextExperience,
  groups = [],
  nearbyExperiences = [],
  onOpenExperience,
  onOpenNextExperience,
  onOpenNotifications,
  onOpenNotificationCategory,
  onOpenProfile,
  onFind,
  onOpenHowItWorks,
  onCreate,
  onOpenMyEvents,
  onOpenGroups,
  onCreateGroup,
  onOpenGroup,
  onShare,
}: BajujuHomeViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 138 + insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.brandGroup}>
            <Image source={bajujuLogo} resizeMode="contain" style={styles.panda} />
            <Text style={styles.brand}>Bajuju</Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apri notifiche"
              onPress={onOpenNotifications}
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            >
              <BajujuIcon name="bell" size={24} color={COLORS.plum} />
              {unreadNotificationsCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apri il profilo"
              onPress={onOpenProfile}
              style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
            >
              {profilePhotoUrl ? (
                <Image source={{ uri: profilePhotoUrl }} resizeMode="cover" style={styles.profilePhoto} />
              ) : (
                <BajujuIcon name="person" size={22} color={COLORS.pink} />
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.notificationShortcuts}>
          {([
            { key: 'requests', label: 'Richieste', icon: 'mail-unread-outline' },
            { key: 'chat', label: 'Chat', icon: 'chatbubbles-outline' },
            { key: 'other', label: 'Altre', icon: 'notifications-outline' },
          ] as const).map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}: ${notificationCounts[item.key]} notifiche non lette`}
              onPress={() => onOpenNotificationCategory(item.key)}
              style={({ pressed }) => [styles.notificationShortcut, pressed && styles.pressed]}
            >
              <Ionicons name={item.icon} size={18} color={COLORS.plum} />
              <Text style={styles.notificationShortcutLabel}>{item.label}</Text>
              {notificationCounts[item.key] > 0 ? (
                <Text style={styles.notificationShortcutCount}>
                  {notificationCounts[item.key] > 99 ? '99+' : notificationCounts[item.key]}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>

        <View style={styles.content}>
          {nextExperience ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri la tua prossima esperienza: ${nextExperience.title}`}
              onPress={onOpenNextExperience}
              style={({ pressed }) => [styles.nextExperienceCard, pressed && styles.pressed]}
            >
              <View style={styles.nextExperienceIcon}>
                <BajujuIcon name="calendar" size={20} color={COLORS.accentText} />
              </View>
              <View style={styles.nextExperienceCopy}>
                <Text style={styles.nextExperienceEyebrow}>
                  {nextExperience.organizedByMe ? 'LA TUA PROSSIMA ESPERIENZA · LA ORGANIZZI TU' : 'LA TUA PROSSIMA ESPERIENZA'}
                </Text>
                <Text style={styles.nextExperienceTitle} numberOfLines={1}>{nextExperience.title}</Text>
                <Text style={styles.nextExperienceMeta} numberOfLines={1}>{nextExperience.meta}</Text>
              </View>
              <BajujuIcon name="arrow" size={22} color={COLORS.accentText} />
            </Pressable>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Eventi vicino a te</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Vedi tutti gli eventi" onPress={onFind} style={({ pressed }) => [styles.seeAllButton, pressed && styles.pressed]}>
              <Text style={styles.seeAllLink}>Vedi tutti ›</Text>
            </Pressable>
          </View>
          <FlatList
            horizontal
            data={nearbyExperiences}
            keyExtractor={(event) => event.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsScroll}
            style={styles.horizontalSection}
            initialNumToRender={5}
            maxToRenderPerBatch={8}
            windowSize={5}
            renderItem={({ item: event }) => (
              <Pressable key={event.id} style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]} onPress={() => onOpenExperience(event.id)} accessibilityRole="button" accessibilityLabel={`Apri esperienza ${event.title}`}>
                <View style={styles.eventImageBox}>
                  {event.photoUrl ? <Image source={{ uri: event.photoUrl }} style={styles.eventImage} resizeMode="cover" /> : <View style={styles.eventPlaceholder}><BajujuIcon name="pin" size={44} color={COLORS.pink} /></View>}
                  <Text style={[styles.imageChip, styles.categoryChip]} numberOfLines={1}>{getExperienceCategoryIcon(event.category)} {normalizeExperienceCategory(event.category)}</Text>
                  <Text style={[styles.imageChip, styles.distanceChip]}>{event.distanceKm < 1 ? `${Math.round(event.distanceKm * 1000)} m` : `${event.distanceKm.toFixed(1).replace('.', ',')} km`}</Text>
                </View>
                <View style={styles.eventBody}>
                  <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
                  <View style={styles.eventFooter}>
                    <View style={styles.eventMeta}>
                      <View style={styles.metaRow}>
                        <BajujuIcon name="calendar" size={16} color={COLORS.accentText} />
                        <Text style={styles.metaText} numberOfLines={1}>{event.date}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <BajujuIcon name="pin" size={16} color={COLORS.accentText} />
                        <Text style={styles.metaText} numberOfLines={1}>{event.city}</Text>
                      </View>
                    </View>
                    <View style={styles.openButton}>
                      <BajujuIcon name="arrow" size={20} color={COLORS.pink} />
                    </View>
                  </View>
                </View>
              </Pressable>
            )}
            ListFooterComponent={
              <Pressable style={({ pressed }) => [styles.eventCard, styles.seeAllCard, pressed && styles.pressed]} onPress={onFind} accessibilityRole="button" accessibilityLabel="Visualizza tutti gli eventi">
              <BajujuIcon name="search" size={42} color={COLORS.pink} />
              <Text style={styles.seeAllText}>Visualizza tutti</Text>
              <Text style={styles.seeAllLink}>Trova esperienze →</Text>
              </Pressable>
            }
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Gruppi</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Vedi tutti i gruppi" onPress={onOpenGroups} style={({ pressed }) => [styles.seeAllButton, pressed && styles.pressed]}>
              <Text style={styles.seeAllLink}>Vedi tutti ›</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsScroll}
            style={styles.horizontalSection}
          >
            {groups.map((group) => {
              const place = group.city || group.province;
              const members = `${group.memberCount} ${group.memberCount === 1 ? 'iscritto' : 'iscritti'}`;
              return (
                <Pressable
                  key={group.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Apri gruppo ${group.name}`}
                  onPress={() => onOpenGroup(group.id)}
                  style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}
                >
                  <View style={styles.groupImageBox}>
                    {group.coverUrl ? <Image source={{ uri: group.coverUrl }} resizeMode="cover" style={styles.groupImage} /> : <BajujuIcon name="group" size={40} color={COLORS.pink} />}
                    {group.joinedByMe ? <Text style={[styles.imageChip, styles.joinedChip]}>Sei iscritto</Text> : null}
                  </View>
                  <View style={styles.groupBody}>
                    <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
                    <Text style={styles.metaText} numberOfLines={1}>{[place, members].filter(Boolean).join(' · ')}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Condividi Bajuju"
              onPress={onShare}
              style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
            >
              <BajujuIcon name="share" size={22} color={COLORS.white} />
              <Text style={styles.shareText}>Condividi Bajuju</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <BajujuBottomNav active="home" />
    </SafeAreaView>
  );
}

type ActionCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  accessibilityLabel: string;
  accentColor?: string;
  accentBackground?: string;
  onPress: () => void;
};

function ActionCard({ icon, title, description, accessibilityLabel, accentColor, accentBackground, onPress }: ActionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
    >
      <View style={[styles.iconBlob, accentBackground ? { backgroundColor: accentBackground } : null]}>{icon}</View>
      <Text style={[styles.actionTitle, accentColor ? { color: accentColor } : null]}>{title}</Text>
      <View style={[styles.titleUnderline, accentColor ? { backgroundColor: accentColor } : null]} />
      <Text style={styles.actionDescription}>{description}</Text>
      <View style={styles.cardArrow}><BajujuIcon name="arrow" size={23} color={COLORS.brightPink} /></View>
    </Pressable>
  );
}

type InfoItemProps = { icon: BajujuIconName; text: string };

function InfoItem({ icon, text }: InfoItemProps) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}><BajujuIcon name={icon} size={24} color={COLORS.brightPink} /></View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

type NavItemProps = { active?: boolean; icon: BajujuIconName; label: string; onPress: () => void };

function NavItem({ active = false, icon, label, onPress }: NavItemProps) {
  const isHowItWorks = label === 'Come funziona';
  const isMyEvents = label === 'I miei eventi';
  const color = isHowItWorks
    ? active
      ? COLORS.white
      : COLORS.howHighlight
    : isMyEvents
      ? COLORS.myEvents
      : active
        ? COLORS.brightPink
        : COLORS.plum;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navItem,
        isHowItWorks && styles.howNavItem,
        isHowItWorks && active && styles.howNavItemActive,
        pressed && styles.pressed,
      ]}
    >
      <BajujuIcon name={icon} size={28} color={color} />
      <Text
        numberOfLines={1}
        style={[
          styles.navLabel,
          (label === 'I miei eventi' || label === 'Come funziona') && styles.navLabelCompact,
          isHowItWorks && styles.howNavLabel,
          isMyEvents && styles.myEventsNavLabel,
          active && !isHowItWorks && !isMyEvents && styles.navLabelActive,
          isHowItWorks && active && styles.howNavLabelActive,
          isMyEvents && active && styles.myEventsNavLabelActive,
        ]}
      >
        {label}
      </Text>
      {active ? (
        <View
          style={[
            styles.activeIndicator,
            isHowItWorks && styles.howActiveIndicator,
            isMyEvents && styles.myEventsActiveIndicator,
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 138 },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panda: { width: 40, height: 44 },
  brand: { color: COLORS.pink, fontFamily: 'FredokaBold', fontSize: 31, letterSpacing: -1.2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notificationShortcuts: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  notificationShortcut: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 42, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line },
  notificationShortcutLabel: { fontFamily: 'FredokaMedium', fontSize: 12, color: COLORS.plum },
  notificationShortcutCount: { minWidth: 18, paddingHorizontal: 4, borderRadius: 10, overflow: 'hidden', fontFamily: 'FredokaBold', fontSize: 11, textAlign: 'center', color: COLORS.white, backgroundColor: COLORS.brightPink },
  roundButton: { position: 'relative', width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, borderWidth: 1.4, borderColor: '#F4C4DC' },
  notificationBadge: { position: 'absolute', right: -4, top: -4, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brightPink, borderWidth: 2, borderColor: COLORS.white },
  notificationBadgeText: { color: COLORS.white, fontFamily: 'FredokaBold', fontSize: 10, lineHeight: 12 },
  profileButton: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, borderWidth: 2, borderColor: COLORS.pink },
  profilePhoto: { width: '100%', height: '100%', backgroundColor: COLORS.softPink },
  content: { paddingHorizontal: 16 },
  hero: { height: 193, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 31, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: 'rgba(255,255,255,0.86)', shadowColor: '#9B1A5B', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  heroBlob: { position: 'absolute', width: 100, height: 72, borderRadius: 50, backgroundColor: COLORS.palePink, opacity: 0.75 },
  heroBlobTop: { left: -25, top: -24, transform: [{ rotate: '-18deg' }] },
  heroBlobBottom: { right: -34, bottom: -28, transform: [{ rotate: '18deg' }] },
  doodle: { position: 'absolute', zIndex: 2, color: COLORS.brightPink, fontFamily: 'FredokaBold' },
  doodleLeft: { left: 34, top: 84, fontSize: 25, transform: [{ rotate: '-8deg' }] },
  doodleRight: { right: 29, top: 27, fontSize: 24, transform: [{ rotate: '8deg' }] },
  claimTop: { zIndex: 1, color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 42, lineHeight: 43, letterSpacing: -1.2 },
  claimBottom: { zIndex: 1, marginTop: -1, color: COLORS.brightPink, fontFamily: 'FredokaBold', fontSize: 55, lineHeight: 54, letterSpacing: -1.2 },
  heroCopy: { zIndex: 1, marginTop: 8, color: COLORS.plum, fontFamily: 'FredokaMedium', fontSize: 16, lineHeight: 20, textAlign: 'center' },
  questionRow: { height: 69, paddingTop: 22, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  questionAccent: { width: 32, height: 4, borderRadius: 2, backgroundColor: COLORS.pink, transform: [{ rotate: '7deg' }] },
  question: { color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 24, letterSpacing: 0.2 },
  actionRow: { flexDirection: 'row', gap: 13 },
  actionCard: { position: 'relative', flex: 1, height: 206, padding: 18, borderRadius: 29, borderWidth: 1.7, borderColor: '#F3BBD5', backgroundColor: COLORS.white, shadowColor: '#7B1048', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 13 }, elevation: 10 },
  iconBlob: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', shadowColor: '#9B1A5B', shadowOpacity: 0.17, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 6 },
  actionTitle: { marginTop: 12, color: COLORS.brightPink, fontFamily: 'FredokaBold', fontSize: 29, lineHeight: 31, letterSpacing: -0.6 },
  titleUnderline: { width: 24, height: 3, marginTop: 6, marginBottom: 8, borderRadius: 2, backgroundColor: COLORS.brightPink },
  actionDescription: { color: COLORS.plum, fontFamily: 'FredokaSemiBold', fontSize: 13.5, lineHeight: 16 },
  cardArrow: { position: 'absolute', right: 14, bottom: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink, borderWidth: 1, borderColor: '#FFD5E8', shadowColor: '#A2165A', shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  seeAllCard: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink },
  seeAllText: { color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 24, marginTop: 12 },
  createGroupCard: { borderColor: '#9EDDBC', backgroundColor: '#F6FCF8', alignItems: 'center', justifyContent: 'center', shadowColor: '#167A49' },
  createGroupPlus: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.greenSoft, borderWidth: 1, borderColor: '#D8F3E4', shadowColor: '#188451', shadowOpacity: 0.17, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 6 },
  createGroupTitle: { marginTop: 14, color: COLORS.green, fontFamily: 'FredokaBold', fontSize: 20, textAlign: 'center' },
  createGroupText: { marginTop: 6, color: '#4E8E68', fontFamily: 'FredokaMedium', fontSize: 12, lineHeight: 16, textAlign: 'center' },
  groupCover: { width: '100%', height: 70, borderRadius: 17, backgroundColor: COLORS.softPink, borderWidth: 1, borderColor: '#F8D7E8' },
  groupIcon: { width: 47, height: 47, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink },
  groupPlace: { marginTop: 5, color: COLORS.muted, fontFamily: 'FredokaMedium', fontSize: 11 },
  groupMembers: { marginTop: 7, color: COLORS.brightPink, fontFamily: 'FredokaSemiBold', fontSize: 11 },
  groupJoined: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, overflow: 'hidden', color: COLORS.brightPink, backgroundColor: COLORS.softPink, fontFamily: 'FredokaSemiBold', fontSize: 10 },
  groupsEmpty: { marginHorizontal: 22, minHeight: 101, padding: 15, borderRadius: 26, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.white, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupsEmptyIcon: { width: 52, height: 52, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink },
  groupsEmptyCopy: { flex: 1 },
  groupsEmptyTitle: { color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 16 },
  groupsEmptyText: { marginTop: 3, color: COLORS.muted, fontFamily: 'FredokaMedium', fontSize: 12, lineHeight: 16 },
  nextExperienceCard: { marginTop: 6, marginBottom: 6, padding: 12, paddingLeft: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#E7C56A', backgroundColor: '#FFF9E7', flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextExperienceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  nextExperienceCopy: { flex: 1 },
  sectionHeader: { marginTop: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 22, letterSpacing: -0.3 },
  seeAllButton: { minHeight: 44, justifyContent: 'center' },
  seeAllLink: { color: COLORS.accentText, fontFamily: 'FredokaSemiBold', fontSize: 15 },
  horizontalSection: { marginHorizontal: -16 },
  cardsScroll: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  eventCard: { width: 300, borderRadius: 22, overflow: 'hidden', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line },
  eventImageBox: { height: 160, backgroundColor: COLORS.softPink },
  eventImage: { width: '100%', height: '100%' },
  eventPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageChip: { position: 'absolute', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontFamily: 'FredokaSemiBold', fontSize: 13 },
  categoryChip: { top: 10, left: 10, maxWidth: '60%', backgroundColor: COLORS.white, color: '#9B1F61' },
  distanceChip: { top: 10, right: 10, backgroundColor: 'rgba(75, 12, 45, 0.82)', color: COLORS.white },
  joinedChip: { top: 8, left: 8, backgroundColor: COLORS.green, color: COLORS.white, fontSize: 12 },
  eventBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 8 },
  eventTitle: { color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 18, lineHeight: 22 },
  eventFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventMeta: { flex: 1, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flexShrink: 1, color: COLORS.bodyText, fontFamily: 'FredokaMedium', fontSize: 14 },
  openButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink },
  groupCard: { width: 210, borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line },
  groupImageBox: { height: 104, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink },
  groupImage: { width: '100%', height: '100%' },
  groupBody: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 3 },
  groupName: { color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 16, lineHeight: 20 },
  nextExperienceEyebrow: { color: '#7A5A00', fontFamily: 'FredokaSemiBold', fontSize: 11, letterSpacing: 0.5 },
  nextExperienceTitle: { marginTop: 2, color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 16, lineHeight: 20 },
  nextExperienceMeta: { marginTop: 1, color: COLORS.bodyText, fontFamily: 'FredokaMedium', fontSize: 13 },
  infoCard: { marginTop: 20, padding: 22, borderRadius: 29, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.white, shadowColor: '#761046', shadowOpacity: 0.13, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  infoTitle: { marginBottom: 15, color: COLORS.brightPink, fontFamily: 'FredokaBold', fontSize: 29, letterSpacing: -0.6 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  infoIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink },
  infoText: { flex: 1, color: COLORS.plum, fontFamily: 'FredokaSemiBold', fontSize: 16, lineHeight: 21 },
  footer: { alignItems: 'center', paddingTop: 18, paddingBottom: 20 },
  shareButton: { minHeight: 58, paddingHorizontal: 28, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: COLORS.brightPink, shadowColor: '#9B1A5B', shadowOpacity: 0.18, shadowRadius: 13, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  shareText: { color: COLORS.white, fontFamily: 'FredokaBold', fontSize: 17 },
  bottomNav: { position: 'absolute', left: 15, right: 15, bottom: 13, height: 94, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', borderRadius: 31, borderWidth: 1.4, borderColor: '#F4C4DC', backgroundColor: COLORS.white, shadowColor: '#761046', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 13 }, elevation: 11 },
  navItem: { position: 'relative', flex: 1, height: 76, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navLabel: { color: COLORS.plum, fontFamily: 'FredokaMedium', fontSize: 13 },
  navLabelCompact: { fontSize: 11.5, letterSpacing: -0.15 },
  howNavItem: {
    height: 68,
    marginHorizontal: 3,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: '#F4A7CA',
    backgroundColor: '#FFE8F3',
    shadowColor: '#C91B70',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },
  howNavItemActive: { borderColor: COLORS.howHighlight, backgroundColor: COLORS.howHighlight },
  howNavLabel: { color: COLORS.howHighlight, fontFamily: 'FredokaSemiBold' },
  howNavLabelActive: { color: COLORS.white, fontFamily: 'FredokaBold' },
  myEventsNavLabel: { color: COLORS.myEvents, fontFamily: 'FredokaSemiBold' },
  myEventsNavLabelActive: { color: COLORS.myEvents, fontFamily: 'FredokaBold' },
  navLabelActive: { color: COLORS.brightPink, fontFamily: 'FredokaSemiBold' },
  activeIndicator: { position: 'absolute', left: 25, right: 25, bottom: -4, height: 4, borderRadius: 2, backgroundColor: COLORS.brightPink },
  howActiveIndicator: { backgroundColor: COLORS.white },
  myEventsActiveIndicator: { backgroundColor: COLORS.myEvents },
  pressed: { opacity: 0.92, transform: [{ translateY: 2 }, { scale: 0.99 }] },
});
