import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
type Summary = Record<string, any>;
export default function AcquisitionStats({ days, refreshKey }: { days: number; refreshKey: number }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true; setData(null); setError(false);
    void supabase.rpc('master_get_acquisition_summary' as any, { days_back: days }).then(result => {
      if (!active) return; if (result.error) setError(true); else setData(result.data as Summary);
    });
    return () => { active = false; };
  }, [days, refreshKey]);
  const rows = [['Sessioni sul sito','web_sessions'],['Pagine viste sul sito','web_views'],['Sessioni pagina Scarica','download_sessions'],['Clic App Store','apple_clicks'],['Clic Google Play','android_clicks'],['Sessioni pagina registrazione','register_opens'],['Tentativi di registrazione','register_attempts'],['Errori o dati mancanti','register_errors'],['Nuovi account reali','registrations'],['Nuovi account con email confermata','confirmed_registrations'],['Nuovi account da confermare','pending_registrations'],['Conferme email nel periodo','confirmations']];
  return <View style={styles.card}>
    <Text style={styles.title}>Visite e registrazioni</Text>
    <Text style={styles.note}>Il periodo segue il calendario italiano. Le sessioni sono aperture del sito, non persone uniche: un ricaricamento avvia una nuova sessione. Nessun cookie di tracciamento.</Text>
    {error ? <Text>Impossibile caricare questi dati. Aggiorna per riprovare.</Text> : !data ? <Text>Caricamento…</Text> : <>
      <Text style={styles.note}>Visite e clic raccolti da {data.tracking_since ? new Date(data.tracking_since).toLocaleString('it-IT') : 'quando arriverà la prima visita'}. Le iscrizioni provengono dal database e includono anche lo storico.</Text>
      {rows.map(([label,key]) => <View key={key} style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{Number(data[key] || 0)}</Text></View>)}
      <Text style={styles.note}>I clic non misurano le installazioni. Visite web e iscrizioni sono contatori separati: non identificano la stessa persona attraverso lo store. Instagram è riconosciuto solo quando comunica la provenienza o dal link con utm_source=instagram.</Text>
      <Text style={styles.title}>Domini</Text>
      {(data.domains || []).map((r: any) => <Text key={r.domain}>{r.domain}: {r.sessions} sessioni · {r.views} pagine</Text>)}
      <Text style={styles.title}>Provenienza delle pagine viste</Text>
      {(data.sources || []).map((r: any) => <Text key={r.source}>{r.source || 'Non disponibile'}: {r.views}</Text>)}
    </>}
  </View>;
}
const styles = StyleSheet.create({card:{padding:17,borderRadius:24,backgroundColor:'#fff',borderWidth:1,borderColor:'#ffd3e6',gap:12},title:{color:'#4b1430',fontSize:19,fontWeight:'900'},note:{color:'#745068',fontSize:13,lineHeight:19},row:{flexDirection:'row',gap:12,borderTopWidth:1,borderTopColor:'#ffe5f0',paddingTop:10},label:{flex:1,color:'#6b3652',fontSize:14},value:{color:'#e43f98',fontSize:20,fontWeight:'900'}});
