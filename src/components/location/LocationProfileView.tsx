import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  BajujuLocation,
  LOCATION_COLOR,
  LOCATION_COLOR_SOFT,
  locationAddressLine,
  whatsappUrl,
} from '../../lib/bajujuLocations';
import { supabase } from '../../lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';
import { experienceDateLabel } from '../../utils/experienceDateLabel';

type EventRow = {
  id: string;
  title: string;
  activity_date: string | null;
  activity_time: string | null;
  photo_url: string | null;
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function loadLocationUpcomingEvents(ownerId: string): Promise<EventRow[]> {
  // location_owner_id non è ancora nei tipi generati del database.
  const activities: any = supabase.from('activities');
  const result = await activities
    .select('id,title,activity_date,activity_time,photo_url')
    .eq('location_owner_id', ownerId)
    .eq('is_flash', false)
    .is('deleted_at', null)
    .gte('activity_date', todayIso())
    .order('activity_date', { ascending: true })
    .order('activity_time', { ascending: true })
    .limit(20);

  if (result.error || !result.data) return [];
  return (result.data as any[]).map((row) => ({
    id: String(row.id || ''),
    title: String(row.title || 'Evento Bajuju'),
    activity_date: row.activity_date ?? null,
    activity_time: row.activity_time ?? null,
    photo_url: row.photo_url ?? null,
  })).filter((row) => row.id);
}

export function eventWhenText(date: string | null, time: string | null) {
  if (!date) return 'Data da definire';
  const cleanTime = time ? String(time).slice(0, 5) : '';
  const parsed = new Date(`${date}T${cleanTime || '12:00'}:00`);
  return experienceDateLabel(parsed, Boolean(cleanTime));
}

function openUrl(url: string) {
  void Linking.openURL(url).catch(() => console.log('Link non disponibile.'));
}

export function openLocationInMaps(location: BajujuLocation) {
  const query = `${location.name}, ${locationAddressLine(location)}`;
  openUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
}

type Props = {
  location: BajujuLocation;
  isOwner: boolean;
  footer?: React.ReactNode;
};

export function LocationProfileView({ location, isOwner, footer }: Props) {
  const { width } = useWindowDimensions();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoWidth = Math.max(width - 44, 200);

  useEffect(() => {
    let active = true;
    void loadLocationUpcomingEvents(location.ownerId).then((rows) => {
      if (active) setEvents(rows);
    });
    return () => { active = false; };
  }, [location.ownerId]);

  const links = [
    location.instagramUrl ? { key: 'instagram', icon: 'logo-instagram' as const, color: '#C13584', label: 'Instagram', url: location.instagramUrl } : null,
    location.facebookUrl ? { key: 'facebook', icon: 'logo-facebook' as const, color: '#1877F2', label: 'Facebook', url: location.facebookUrl } : null,
    location.websiteUrl ? { key: 'website', icon: 'globe-outline' as const, color: LOCATION_COLOR, label: 'Sito web', url: location.websiteUrl } : null,
    location.phone ? { key: 'phone', icon: 'call-outline' as const, color: BAJUJU_COLORS.plum, label: 'Chiama', url: `tel:${location.phone}` } : null,
    location.whatsapp ? { key: 'whatsapp', icon: 'logo-whatsapp' as const, color: '#25D366', label: 'WhatsApp', url: whatsappUrl(location.whatsapp) } : null,
  ].filter(Boolean) as { key: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string; url: string }[];

  return (
    <View>
      <View style={styles.card}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={[styles.gallery, { width: photoWidth }]}
          onMomentumScrollEnd={(event) => {
            setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / photoWidth));
          }}
        >
          {location.photos.map((photo, index) => (
            <Image
              key={`${photo}-${index}`}
              source={{ uri: photo }}
              style={[styles.galleryPhoto, { width: photoWidth }]}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
        {location.photos.length > 1 ? (
          <View style={styles.dots}>
            {location.photos.map((photo, index) => (
              <View key={`dot-${photo}-${index}`} style={[styles.dot, index === photoIndex && styles.dotActive]} />
            ))}
          </View>
        ) : null}

        <View style={styles.body}>
          <View style={styles.badge}>
            <Ionicons name="home" size={13} color="#fff" />
            <Text style={styles.badgeText}>Location · {location.category}</Text>
          </View>
          <Text style={styles.name}>{location.name}</Text>
          {location.description ? <Text style={styles.description}>{location.description}</Text> : null}

          {links.length > 0 ? (
            <View style={styles.linksRow}>
              {links.map((link) => (
                <Pressable
                  key={link.key}
                  style={styles.linkButton}
                  onPress={() => openUrl(link.url)}
                  accessibilityRole="link"
                  accessibilityLabel={link.label}
                >
                  <Ionicons name={link.icon} size={24} color={link.color} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable style={styles.addressBox} onPress={() => openLocationInMaps(location)} accessibilityRole="button">
            <Ionicons name="location-outline" size={22} color={LOCATION_COLOR} />
            <View style={styles.addressCopy}>
              <Text style={styles.addressText}>{locationAddressLine(location)}</Text>
              <Text style={styles.addressAction}>Apri in Maps</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={LOCATION_COLOR} />
          </Pressable>

          {isOwner ? (
            <Pressable style={styles.secondaryButton} onPress={() => router.push('/my-location' as any)}>
              <Text style={styles.secondaryButtonText}>Modifica il mio locale</Text>
            </Pressable>
          ) : null}

          {footer}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Prossimi eventi qui</Text>
          {events.length === 0 ? (
            <Text style={styles.emptyText}>Nessun evento in programma qui.</Text>
          ) : (
            events.map((event) => (
              <Pressable
                key={event.id}
                style={styles.eventRow}
                onPress={() => router.push(`/experience-detail?id=${encodeURIComponent(event.id)}`)}
              >
                {event.photo_url ? (
                  <Image source={{ uri: event.photo_url }} style={styles.eventPhoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.eventPhoto, styles.eventPhotoEmpty]}>
                    <Ionicons name="calendar-outline" size={20} color={LOCATION_COLOR} />
                  </View>
                )}
                <View style={styles.eventCopy}>
                  <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
                  <Text style={styles.eventMeta}>{eventWhenText(event.activity_date, event.activity_time)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={BAJUJU_COLORS.muted} />
              </Pressable>
            ))
          )}

          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push({ pathname: '/create-experience' as any, params: { locationId: location.ownerId } })}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Organizza un evento qui</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E4D2F5',
    marginBottom: 16,
    overflow: 'hidden',
  },
  gallery: { aspectRatio: 4 / 3, backgroundColor: LOCATION_COLOR_SOFT },
  galleryPhoto: { height: '100%' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E4D2F5' },
  dotActive: { backgroundColor: LOCATION_COLOR },
  body: { padding: 20 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: LOCATION_COLOR,
    marginBottom: 10,
  },
  badgeText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  name: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 28, marginBottom: 6 },
  description: { color: '#6b3652', fontFamily: BAJUJU_FONTS.medium, fontSize: 15, lineHeight: 21, marginBottom: 6 },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, marginBottom: 4 },
  linkButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E4D2F5',
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: LOCATION_COLOR_SOFT,
  },
  addressCopy: { flex: 1, minWidth: 0 },
  addressText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 15 },
  addressAction: { marginTop: 2, color: LOCATION_COLOR, fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  secondaryButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: LOCATION_COLOR,
  },
  secondaryButtonText: { color: LOCATION_COLOR, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  sectionTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 20, marginBottom: 12 },
  emptyText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, marginBottom: 6 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8FB',
  },
  eventPhoto: { width: 56, height: 56, borderRadius: 14, backgroundColor: LOCATION_COLOR_SOFT },
  eventPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  eventCopy: { flex: 1, minWidth: 0 },
  eventTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  eventMeta: { marginTop: 3, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13 },
  primaryButton: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 26,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LOCATION_COLOR,
  },
  primaryButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
});
