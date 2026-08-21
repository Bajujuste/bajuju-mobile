const fs = require('fs');
const { execSync } = require('child_process');

const expectedBranch = 'fix/find-all-events-interactions';
const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
if (branch !== expectedBranch) {
  throw new Error(`Ramo errato: ${branch}. Atteso: ${expectedBranch}`);
}

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(content, from, to, label) {
  const first = content.indexOf(from);
  if (first < 0) throw new Error(`Marker non trovato: ${label}`);
  if (content.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Marker duplicato: ${label}`);
  }
  return content.slice(0, first) + to + content.slice(first + from.length);
}

// 1) TROVA: 4 tab distinti + sezione "Tutti gli eventi" oltre 25 km, 20 alla volta.
{
  const path = 'app/experiences.tsx';
  let s = read(path);

  s = replaceOnce(
    s,
    "type Mode = 'nearby' | 'joined' | 'past';",
    "type Mode = 'nearby' | 'joined' | 'organized' | 'past';",
    'Mode organized'
  );

  s = replaceOnce(
    s,
    '  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);',
    '  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);\n  const [allEventsVisibleCount, setAllEventsVisibleCount] = useState(PAGE_SIZE);',
    'allEventsVisibleCount state'
  );

  s = replaceOnce(
    s,
    '  }, [activities, coordinates]);\n\n  const joinedActivities = useMemo(() => {',
    `  }, [activities, coordinates]);

  const allEventsActivities = useMemo<ExperienceWithDistance[]>(() => {
    const now = Date.now();

    return activities
      .filter((row) => {
        const moment = activityMoment(row);
        return !moment || moment.getTime() >= now;
      })
      .map((row) => {
        const target = rowCoordinates(row);
        return {
          ...row,
          distanceKm: coordinates && target ? distanceKm(coordinates, target) : null,
        };
      })
      .filter((row) => row.distanceKm === null || Number(row.distanceKm) > NEARBY_RADIUS_KM)
      .sort((a, b) => {
        const distanceA = typeof a.distanceKm === 'number' ? a.distanceKm : Number.MAX_SAFE_INTEGER;
        const distanceB = typeof b.distanceKm === 'number' ? b.distanceKm : Number.MAX_SAFE_INTEGER;
        if (distanceA !== distanceB) return distanceA - distanceB;
        return (activityMoment(a)?.getTime() || Number.MAX_SAFE_INTEGER) -
          (activityMoment(b)?.getTime() || Number.MAX_SAFE_INTEGER);
      });
  }, [activities, coordinates]);

  const joinedActivities = useMemo(() => {`,
    'allEventsActivities insertion'
  );

  const oldJoined = `  const joinedActivities = useMemo(() => {
    const now = Date.now();
    return activities
      .filter((row) => myActivityIds.has(String(row.id || '')))
      .filter((row) => {
        const moment = activityMoment(row);
        return !moment || moment.getTime() >= now;
      })
      .sort((a, b) => (activityMoment(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (activityMoment(b)?.getTime() || Number.MAX_SAFE_INTEGER));
  }, [activities, myActivityIds]);`;

  const newJoined = `  const joinedActivities = useMemo(() => {
    const now = Date.now();
    return activities
      .filter((row) => myActivityIds.has(String(row.id || '')))
      .filter((row) => String(row.creator_id || '') !== currentUserId)
      .filter((row) => {
        const moment = activityMoment(row);
        return !moment || moment.getTime() >= now;
      })
      .sort((a, b) => (activityMoment(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (activityMoment(b)?.getTime() || Number.MAX_SAFE_INTEGER));
  }, [activities, myActivityIds, currentUserId]);

  const organizedActivities = useMemo(() => {
    const now = Date.now();
    return activities
      .filter((row) => currentUserId && String(row.creator_id || '') === currentUserId)
      .filter((row) => {
        const moment = activityMoment(row);
        return !moment || moment.getTime() >= now;
      })
      .sort((a, b) => (activityMoment(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (activityMoment(b)?.getTime() || Number.MAX_SAFE_INTEGER));
  }, [activities, currentUserId]);`;

  s = replaceOnce(s, oldJoined, newJoined, 'joined + organized lists');

  s = replaceOnce(
    s,
    `  const selectedActivities = mode === 'nearby'
    ? nearbyActivities
    : mode === 'joined'
      ? joinedActivities
      : pastActivities;

  const visibleActivities = selectedActivities.slice(0, visibleCount);`,
    `  const selectedActivities = mode === 'nearby'
    ? nearbyActivities
    : mode === 'joined'
      ? joinedActivities
      : mode === 'organized'
        ? organizedActivities
        : pastActivities;

  const visibleActivities = selectedActivities.slice(0, visibleCount);
  const visibleAllEvents = allEventsActivities.slice(0, allEventsVisibleCount);`,
    'selectedActivities organized'
  );

  s = replaceOnce(
    s,
    `  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    setVisibleCount(PAGE_SIZE);
  }`,
    `  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    setVisibleCount(PAGE_SIZE);
    setAllEventsVisibleCount(PAGE_SIZE);
  }`,
    'selectMode reset'
  );

  s = replaceOnce(
    s,
    `          <TabButton active={mode === 'nearby'} label="Vicino a te" onPress={() => selectMode('nearby')} />
          <TabButton active={mode === 'joined'} label="A cui partecipi" onPress={() => selectMode('joined')} />
          <TabButton active={mode === 'past'} label="Eventi passati" onPress={() => selectMode('past')} />`,
    `          <TabButton active={mode === 'nearby'} label="Vicino a te" onPress={() => selectMode('nearby')} />
          <TabButton active={mode === 'joined'} label="A cui partecipi" onPress={() => selectMode('joined')} />
          <TabButton active={mode === 'organized'} label="I tuoi eventi" onPress={() => selectMode('organized')} />
          <TabButton active={mode === 'past'} label="Eventi passati" onPress={() => selectMode('past')} />`,
    'tabs organized'
  );

  s = replaceOnce(
    s,
    `{mode === 'nearby' ? 'Entro 25 km da te' : mode === 'joined' ? 'Le tue esperienze' : 'I tuoi eventi passati'}`,
    `{mode === 'nearby'
                ? 'Entro 25 km da te'
                : mode === 'joined'
                  ? 'A cui partecipi'
                  : mode === 'organized'
                    ? 'I tuoi eventi'
                    : 'I tuoi eventi passati'}`,
    'section title modes'
  );

  s = replaceOnce(
    s,
    `              {mode === 'nearby'
                ? coordinates ? 'Dal più vicino al più lontano.' : 'Attiva la posizione per vedere gli eventi entro 25 km.'
                : mode === 'joined'
                  ? 'Qui trovi ciò a cui partecipi e ciò che organizzi.'
                  : 'Foto, chat e dettagli restano disponibili per 30 giorni.'}`,
    `              {mode === 'nearby'
                ? coordinates ? 'Dal più vicino al più lontano.' : 'Attiva la posizione per vedere gli eventi entro 25 km.'
                : mode === 'joined'
                  ? 'Qui trovi le esperienze a cui partecipi.'
                  : mode === 'organized'
                    ? 'Qui trovi le esperienze che organizzi tu.'
                    : 'Foto, chat e dettagli restano disponibili per 30 giorni.'}`,
    'section subtitle modes'
  );

  s = replaceOnce(
    s,
    `{mode === 'nearby' ? 'Nessuna esperienza vicina' : mode === 'joined' ? 'Nessuna esperienza in programma' : 'Nessun evento passato'}`,
    `{mode === 'nearby'
                ? 'Nessuna esperienza vicina'
                : mode === 'joined'
                  ? 'Nessuna esperienza a cui partecipi'
                  : mode === 'organized'
                    ? 'Nessun evento organizzato'
                    : 'Nessun evento passato'}`,
    'empty title modes'
  );

  s = replaceOnce(
    s,
    `              {mode === 'nearby'
                ? 'Quando nascerà qualcosa entro 25 km da te lo troverai qui.'
                : mode === 'joined'
                  ? 'Quando partecipi o organizzi un’esperienza la ritrovi qui.'
                  : 'Gli eventi conclusi a cui hai partecipato compariranno qui per 30 giorni.'}`,
    `              {mode === 'nearby'
                ? 'Quando nascerà qualcosa entro 25 km da te lo troverai qui.'
                : mode === 'joined'
                  ? 'Quando partecipi a un’esperienza la ritrovi qui.'
                  : mode === 'organized'
                    ? 'Quando organizzi un’esperienza la ritrovi qui.'
                    : 'Gli eventi conclusi a cui hai partecipato o che hai organizzato compariranno qui per 30 giorni.'}`,
    'empty text modes'
  );

  const insertionPoint = '\n      </ScrollView>\n\n      <BajujuBottomNav active="find" />';
  const allEventsSection = `

        {mode === 'nearby' && !loading && !errorMessage ? (
          <View style={{ marginTop: 26 }}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Tutti gli eventi</Text>
                <Text style={styles.sectionSubtitle}>
                  {coordinates
                    ? 'Continua oltre i 25 km, dal più vicino al più lontano.'
                    : 'Tutti gli eventi disponibili. Attiva la posizione per ordinarli per distanza.'}
                </Text>
              </View>
              <View style={styles.counterPill}>
                <Text style={styles.counterText}>{allEventsActivities.length}</Text>
              </View>
            </View>

            {visibleAllEvents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nessun altro evento disponibile</Text>
                <Text style={styles.emptyText}>Quando verranno pubblicate altre esperienze le troverai qui.</Text>
              </View>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
                  {visibleAllEvents.map((item) => {
                    const activityId = String(item.id || '');
                    const poster = imageUrl(item);
                    const organizedByMe = currentUserId && String(item.creator_id || '') === currentUserId;
                    const distance = typeof item.distanceKm === 'number' ? item.distanceKm : null;

                    return (
                      <Pressable
                        key={activityId}
                        style={styles.experienceCard}
                        onPress={() => router.push({ pathname: '/experience-detail' as any, params: { id: activityId } })}
                      >
                        <Pressable
                          style={styles.imageBox}
                          onPress={(event) => {
                            event.stopPropagation();
                            if (poster) setSelectedPosterUrl(poster);
                          }}
                        >
                          <Image source={poster ? { uri: poster } : bajujuLogo} style={styles.image} resizeMode="cover" />
                        </Pressable>

                        <View style={styles.cardBody}>
                          <View style={styles.badgesRow}>
                            <Text style={styles.categoryBadge}>
                              {getExperienceCategoryIcon(item.category)} {normalizeExperienceCategory(item.category)}
                            </Text>
                            {organizedByMe ? <Text style={styles.organizerBadge}>Organizzi tu</Text> : null}
                          </View>

                          <Text style={styles.cardTitle} numberOfLines={2}>{item.title || 'Esperienza Bajuju'}</Text>
                          <Text style={styles.cardMeta}>{item.city || item.province || 'Luogo da definire'}</Text>
                          <Text style={styles.cardMeta}>{formatDate(item)}</Text>
                          {distance !== null ? (
                            <Text style={styles.distanceText}>
                              {distance < 1 ? \\`${Math.round(distance * 1000)} m\\` : \\`${distance.toFixed(1)} km\\`} da te
                            </Text>
                          ) : null}

                          <View style={styles.cardFooter}>
                            <Text style={styles.participantsText}>
                              Partecipanti {participantCounts[activityId] || 0}/{item.max_participants || '∞'}
                            </Text>
                            <Text style={styles.openText}>Apri →</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {allEventsVisibleCount < allEventsActivities.length ? (
                  <Pressable
                    style={styles.moreButton}
                    onPress={() => setAllEventsVisibleCount((value) => value + PAGE_SIZE)}
                  >
                    <Text style={styles.moreButtonText}>
                      Mostra altri {Math.min(PAGE_SIZE, allEventsActivities.length - allEventsVisibleCount)}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : null}`;

  if (!s.includes(insertionPoint)) throw new Error('Marker non trovato: insertionPoint tutti eventi');
  s = s.replace(insertionPoint, allEventsSection + insertionPoint);

  // Corregge gli escape usati per costruire il template literal del patcher.
  s = s.replace(/\\`/g, '`');

  write(path, s);
}

// 2) Dettaglio esperienza: "Invita" diventa "Interagisci" e apre il profilo della persona.
{
  const path = 'app/experience-detail.tsx';
  let s = read(path);

  const oldFunction = `  function sendGoingOutInvite(targetUserId: string) {
    if (!experienceId || !currentUserId || !canUseChat || !targetUserId) return;
    if (String(targetUserId) === String(currentUserId)) return;

    router.push({
      pathname: '/invite-out' as any,
      params: {
        targetUserId,
        activityId: experienceId,
      },
    });
  }

`;
  s = replaceOnce(s, oldFunction, '', 'remove sendGoingOutInvite');

  const oldButton = `                          {canShowInviteOut && userId !== String(currentUserId || '') && !isBlockedUser(userId) ? (
                            <Pressable
                              style={styles.inviteOutButton}
                              onPress={(event) => {
                                event.stopPropagation();
                                sendGoingOutInvite(userId);
                              }}
                            >
                              <Text style={styles.inviteOutButtonText}>
                                Invita
                              </Text>
                            </Pressable>
                          ) : null}`;

  const newButton = `                          {canShowInviteOut && userId !== String(currentUserId || '') && !isBlockedUser(userId) ? (
                            <Pressable
                              style={styles.inviteOutButton}
                              onPress={(event) => {
                                event.stopPropagation();
                                router.push({
                                  pathname: '/user-profile' as any,
                                  params: {
                                    userId,
                                    activityId: experienceId || '',
                                    postEvent: '1',
                                  },
                                });
                              }}
                            >
                              <Text style={styles.inviteOutButtonText}>
                                Interagisci
                              </Text>
                            </Pressable>
                          ) : null}`;

  s = replaceOnce(s, oldButton, newButton, 'Interagisci participant button');
  write(path, s);
}

// 3) Profilo utente e schermata contatto: etichetta chiara WhatsApp/Telegram.
{
  const path = 'app/user-profile.tsx';
  let s = read(path);
  s = replaceOnce(
    s,
    '<Text style={{ color: BAJUJU_PINK, fontWeight: \'900\' }}>Condividi contatto</Text>',
    '<Text style={{ color: BAJUJU_PINK, fontWeight: \'900\' }}>Invia WhatsApp o Telegram</Text>',
    'user profile contact label'
  );
  write(path, s);
}

{
  const path = 'app/share-contact.tsx';
  let s = read(path);
  s = replaceOnce(
    s,
    '<Text style={styles.title}>Condividi contatto</Text>',
    '<Text style={styles.title}>Invia WhatsApp o Telegram</Text>',
    'share contact title'
  );
  write(path, s);
}

console.log('PATCH_OK: Trova, Tutti gli eventi, I tuoi eventi e Interagisci aggiornati.');
fs.unlinkSync(__filename);
