import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
  line: '#F3C6DC',
  plum: '#4B0C2D',
  muted: '#A95D86',
};

type BajujuHomeViewProps = {
  profilePhotoUrl: string;
  unreadNotificationsCount: number;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onFind: () => void;
  onCreate: () => void;
  onFlash: () => void;
  onShare: () => void;
  onOpenRules: () => void;
  onOpenPrivacy: () => void;
  onLogout: () => void;
};

export function BajujuHomeView({
  profilePhotoUrl,
  unreadNotificationsCount,
  onOpenNotifications,
  onOpenProfile,
  onFind,
  onCreate,
  onFlash,
  onShare,
  onOpenRules,
  onOpenPrivacy,
  onLogout,
}: BajujuHomeViewProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
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
              style={({ pressed }) => [
                styles.roundButton,
                pressed && styles.pressed,
              ]}
            >
              <BajujuIcon
                name="bell"
                size={25}
                color={COLORS.plum}
              />

              {unreadNotificationsCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadNotificationsCount > 99
                      ? '99+'
                      : unreadNotificationsCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apri il profilo"
              onPress={onOpenProfile}
              style={({ pressed }) => [
                styles.profileButton,
                pressed && styles.pressed,
              ]}
            >
              {profilePhotoUrl ? (
                <Image
                  source={{ uri: profilePhotoUrl }}
                  resizeMode="cover"
                  style={styles.profilePhoto}
                />
              ) : (
                <BajujuIcon
                  name="person"
                  size={22}
                  color={COLORS.pink}
                />
              )}
              <Text style={styles.profileLabel}>Profilo</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.hero}>
            <View style={[styles.heroBlob, styles.heroBlobTop]} />
            <View style={[styles.heroBlob, styles.heroBlobBottom]} />
            <Text style={[styles.doodle, styles.doodleLeft]}>‹‹</Text>
            <Text style={[styles.doodle, styles.doodleRight]}>✦</Text>

            <Text style={styles.claimTop}>Dal Vivo è</Text>
            <Text style={styles.claimBottom}>Meglio</Text>
            <Text style={styles.heroCopy}>
              Trova persone, crea esperienze{'\n'}e organizza qualcosa subito.
            </Text>
          </View>

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
              icon={
                <BajujuIcon
                  name="plus"
                  size={40}
                  color={COLORS.pink}
                />
              }
              title="Crea"
              description="Proponi un’uscita"
              accessibilityLabel="Crea un'esperienza"
              onPress={onCreate}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apri Bajuju Flash"
            onPress={onFlash}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <LinearGradient
              colors={['#E83391', '#F32189', '#E43F98']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.flash}
            >
              <View style={styles.flashBubbleTop} />
              <View style={styles.flashBubbleBottom} />

              <View style={styles.flashIcon}>
                <BajujuIcon
                  name="bolt"
                  size={51}
                  color={COLORS.brightPink}
                />
              </View>

              <View style={styles.flashCopy}>
                <View style={styles.flashBadge}>
                  <Text style={styles.flashBadgeText}>Subito</Text>
                </View>
                <Text style={styles.flashTitle}>Bajuju Flash</Text>
                <Text style={styles.flashSubtitle}>
                  Fatti vedere ed esci subito.
                </Text>
              </View>

              <View style={styles.flashArrow}>
                <BajujuIcon
                  name="arrow"
                  size={28}
                  color={COLORS.brightPink}
                />
              </View>
            </LinearGradient>
          </Pressable>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Con Bajuju puoi</Text>

            <InfoItem
              icon="group"
              text="Conoscere persone facendo qualcosa dal vivo."
            />
            <InfoItem
              icon="pin"
              text="Trovare esperienze vicino alla tua zona."
            />
            <InfoItem
              icon="bolt"
              text="Organizzare subito con Bajuju Flash."
            />
          </View>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Condividi Bajuju"
              onPress={onShare}
              style={({ pressed }) => [
                styles.shareButton,
                pressed && styles.pressed,
              ]}
            >
              <BajujuIcon name="share" size={22} color={COLORS.white} />
              <Text style={styles.shareText}>Condividi Bajuju</Text>
            </Pressable>

            <View style={styles.legalLinksRow}>
              <Pressable
                accessibilityRole="link"
                onPress={onOpenRules}
                style={({ pressed }) => [
                  styles.legalButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.legalButtonText}>Regole community</Text>
              </Pressable>

              <Pressable
                accessibilityRole="link"
                onPress={onOpenPrivacy}
                style={({ pressed }) => [
                  styles.legalButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.legalButtonText}>Privacy Policy</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Esci dall'account"
              onPress={onLogout}
              style={styles.logoutButton}
            >
              <Text style={styles.logoutText}>Esci dall’account</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        <NavItem active icon="home" label="Home" onPress={() => undefined} />
        <NavItem icon="search" label="Trova" onPress={onFind} />
        <NavItem icon="bolt" label="Flash" onPress={onFlash} />
        <NavItem
          icon="person"
          label="Profilo"
          onPress={onOpenProfile}
        />
      </View>
    </SafeAreaView>
  );
}

type ActionCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  accessibilityLabel: string;
  onPress: () => void;
};

