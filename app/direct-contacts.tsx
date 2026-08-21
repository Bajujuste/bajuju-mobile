import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { supabase } from '../src/lib/supabase';
import { sendBajujuPushNotification } from '../src/utils/bajujuNotifications';

type ContactType = 'telefono' | 'telegram';
type Direction = 'received' | 'sent';

type ContactRow = {
  id: string;
  requester_id: string | null;
  sender_id: string;
  receiver_id: string;
  activity_id: string | null;
  contact_type: ContactType;
  contact_value: string;
  message: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
};

type ContactView = ContactRow & {
  direction: Direction;
  otherName: string;
};

function statusLabel(status: string) {
  switch (status.toLowerCase()) {
    case 'accepted':
      return 'Accettato';
    case 'rejected':
    case 'declined':
      return 'Rifiutato';
    default:
      return 'In attesa';
  }
}

function contactLabel(type: ContactType) {
  return type === 'telefono' ? 'Telefono / WhatsApp' : 'Telegram';
}

export default function DirectContactsScreen() {
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('Utente Bajuju');
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadContacts = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error) throw authResult.error;

      const currentUserId = String(authResult.data.user?.id || '').trim();
      if (!currentUserId) throw new Error('Utente non autenticato.');
      setUserId(currentUserId);

      const profileResult = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', currentUserId)
        .maybeSingle();

      const currentName = String(profileResult.data?.nickname || 'Utente Bajuju').trim() || 'Utente Bajuju';
      setUserName(currentName);

      const [receivedResult, sentResult] = await Promise.all([
        supabase
          .from('direct_contact_requests')
          .select('id,requester_id,sender_id,receiver_id,activity_id,contact_type,contact_value,message,status,created_at,responded_at')
          .in('contact_type', ['telefono', 'telegram'])
          .eq('receiver_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('direct_contact_requests')
          .select('id,requester_id,sender_id,receiver_id,activity_id,contact_type,contact_value,message,status,created_at,responded_at')
          .in('contact_type', ['telefono', 'telegram'])
          .eq('requester_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (receivedResult.error) throw receivedResult.error;
      if (sentResult.error) throw sentResult.error;

      const received = (receivedResult.data || []) as ContactRow[];
      const sent = (sentResult.data || []) as ContactRow[];
      const otherIds = Array.from(new Set([
        ...received.map((row) => String(row.requester_id || row.sender_id || '')).filter(Boolean),
        ...sent.map((row) => String(row.receiver_id || '')).filter(Boolean),
      ]));

      const names = new Map<string, string>();
      if (otherIds.length > 0) {
        const profilesResult = await supabase
          .from('profiles')
          .select('id,nickname')
          .in('id', otherIds);

        if (!profilesResult.error) {
          (profilesResult.data || []).forEach((row: { id: string; nickname: string | null }) => {
            names.set(String(row.id), String(row.nickname || 'Utente Bajuju').trim() || 'Utente Bajuju');
          });
        }
      }

      const combined: ContactView[] = [
        ...received.map((row) => ({
          ...row,
          direction: 'received' as const,
          otherName: names.get(String(row.requester_id || row.sender_id || '')) || 'Utente Bajuju',
        })),
        ...sent.map((row) => ({
          ...row,
          direction: 'sent' as const,
          otherName: names.get(String(row.receiver_id || '')) || 'Utente Bajuju',
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setContacts(combined);
    } catch (error: unknown) {
      Alert.alert('Errore contatti', error instanceof Error ? error.message : 'Non sono riuscito a caricare i contatti.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadContacts();
    }, [loadContacts])
  );

  async function answerContact(contact: ContactView, status: 'accepted' | 'rejected') {
    if (contact.direction !== 'received' || busyId) return;
    setBusyId(contact.id);

    try {
      const updateResult = await supabase
        .from('direct_contact_requests')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', contact.id)
        .eq('receiver_id', userId)
        .select('id')
        .maybeSingle();

      if (updateResult.error || !updateResult.data) {
        throw updateResult.error || new Error('Richiesta non aggiornata.');
      }

      const requesterId = String(contact.requester_id || contact.sender_id || '').trim();
      if (requesterId) {
        await sendBajujuPushNotification({
          type: status === 'accepted' ? 'contact_accepted' : 'contact_rejected',
          actorUserId: userId,
          targetUserId: requesterId,
          title: status === 'accepted'
            ? `${userName} ha accettato il tuo contatto`
            : `${userName} ha rifiutato il tuo contatto`,
          body: status === 'accepted'
            ? `La condivisione ${contactLabel(contact.contact_type)} è stata accettata.`
            : `La condivisione ${contactLabel(contact.contact_type)} non è stata accettata.`,
          data: {
            screen: 'direct-contacts',
            requestId: contact.id,
            activityId: contact.activity_id || undefined,
          },
        });
      }

      await loadContacts();
    } catch (error: unknown) {
      Alert.alert('Errore', error instanceof Error ? error.message : 'Non sono riuscito ad aggiornare la richiesta.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Contatti diretti</Text>
          <Text style={styles.subtitle}>Telefono, WhatsApp e Telegram condivisi su Bajuju</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e43f98" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadContacts(true)} />}
        >
          {contacts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nessun contatto condiviso</Text>
              <Text style={styles.emptyText}>Dopo un’esperienza puoi scegliere se condividere Telefono/WhatsApp o Telegram con un altro partecipante.</Text>
            </View>
          ) : contacts.map((contact) => {
            const status = contact.status.toLowerCase();
            const isPending = status === 'pending';
            const isAccepted = status === 'accepted';
            const canSeeValue = contact.direction === 'sent' || isAccepted;

            return (
              <View key={`${contact.direction}-${contact.id}`} style={styles.card}>
                <Text style={styles.directionLabel}>{contact.direction === 'received' ? 'RICEVUTO' : 'INVIATO'}</Text>
                <Text style={styles.cardTitle}>
                  {contact.direction === 'received'
                    ? `${contact.otherName} vuole condividere un contatto`
                    : `Contatto condiviso con ${contact.otherName}`}
                </Text>
                <Text style={styles.typeLabel}>{contactLabel(contact.contact_type)}</Text>
                <Text style={[styles.status, isAccepted && styles.statusAccepted]}>{statusLabel(status)}</Text>

                {contact.message ? <Text style={styles.message}>{contact.message}</Text> : null}

                {canSeeValue ? (
                  <View style={styles.valueBox}>
                    <Text style={styles.valueLabel}>Contatto</Text>
                    <Text selectable style={styles.valueText}>{contact.contact_value}</Text>
                  </View>
                ) : (
                  <Text style={styles.hiddenText}>Il contatto sarà mostrato solo se accetti.</Text>
                )}

                {contact.direction === 'received' && isPending ? (
                  <View style={styles.actionsRow}>
                    <Pressable
                      style={styles.acceptButton}
                      onPress={() => void answerContact(contact, 'accepted')}
                      disabled={busyId === contact.id}
                    >
                      <Text style={styles.acceptText}>{busyId === contact.id ? 'Attendi…' : 'Accetta'}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.rejectButton}
                      onPress={() => void answerContact(contact, 'rejected')}
                      disabled={busyId === contact.id}
                    >
                      <Text style={styles.rejectText}>Rifiuta</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff7fb' },
  header: { minHeight: 76, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#8f1658', fontSize: 36, lineHeight: 38, marginTop: -4 },
  headerText: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 44 },
  title: { color: '#e43f98', fontSize: 24, fontWeight: '900' },
  subtitle: { marginTop: 2, color: '#a95d86', fontWeight: '700', fontSize: 11, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 15, paddingBottom: 36 },
  emptyCard: { padding: 26, borderRadius: 24, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc', alignItems: 'center' },
  emptyTitle: { color: '#e43f98', fontSize: 19, fontWeight: '900' },
  emptyText: { marginTop: 7, color: '#6b3652', lineHeight: 20, textAlign: 'center', fontWeight: '700' },
  card: { marginBottom: 12, padding: 16, borderRadius: 23, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc' },
  directionLabel: { color: '#a95d86', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  cardTitle: { marginTop: 4, color: '#4b1430', fontSize: 18, fontWeight: '900' },
  typeLabel: { marginTop: 7, color: '#e43f98', fontWeight: '900' },
  status: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#fff2f8', color: '#8f1658', fontWeight: '900', fontSize: 12 },
  statusAccepted: { backgroundColor: '#ecfdf3', color: '#18794e' },
  message: { marginTop: 10, color: '#6b3652', lineHeight: 20, fontWeight: '700' },
  valueBox: { marginTop: 12, padding: 13, borderRadius: 16, backgroundColor: '#fff8fb', borderWidth: 1, borderColor: '#f3c6dc' },
  valueLabel: { color: '#a95d86', fontWeight: '800', fontSize: 11 },
  valueText: { marginTop: 4, color: '#4b1430', fontWeight: '900', fontSize: 17 },
  hiddenText: { marginTop: 12, color: '#a95d86', fontWeight: '700', fontSize: 12 },
  actionsRow: { marginTop: 14, flexDirection: 'row', gap: 9 },
  acceptButton: { flex: 1, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e43f98' },
  acceptText: { color: '#ffffff', fontWeight: '900' },
  rejectButton: { flex: 1, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc' },
  rejectText: { color: '#8f1658', fontWeight: '900' },
});