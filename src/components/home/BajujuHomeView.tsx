import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
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
};

type NextExperience = {
  id: string;
  title: string;
  meta: string;
  organizedByMe?: boolean;
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
  nextExperience?: NextExperience | null;
  groups?: HomeGroupPreview[];
  onOpenNextExperience?: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onFind: () => void;
  onOpenHowItWorks: () => void;
  onCreate: () => void;
  onOpenMyEvents: () => void;
  onOpenGroups: () => void;
  onCreateGroup: () => void;
  onOpenGroup: (groupId: string) => void;
  onShare: () => void;
  onOpenRules: () => void;
  onOpenPrivacy: () => void;
  onLogout: () => void;
};

export function BajujuHomeView({
  profilePhotoUrl,
  unreadNotificationsCount,
  nextExperience,
  groups = [],
  onOpenNextExperience,
  onOpenNotifications,
  onOpenProfile,
  onFind,
  onOpenHowItWorks,
  onCreate,
  onOpenMyEvents,
  onOpenGroups,
  onCreateGroup,
  onOpenGroup,
  onShare,
  onOpenRules,
  onOpenPrivacy,
  onLogout,
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
              <BajujuIcon name="bell" size={25} color={COLORS.plum} />
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
              <Text style={styles.profileLabel}>Profilo</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.questionRow}>
            <View style={styles.questionAccent} />
            <Text style={styles.question}>COSA VUOI FARE OGGI?</Text>
          </View>

          <View style={styles.actionRow}>
            <ActionCard
              icon={<BajujuIcon name="search" size={39} color={COLORS.pink} />}
              title="Trova"
              description="Scopri le esperienze"
              accessibilityLabel="Trova esperienze"
              onPress={onFind}
            />
            <ActionCard
              icon={<BajujuIcon name="plus" size={40} color={COLORS.green} />}
              title="Crea"
              description="Proponi un’uscita"
              accessibilityLabel="Crea un'esperienza"
              accentColor={COLORS.green}
              accentBackground={COLORS.greenSoft}
              onPress={onCreate}
            />
          </View>

          <View style={styles.groupsSection}>
            <View style={styles.groupsHeader}>
              <View>
                <Text style={styles.groupsEyebrow}>COMMUNITY</Text>
                <Text style={styles.groupsTitle}>Gruppi Bajuju</Text>
              </View>
              <Pressable onPress={onOpenGroups} style={({ pressed }) => pressed && styles.pressed}>
                <Text style={styles.groupsSeeAll}>Vedi tutti ›</Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.groupsScroll}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Crea gruppo"
                onPress={onCreateGroup}
                style={({ pressed }) => [styles.groupCard, styles.createGroupCard, pressed && styles.pressed]}
              >
                <View style={styles.createGroupPlus}>
                  <BajujuIcon name="plus" size={42} color={COLORS.green} />
                </View>
                <Text style={styles.createGroupTitle}>Crea gruppo</Text>
                <Text style={styles.createGroupText}>Proponi la tua community</Text>
              </Pressable>

              {groups.map((group) => {
                const place = [group.city, group.province].filter(Boolean).join(' · ');
                return (
                  <Pressable
                    key={group.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Apri gruppo ${group.name}`}
                    onPress={() => onOpenGroup(group.id)}
                    style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}
                  >
                    {group.coverUrl ? (
                      <Image source={{ uri: group.coverUrl }} resizeMode="cover" style={styles.groupCover} />
                    ) : (
                      <View style={styles.groupIcon}>
                        <BajujuIcon name="group" size={28} color={COLORS.brightPink} />
                      </View>
                    )}
                    <Text style={styles.groupName} numberOfLines={2}>{group.name}</Text>
                    {place ? <Text style={styles.groupPlace} numberOfLines={1}>{place}</Text> : null}
                    <Text style={styles.groupMembers}>
                      {group.memberCount} {group.memberCount === 1 ? 'iscritto' : 'iscritti'}
                    </Text>
                    {group.joinedByMe ? <Text style={styles.groupJoined}>Sei iscritto</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {nextExperience ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri la tua prossima esperienza: ${nextExperience.title}`}
              onPress={onOpenNextExperience}
              style={({ pressed }) => [styles.nextExperienceCard, pressed && styles.pressed]}
            >
              <View style={styles.nextExperienceIcon}>
                <BajujuIcon name="pin" size={26} color={COLORS.brightPink} />
              </View>
              <View style={styles.nextExperienceCopy}>
                <Text style={styles.nextExperienceEyebrow}>LA TUA PROSSIMA ESPERIENZA</Text>
                <Text style={styles.nextExperienceTitle} numberOfLines={2}>{nextExperience.title}</Text>
                <Text style={styles.nextExperienceMeta} numberOfLines={2}>{nextExperience.meta}</Text>
                {nextExperience.organizedByMe ? <Text style={styles.nextExperienceRole}>La organizzi tu</Text> : null}
              </View>
              <View style={styles.nextExperienceArrow}>
                <BajujuIcon name="arrow" size={24} color={COLORS.brightPink} />
              </View>
            </Pressable>
          ) : null}

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Con Bajuju puoi</Text>
            <InfoItem icon="group" text="Entrare in gruppi con persone che condividono i tuoi interessi." />
            <InfoItem icon="pin" text="Trovare esperienze vicino alla tua zona." />
            <InfoItem icon="plus" text="Creare nuove esperienze e viverle dal vivo." />
          </View>

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

            <View style={styles.legalLinksRow}>
              <Pressable accessibilityRole="link" onPress={onOpenRules} style={({ pressed }) => [styles.legalButton, pressed && styles.pressed]}>
                <Text style={styles.legalButtonText}>Regole community</Text>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={onOpenPrivacy} style={({ pressed }) => [styles.legalButton, pressed && styles.pressed]}>
                <Text style={styles.legalButtonText}>Privacy Policy</Text>
              </Pressable>
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel="Esci dall'account" onPress={onLogout} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Esci dall’account</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomNav, { bottom: Math.max(13, insets.bottom + 7) }]}>
        <NavItem active icon="home" label="Home" onPress={() => undefined} />
        <NavItem icon="info" label="Come funziona" onPress={onOpenHowItWorks} />
        <NavItem icon="calendar" label="I miei eventi" onPress={onOpenMyEvents} />
        <NavItem icon="person" label="Profilo" onPress={onOpenProfile} />
      </View>
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
  header: { minHeight: 86, paddingHorizontal: 22, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panda: { width: 48, height: 52 },
  brand: { color: COLORS.pink, fontFamily: 'FredokaBold', fontSize: 35, letterSpacing: -1.4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundButton: { position: 'relative', width: 49, height: 49, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, borderWidth: 1.4, borderColor: '#F4C4DC', shadowColor: '#761046', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 9 }, elevation: 7 },
  notificationBadge: { position: 'absolute', right: -4, top: -4, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brightPink, borderWidth: 2, borderColor: COLORS.white },
  notificationBadgeText: { color: COLORS.white, fontFamily: 'FredokaBold', fontSize: 10, lineHeight: 12 },
  profileButton: { height: 49, paddingHorizontal: 13, borderRadius: 25, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.white, borderWidth: 1.4, borderColor: '#F4C4DC', shadowColor: '#761046', shadowOpacity: 0.17, shadowRadius: 13, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  profilePhoto: { width: 25, height: 25, borderRadius: 13, backgroundColor: COLORS.softPink },
  profileLabel: { color: COLORS.pink, fontFamily: 'FredokaSemiBold', fontSize: 16 },
  content: { paddingHorizontal: 22 },
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
  groupsSection: { marginTop: 18, marginHorizontal: -22 },
  groupsHeader: { paddingHorizontal: 22, marginBottom: 11, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  groupsEyebrow: { color: COLORS.muted, fontFamily: 'FredokaBold', fontSize: 11, letterSpacing: 0.8 },
  groupsTitle: { marginTop: 2, color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 25, letterSpacing: -0.4 },
  groupsSeeAll: { color: COLORS.brightPink, fontFamily: 'FredokaSemiBold', fontSize: 13 },
  groupsScroll: { paddingHorizontal: 22, paddingBottom: 4, gap: 11 },
  groupCard: { width: 154, minHeight: 205, padding: 15, borderRadius: 25, borderWidth: 1.6, borderColor: '#F2BED7', backgroundColor: COLORS.white, shadowColor: '#761046', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 11 }, elevation: 8 },
  createGroupCard: { borderColor: '#9EDDBC', backgroundColor: '#F6FCF8', alignItems: 'center', justifyContent: 'center', shadowColor: '#167A49' },
  createGroupPlus: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.greenSoft, borderWidth: 1, borderColor: '#D8F3E4', shadowColor: '#188451', shadowOpacity: 0.17, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 6 },
  createGroupTitle: { marginTop: 14, color: COLORS.green, fontFamily: 'FredokaBold', fontSize: 20, textAlign: 'center' },
  createGroupText: { marginTop: 6, color: '#4E8E68', fontFamily: 'FredokaMedium', fontSize: 12, lineHeight: 16, textAlign: 'center' },
  groupCover: { width: '100%', height: 70, borderRadius: 17, backgroundColor: COLORS.softPink, borderWidth: 1, borderColor: '#F8D7E8' },
  groupIcon: { width: 47, height: 47, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink },
  groupName: { marginTop: 10, color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 17, lineHeight: 20 },
  groupPlace: { marginTop: 5, color: COLORS.muted, fontFamily: 'FredokaMedium', fontSize: 11 },
  groupMembers: { marginTop: 7, color: COLORS.brightPink, fontFamily: 'FredokaSemiBold', fontSize: 11 },
  groupJoined: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, overflow: 'hidden', color: COLORS.brightPink, backgroundColor: COLORS.softPink, fontFamily: 'FredokaSemiBold', fontSize: 10 },
  groupsEmpty: { marginHorizontal: 22, minHeight: 101, padding: 15, borderRadius: 26, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.white, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupsEmptyIcon: { width: 52, height: 52, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink },
  groupsEmptyCopy: { flex: 1 },
  groupsEmptyTitle: { color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 16 },
  groupsEmptyText: { marginTop: 3, color: COLORS.muted, fontFamily: 'FredokaMedium', fontSize: 12, lineHeight: 16 },
  nextExperienceCard: { position: 'relative', marginTop: 18, minHeight: 128, padding: 17, paddingRight: 55, borderRadius: 29, borderWidth: 1.6, borderColor: '#E7C56A', backgroundColor: '#FFF9E7', flexDirection: 'row', alignItems: 'center', gap: 13, shadowColor: '#6F5100', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 7 },
  nextExperienceIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#F0D58E', shadowColor: '#8A6700', shadowOpacity: 0.14, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  nextExperienceCopy: { flex: 1 },
  nextExperienceEyebrow: { color: '#8A6700', fontFamily: 'FredokaBold', fontSize: 11, letterSpacing: 0.7 },
  nextExperienceTitle: { marginTop: 4, color: COLORS.plum, fontFamily: 'FredokaBold', fontSize: 20, lineHeight: 23 },
  nextExperienceMeta: { marginTop: 4, color: COLORS.muted, fontFamily: 'FredokaMedium', fontSize: 13, lineHeight: 18 },
  nextExperienceRole: { alignSelf: 'flex-start', marginTop: 7, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FFF1B8', color: '#7A5A00', fontFamily: 'FredokaSemiBold', fontSize: 11, overflow: 'hidden' },
  nextExperienceArrow: { position: 'absolute', right: 15, top: 39, width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#8A6700', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  infoCard: { marginTop: 20, padding: 22, borderRadius: 29, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.white, shadowColor: '#761046', shadowOpacity: 0.13, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  infoTitle: { marginBottom: 15, color: COLORS.brightPink, fontFamily: 'FredokaBold', fontSize: 29, letterSpacing: -0.6 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  infoIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.softPink },
  infoText: { flex: 1, color: COLORS.plum, fontFamily: 'FredokaSemiBold', fontSize: 16, lineHeight: 21 },
  footer: { alignItems: 'center', paddingTop: 18, paddingBottom: 20 },
  shareButton: { minHeight: 58, paddingHorizontal: 28, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: COLORS.brightPink, shadowColor: '#9B1A5B', shadowOpacity: 0.18, shadowRadius: 13, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  shareText: { color: COLORS.white, fontFamily: 'FredokaBold', fontSize: 17 },
  legalLinksRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  legalButton: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 23, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.white },
  legalButtonText: { color: COLORS.plum, fontFamily: 'FredokaSemiBold', fontSize: 14 },
  logoutButton: { marginTop: 17, paddingHorizontal: 16, paddingVertical: 10 },
  logoutText: { color: COLORS.muted, fontFamily: 'FredokaSemiBold', fontSize: 14, textDecorationLine: 'underline' },
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