function ActionCard({
  icon,
  title,
  description,
  accessibilityLabel,
  onPress,
}: ActionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.iconBlob}>{icon}</View>
      <Text style={styles.actionTitle}>{title}</Text>
      <View style={styles.titleUnderline} />
      <Text style={styles.actionDescription}>{description}</Text>
      <View style={styles.cardArrow}>
        <BajujuIcon name="arrow" size={23} color={COLORS.brightPink} />
      </View>
    </Pressable>
  );
}

type InfoItemProps = {
  icon: BajujuIconName;
  text: string;
};

function InfoItem({ icon, text }: InfoItemProps) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}>
        <BajujuIcon
          name={icon}
          size={24}
          color={COLORS.brightPink}
        />
      </View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

type NavItemProps = {
  active?: boolean;
  icon: BajujuIconName;
  label: string;
  onPress: () => void;
};

function NavItem({ active = false, icon, label, onPress }: NavItemProps) {
  const color = active ? COLORS.brightPink : COLORS.plum;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
    >
      <BajujuIcon name={icon} size={28} color={color} />
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>
        {label}
      </Text>
      {active ? <View style={styles.activeIndicator} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: 138,
  },
  header: {
    minHeight: 86,
    paddingHorizontal: 22,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panda: {
    width: 48,
    height: 52,
  },
  brand: {
    color: COLORS.pink,
    fontFamily: 'FredokaBold',
    fontSize: 35,
    letterSpacing: -1.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roundButton: {
    position: 'relative',
    width: 49,
    height: 49,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#F7D7E7',
    shadowColor: '#8C124E',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  notificationBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.brightPink,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  notificationBadgeText: {
    color: COLORS.white,
    fontFamily: 'FredokaBold',
    fontSize: 10,
    lineHeight: 12,
  },
  profileButton: {
    height: 49,
    paddingHorizontal: 13,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#F7D7E7',
  },
  profilePhoto: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: COLORS.softPink,
  },
  profileLabel: {
    color: COLORS.pink,
    fontFamily: 'FredokaSemiBold',
    fontSize: 16,
  },
  content: {
    paddingHorizontal: 22,
  },
  hero: {
    height: 193,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 31,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: 'rgba(255,255,255,0.86)',
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroBlob: {
    position: 'absolute',
    width: 100,
    height: 72,
    borderRadius: 50,
    backgroundColor: COLORS.palePink,
    opacity: 0.75,
  },
  heroBlobTop: {
    left: -25,
    top: -24,
    transform: [{ rotate: '-18deg' }],
  },
  heroBlobBottom: {
    right: -34,
    bottom: -28,
    transform: [{ rotate: '18deg' }],
  },
  doodle: {
    position: 'absolute',
    zIndex: 2,
    color: COLORS.brightPink,
    fontFamily: 'FredokaBold',
  },
  doodleLeft: {
    left: 34,
    top: 84,
    fontSize: 25,
    transform: [{ rotate: '-8deg' }],
  },
  doodleRight: {
    right: 29,
    top: 27,
    fontSize: 24,
    transform: [{ rotate: '8deg' }],
  },
  claimTop: {
    zIndex: 1,
    color: COLORS.plum,
    fontFamily: 'FredokaBold',
    fontSize: 42,
    lineHeight: 43,
    letterSpacing: -1.2,
  },
  claimBottom: {
    zIndex: 1,
    marginTop: -1,
    color: COLORS.brightPink,
    fontFamily: 'FredokaBold',
    fontSize: 55,
    lineHeight: 54,
    letterSpacing: -1.2,
  },
  heroCopy: {
    zIndex: 1,
    marginTop: 8,
    color: COLORS.plum,
    fontFamily: 'FredokaMedium',
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  questionRow: {
    height: 69,
    paddingTop: 22,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  questionAccent: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.pink,
    transform: [{ rotate: '7deg' }],
  },
  question: {
    color: COLORS.plum,
    fontFamily: 'FredokaBold',
    fontSize: 24,
    letterSpacing: 0.2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 13,
  },
  actionCard: {
    position: 'relative',
    flex: 1,
    height: 206,
    padding: 18,
    overflow: 'hidden',
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  iconBlob: {
    width: 62,
    height: 62,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.softPink,
  },
  actionTitle: {
    marginTop: 12,
    color: COLORS.brightPink,
    fontFamily: 'FredokaBold',
    fontSize: 29,
    lineHeight: 31,
    letterSpacing: -0.6,
  },
  titleUnderline: {
    width: 24,
    height: 3,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 2,
    backgroundColor: COLORS.brightPink,
  },
  actionDescription: {
    color: COLORS.plum,
    fontFamily: 'FredokaSemiBold',
    fontSize: 13.5,
    lineHeight: 16,
  },
  cardArrow: {
    position: 'absolute',
    right: 14,
    bottom: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.softPink,
  },
  flash: {
    position: 'relative',
    height: 125,
    marginTop: 14,
    paddingLeft: 108,
    paddingRight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 29,
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  flashBubbleTop: {
    position: 'absolute',
    right: 52,
    top: -45,
    width: 105,
    height: 105,
    borderRadius: 53,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  flashBubbleBottom: {
    position: 'absolute',
    left: 83,
    bottom: -58,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  flashIcon: {
    position: 'absolute',
    left: 18,
    top: 26,
    width: 73,
    height: 73,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  flashCopy: {
    alignItems: 'flex-start',
  },
  flashBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  flashBadgeText: {
    color: COLORS.brightPink,
    fontFamily: 'FredokaSemiBold',
    fontSize: 13,
  },
  flashTitle: {
    marginTop: 5,
    color: COLORS.white,
    fontFamily: 'FredokaBold',
    fontSize: 30,
    lineHeight: 31,
    letterSpacing: -0.7,
  },
  flashSubtitle: {
    marginTop: 3,
    color: COLORS.white,
    fontFamily: 'FredokaMedium',
    fontSize: 13,
  },
  flashArrow: {
    position: 'absolute',
    right: 17,
    top: 38,
    width: 49,
    height: 49,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  infoCard: {
    marginTop: 20,
    padding: 22,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
  },
  infoTitle: {
    marginBottom: 15,
    color: COLORS.brightPink,
    fontFamily: 'FredokaBold',
    fontSize: 29,
    letterSpacing: -0.6,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.softPink,
  },
  infoText: {
    flex: 1,
    color: COLORS.plum,
    fontFamily: 'FredokaSemiBold',
    fontSize: 16,
    lineHeight: 21,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 20,
  },
  shareButton: {
    minHeight: 58,
    paddingHorizontal: 28,
    borderRadius: 29,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: COLORS.brightPink,
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.18,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  shareText: {
    color: COLORS.white,
    fontFamily: 'FredokaBold',
    fontSize: 17,
  },
  legalLinksRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  legalButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
  },
  legalButtonText: {
    color: COLORS.plum,
    fontFamily: 'FredokaSemiBold',
    fontSize: 14,
  },
  logoutButton: {
    marginTop: 17,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  logoutText: {
    color: COLORS.muted,
    fontFamily: 'FredokaSemiBold',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  bottomNav: {
    position: 'absolute',
    left: 15,
    right: 15,
    bottom: 13,
    height: 94,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 31,
    borderWidth: 1,
    borderColor: '#F8D7E8',
    backgroundColor: COLORS.white,
    shadowColor: '#761046',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  navItem: {
    position: 'relative',
    flex: 1,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navLabel: {
    color: COLORS.plum,
    fontFamily: 'FredokaMedium',
    fontSize: 13,
  },
  navLabelActive: {
    color: COLORS.brightPink,
    fontFamily: 'FredokaSemiBold',
  },
  activeIndicator: {
    position: 'absolute',
    left: 25,
    right: 25,
    bottom: -4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.brightPink,
  },
  pressed: {
    opacity: 0.78,
  },
});
