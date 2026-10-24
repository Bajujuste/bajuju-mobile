import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../../lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';
import { KeyboardAwareScrollView } from '../KeyboardAwareScrollView';

type PollRow = {
  id: string;
  question: string;
  options: string[];
  created_by: string;
  creator_nickname: string;
  closed_at: string | null;
  vote_counts: number[];
  total_votes: number;
  my_vote: number | null;
  can_manage: boolean;
};

type Props = {
  groupId: string;
  currentUserId: string;
  canUsePolls: boolean;
};

const MAX_OPTIONS = 4;
const QUESTION_MAX_LENGTH = 140;
const OPTION_MAX_LENGTH = 80;
const EMPTY_OPTIONS = ['', '', '', ''];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String((error as any)?.message || 'Riprova tra poco.');
}

export function BajujuGroupPolls({ groupId, currentUserId, canUsePolls }: Props) {
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [voteBusyId, setVoteBusyId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [questionDraft, setQuestionDraft] = useState('');
  const [optionDrafts, setOptionDrafts] = useState<string[]>(EMPTY_OPTIONS);

  const loadPolls = useCallback(async () => {
    if (!groupId || !currentUserId || !canUsePolls) {
      setPolls([]);
      return;
    }

    setLoading(true);
    try {
      const result = await supabase.rpc('get_group_polls' as any, { p_group_id: groupId });
      if (result.error) throw result.error;
      setPolls(((result.data || []) as any[]).map((row) => ({
        id: String(row.id),
        question: String(row.question || ''),
        options: (row.options || []).map(String),
        created_by: String(row.created_by || ''),
        creator_nickname: String(row.creator_nickname || 'Utente Bajuju'),
        closed_at: row.closed_at || null,
        vote_counts: (row.vote_counts || []).map(Number),
        total_votes: Number(row.total_votes || 0),
        my_vote: row.my_vote === null || row.my_vote === undefined ? null : Number(row.my_vote),
        can_manage: row.can_manage === true,
      })));
    } catch (error) {
      console.log('Errore sondaggi gruppo:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, currentUserId, canUsePolls]);

  useEffect(() => {
    void loadPolls();
  }, [loadPolls]);

  async function vote(poll: PollRow, optionIndex: number) {
    if (voteBusyId || poll.closed_at || poll.my_vote === optionIndex) return;

    setVoteBusyId(poll.id);
    try {
      const result = await supabase.rpc('vote_group_poll' as any, {
        p_poll_id: poll.id,
        p_option_index: optionIndex,
      });
      if (result.error) throw result.error;
      await loadPolls();
    } catch (error) {
      Alert.alert('Voto non registrato', errorMessage(error));
    } finally {
      setVoteBusyId('');
    }
  }

  function managePoll(poll: PollRow) {
    const runAction = (action: 'close' | 'delete') => {
      void (async () => {
        try {
          const result = await supabase.rpc('manage_group_poll' as any, { p_poll_id: poll.id, p_action: action });
          if (result.error) throw result.error;
          await loadPolls();
        } catch (error) {
          Alert.alert('Operazione non riuscita', errorMessage(error));
        }
      })();
    };

    Alert.alert('Gestisci sondaggio', poll.question, [
      { text: 'Annulla', style: 'cancel' },
      ...(poll.closed_at ? [] : [{ text: 'Chiudi votazione', onPress: () => runAction('close') }]),
      { text: 'Elimina sondaggio', style: 'destructive' as const, onPress: () => runAction('delete') },
    ]);
  }

  function closeCreate() {
    if (createBusy) return;
    setCreateOpen(false);
  }

  async function publishPoll() {
    const question = questionDraft.trim();
    const options = optionDrafts.map((option) => option.trim()).filter(Boolean);

    if (question.length < 3) {
      Alert.alert('Domanda mancante', 'Scrivi la domanda del sondaggio.');
      return;
    }
    if (options.length < 2) {
      Alert.alert('Servono almeno 2 risposte', 'Scrivi almeno due risposte tra cui scegliere.');
      return;
    }
    if (new Set(options.map((option) => option.toLowerCase())).size < options.length) {
      Alert.alert('Risposte uguali', 'Le risposte devono essere diverse tra loro.');
      return;
    }

    setCreateBusy(true);
    try {
      const result = await supabase.rpc('create_group_poll' as any, {
        p_group_id: groupId,
        p_question: question,
        p_options: options,
      });
      if (result.error) throw result.error;
      setCreateOpen(false);
      setQuestionDraft('');
      setOptionDrafts(EMPTY_OPTIONS);
      await loadPolls();
    } catch (error) {
      Alert.alert('Sondaggio non pubblicato', errorMessage(error));
    } finally {
      setCreateBusy(false);
    }
  }

  if (!canUsePolls) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Sondaggi</Text>
      <Text style={styles.helper}>Vota toccando una risposta. Puoi cambiare idea finché è aperto.</Text>

      {loading && polls.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={BAJUJU_COLORS.brightPink} />
      ) : null}

      {polls.map((poll) => {
        const closed = Boolean(poll.closed_at);
        const busy = voteBusyId === poll.id;
        return (
          <View key={poll.id} style={styles.pollCard}>
            <View style={styles.pollHeader}>
              <Text style={styles.pollEyebrow} numberOfLines={1}>
                {`SONDAGGIO · DI ${poll.created_by === currentUserId ? 'TE' : poll.creator_nickname.toUpperCase()}`}
              </Text>
              {poll.can_manage ? (
                <Pressable
                  style={styles.manageButton}
                  onPress={() => managePoll(poll)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Gestisci sondaggio"
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={BAJUJU_COLORS.muted} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.pollQuestion}>{poll.question}</Text>

            {poll.options.map((option, index) => {
              const count = poll.vote_counts[index] || 0;
              const percent = poll.total_votes > 0 ? Math.round((count / poll.total_votes) * 100) : 0;
              const selected = poll.my_vote === index;
              return (
                <Pressable
                  key={`${poll.id}-${index}`}
                  style={[styles.option, selected && styles.optionSelected, (busy || closed) && styles.optionLocked]}
                  disabled={busy || closed}
                  onPress={() => { void vote(poll, index); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: busy || closed }}
                >
                  <View style={[styles.optionBar, selected && styles.optionBarSelected, { width: `${percent}%` }]} />
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={2}>
                    {selected ? '✓ ' : ''}{option}
                  </Text>
                  <Text style={[styles.optionPercent, selected && styles.optionTextSelected]}>{percent}%</Text>
                </Pressable>
              );
            })}

            <Text style={styles.pollMeta}>
              {`${poll.total_votes} ${poll.total_votes === 1 ? 'voto' : 'voti'} · ${closed ? 'chiuso' : 'aperto'}`}
            </Text>
          </View>
        );
      })}

      <Pressable style={styles.createButton} onPress={() => setCreateOpen(true)} accessibilityRole="button">
        <Text style={styles.createButtonText}>+ Crea un sondaggio</Text>
      </Pressable>

      <Modal visible={createOpen} animationType="slide" onRequestClose={closeCreate}>
        <SafeAreaView style={styles.modalSafeArea}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Nuovo sondaggio</Text>
              <Pressable
                style={styles.modalClose}
                onPress={closeCreate}
                accessibilityRole="button"
                accessibilityLabel="Chiudi"
              >
                <Ionicons name="close" size={20} color={BAJUJU_COLORS.plum} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Domanda</Text>
            <TextInput
              value={questionDraft}
              onChangeText={setQuestionDraft}
              maxLength={QUESTION_MAX_LENGTH}
              multiline
              style={[styles.input, styles.questionInput]}
              placeholder="Es. Dove facciamo la cena di novembre?"
              placeholderTextColor={BAJUJU_COLORS.muted}
            />

            <Text style={styles.fieldLabel}>Risposte (da 2 a {MAX_OPTIONS})</Text>
            {optionDrafts.map((value, index) => (
              <TextInput
                key={index}
                value={value}
                onChangeText={(text) => setOptionDrafts((current) => current.map((item, i) => (i === index ? text : item)))}
                maxLength={OPTION_MAX_LENGTH}
                style={[styles.input, styles.optionInput]}
                placeholder={index < 2 ? `Risposta ${index + 1}` : `Risposta ${index + 1} (facoltativa)`}
                placeholderTextColor={BAJUJU_COLORS.muted}
              />
            ))}

            <Pressable
              style={[styles.publishButton, createBusy && styles.disabled]}
              disabled={createBusy}
              onPress={() => { void publishPoll(); }}
            >
              <Text style={styles.publishButtonText}>{createBusy ? 'Pubblico...' : 'Pubblica sondaggio'}</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} disabled={createBusy} onPress={closeCreate}>
              <Text style={styles.cancelButtonText}>Annulla</Text>
            </Pressable>
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 10 },
  sectionTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 20 },
  helper: { marginTop: 4, marginBottom: 11, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  loader: { marginVertical: 12 },
  pollCard: { marginBottom: 12, padding: 15, borderRadius: 22, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff' },
  pollHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pollEyebrow: { flex: 1, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 10, letterSpacing: 0.8 },
  manageButton: { paddingHorizontal: 4 },
  pollQuestion: { marginTop: 3, marginBottom: 10, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  option: { minHeight: 46, marginBottom: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden', backgroundColor: '#fff' },
  optionSelected: { borderColor: BAJUJU_COLORS.brightPink },
  optionLocked: { opacity: 0.85 },
  optionBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BAJUJU_COLORS.softPink },
  optionBarSelected: { backgroundColor: BAJUJU_COLORS.palePink },
  optionText: { flex: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  optionTextSelected: { fontFamily: BAJUJU_FONTS.bold },
  optionPercent: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  pollMeta: { marginTop: 4, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  createButton: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  createButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  modalSafeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  modalContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40 },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 24 },
  modalClose: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.softPink },
  fieldLabel: { marginTop: 18, marginBottom: 7, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, color: BAJUJU_COLORS.plum, backgroundColor: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.medium, fontSize: 15 },
  questionInput: { minHeight: 76, paddingTop: 14, textAlignVertical: 'top' },
  optionInput: { marginBottom: 9 },
  publishButton: { minHeight: 50, marginTop: 16, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  publishButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  cancelButton: { minHeight: 48, marginTop: 10, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  cancelButtonText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  disabled: { opacity: 0.5 },
});
