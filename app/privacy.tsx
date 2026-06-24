import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PRIVACY_SECTIONS = [
  {
    "title": "1. Titolare del trattamento",
    "body": "Il titolare del trattamento dei dati personali è: Stefano Viola, Caprino Bergamasco. Email privacy: privacy@bajuju.it. Email generale: info@bajuju.it.\n\nIl titolare determina le finalità e le modalità del trattamento dei dati personali effettuato tramite il sito, la web app e i servizi collegati a Bajuju."
  },
  {
    "title": "2. Cos’è Bajuju",
    "body": "Bajuju è una piattaforma digitale che consente a utenti maggiorenni di registrarsi, creare un profilo, proporre attività, cercare eventi, partecipare a esperienze locali, utilizzare funzioni last minute, comunicare nelle chat evento, inviare o ricevere richieste di contatto e interagire con altri utenti nel rispetto delle regole della community."
  },
  {
    "title": "3. Utenti ammessi",
    "body": "Bajuju è riservato esclusivamente a utenti che abbiano compiuto almeno 18 anni.\n\nRegistrandosi, l’utente dichiara di essere maggiorenne. Qualora il titolare venga a conoscenza dell’utilizzo del servizio da parte di un minore, potrà sospendere o eliminare l’account e adottare le misure opportune."
  },
  {
    "title": "4. Dati personali trattati",
    "body": "Bajuju può trattare le seguenti categorie di dati personali:\n\na) Dati di registrazione e account: email, credenziali tecniche di accesso, identificativo utente, data di registrazione, stato dell’account, eventuali informazioni collegate al recupero password.\n\nb) Dati del profilo: nickname, foto profilo, città, zona o località indicata, fascia d’età, genere se indicato volontariamente, descrizione personale, preferenze, interessi selezionati, contenuti inseriti nei campi liberi.\n\nc) Dati relativi a eventi, attività e Flash: eventi creati, eventi a cui l’utente partecipa, titolo, descrizione, categoria, provincia, comune, luogo di partenza o indirizzo indicato, data e ora, numero partecipanti, partecipazioni, eventuali cronologie collegate agli eventi conclusi.\n\nd) Dati relativi alle comunicazioni: messaggi nelle chat evento, richieste di contatto, eventuali risposte, segnalazioni, comunicazioni con l’assistenza o con l’amministratore.\n\ne) Foto e contenuti caricati: foto profilo, immagini evento, fotografie inserite in eventuali gallerie evento, contenuti testuali pubblicati dall’utente.\n\nf) Dati di moderazione e sicurezza: segnalazioni inviate o ricevute, blocchi, sospensioni, eliminazioni account, log tecnici, informazioni necessarie a prevenire abusi, accessi non autorizzati, spam, comportamenti illeciti o violazioni delle regole.\n\ng) Dati tecnici: indirizzo IP, informazioni sul browser, dispositivo, sistema operativo, log di accesso, dati di sessione, dati necessari al funzionamento tecnico, alla sicurezza e alla manutenzione del servizio.\n\nh) Dati relativi alle notifiche: preferenze di notifica, iscrizione o disiscrizione alle notifiche push, token tecnici necessari all’invio delle notifiche, log tecnici di invio."
  },
  {
    "title": "5. Dati particolari o sensibili",
    "body": "Bajuju non richiede né intende raccogliere categorie particolari di dati personali, come dati relativi a salute, religione, opinioni politiche, orientamento sessuale, origine razziale o etnica, appartenenza sindacale, dati biometrici o genetici.\n\nL’utente non deve inserire tali informazioni nel profilo, nelle descrizioni, negli eventi, nelle chat, nelle foto o in altri campi liberi.\n\nQualora l’utente inserisca volontariamente dati particolari o informazioni eccessivamente personali, tali contenuti potranno essere rimossi se non necessari, inappropriati o contrari alle regole del servizio."
  },
  {
    "title": "6. Finalità del trattamento",
    "body": "I dati personali vengono trattati per le seguenti finalità:\n\na) Creazione e gestione dell’account: registrazione, accesso, autenticazione, recupero password, gestione profilo, aggiornamento dati, cancellazione account.\n\nb) Funzionamento del servizio: creazione, ricerca e partecipazione a eventi, attività e Flash; visualizzazione profili; gestione partecipazioni; gestione disponibilità; funzionamento delle chat evento; gestione richieste di contatto.\n\nc) Community e interazione tra utenti: mostrare agli altri utenti le informazioni pubbliche del profilo, gli interessi selezionati, le attività create o partecipate, nel rispetto delle impostazioni previste dal servizio.\n\nd) Sicurezza e moderazione: prevenzione abusi, gestione segnalazioni, controllo contenuti segnalati, sospensione o blocco account, tutela degli utenti, verifica di violazioni dei Termini e delle regole della community.\n\ne) Assistenza e comunicazioni di servizio: risposta a richieste dell’utente, comunicazioni tecniche, aggiornamenti sul servizio, recupero password, informazioni legate al funzionamento della piattaforma.\n\nf) Notifiche: invio di notifiche tecniche, notifiche push o avvisi relativi a eventi, Flash, messaggi, richieste, modifiche rilevanti o comunicazioni di servizio, se previste e attivate dall’utente.\n\ng) Obblighi di legge e tutela dei diritti: adempimento di obblighi normativi, riscontro a richieste delle autorità, accertamento, esercizio o difesa di un diritto in sede giudiziaria o stragiudiziale.\n\nh) Miglioramento tecnico del servizio: analisi tecnica del funzionamento, correzione errori, manutenzione, sicurezza, prevenzione malfunzionamenti, verifica delle prestazioni."
  },
  {
    "title": "7. Base giuridica del trattamento",
    "body": "Le basi giuridiche del trattamento sono:\n\na) esecuzione del contratto o di misure precontrattuali, per registrazione, accesso, gestione account, profilo, eventi, partecipazioni, chat e funzioni richieste dall’utente;\n\nb) consenso dell’utente, quando richiesto, ad esempio per notifiche push, eventuali cookie non tecnici, eventuali trattamenti facoltativi o funzionalità opzionali;\n\nc) legittimo interesse del titolare, per sicurezza, prevenzione abusi, moderazione, protezione della community, gestione segnalazioni, tutela del servizio e difesa da usi impropri;\n\nd) obbligo legale, quando il trattamento è necessario per adempiere a norme, richieste dell’autorità o obblighi previsti dalla legge;\n\ne) accertamento, esercizio o difesa di un diritto, quando necessario per gestire contestazioni, abusi, responsabilità o controversie."
  },
  {
    "title": "8. Natura del conferimento dei dati",
    "body": "Alcuni dati sono necessari per usare Bajuju, ad esempio email, dati tecnici di accesso, nickname e informazioni minime per il funzionamento del profilo e delle attività.\n\nAltri dati sono facoltativi, come foto profilo, descrizione personale, genere, interessi, preferenze e contenuti aggiuntivi.\n\nIl mancato conferimento dei dati necessari può impedire la registrazione, l’accesso o l’utilizzo di alcune funzioni. Il mancato conferimento dei dati facoltativi non impedisce l’uso del servizio, ma può limitarne alcune funzionalità o la completezza del profilo."
  },
  {
    "title": "9. Profilo pubblico e visibilità dei dati",
    "body": "Alcune informazioni inserite dall’utente possono essere visibili ad altri utenti, ad esempio nickname, foto profilo, città o zona, fascia d’età, descrizione, interessi, eventi organizzati, partecipazioni visibili e altre informazioni previste dal funzionamento della piattaforma.\n\nL’utente deve evitare di inserire informazioni riservate, dati sensibili o dati di terzi nei campi visibili agli altri utenti."
  },
  {
    "title": "10. Chat evento e messaggi",
    "body": "Le chat evento sono riservate ai partecipanti dell’evento, secondo le regole tecniche previste dalla piattaforma.\n\nI messaggi non vengono usati per finalità pubblicitarie o profilazione commerciale.\n\nIn caso di segnalazioni, abusi, violazioni delle regole, problemi di sicurezza o richieste delle autorità, il titolare o soggetti autorizzati potranno esaminare i contenuti strettamente necessari alla gestione del caso."
  },
  {
    "title": "11. Foto, immagini e gallerie evento",
    "body": "Bajuju può permettere agli utenti di caricare foto profilo, immagini evento e fotografie nelle gallerie degli eventi.\n\nCaricando contenuti, l’utente dichiara di avere il diritto di pubblicarli e si assume la responsabilità di quanto caricato.\n\nPartecipando a un evento, l’utente prende atto che altri partecipanti potrebbero scattare fotografie e caricarle nella galleria dell’evento, nel rispetto della normativa applicabile e delle regole della community.\n\nL’utente può segnalare immagini inappropriate o richiederne la rimozione scrivendo a privacy@bajuju.it o usando gli strumenti disponibili nella piattaforma."
  },
  {
    "title": "12. Segnalazioni, blocchi e moderazione",
    "body": "Bajuju può trattare dati relativi a segnalazioni, contenuti contestati, messaggi, eventi, profili, blocchi, sospensioni e misure di moderazione.\n\nTali dati vengono trattati per proteggere la community, prevenire abusi, gestire violazioni e tutelare il servizio.\n\nIn caso di comportamenti gravi, il titolare può conservare per un periodo più lungo le informazioni necessarie a documentare abusi, difendere diritti o adempiere a obblighi legali."
  },
  {
    "title": "13. Notifiche push",
    "body": "Bajuju può consentire l’attivazione di notifiche push relative a eventi, Flash, messaggi, richieste, aggiornamenti o comunicazioni di servizio.\n\nLe notifiche push vengono attivate solo se l’utente concede il consenso tramite browser o dispositivo.\n\nL’utente può disattivare le notifiche in qualsiasi momento dalle impostazioni del browser, del dispositivo o, se disponibile, dall’app."
  },
  {
    "title": "14. Email tecniche e comunicazioni di servizio",
    "body": "Bajuju può inviare email tecniche o di servizio, ad esempio per conferma account, recupero password, sicurezza, modifiche importanti, cancellazione account o comunicazioni necessarie al funzionamento del servizio.\n\nQueste comunicazioni non hanno finalità promozionale, salvo diversa indicazione e previo consenso quando necessario."
  },
  {
    "title": "15. Cookie e strumenti di tracciamento",
    "body": "Bajuju utilizza cookie o strumenti tecnici necessari al funzionamento del sito, dell’autenticazione, della sicurezza e della sessione utente.\n\nSe Bajuju dovesse utilizzare strumenti non tecnici, come analytics non anonimizzati, Meta Pixel, Google Analytics, strumenti pubblicitari, profilazione o tracciamenti di terze parti, verrà richiesto il consenso dell’utente prima dell’attivazione, ove previsto dalla normativa applicabile.\n\nL’utente può gestire i cookie tramite il browser e, se presente, tramite il banner o pannello di gestione consenso."
  },
  {
    "title": "16. Fornitori e responsabili del trattamento",
    "body": "Per fornire il servizio, Bajuju può avvalersi di fornitori tecnici che trattano dati personali per conto del titolare, tra cui: Supabase, per database, autenticazione e storage; Netlify, per hosting, pubblicazione e deploy del sito; Aruba o altri fornitori email/SMTP, per email tecniche e comunicazioni di servizio; eventuali fornitori di servizi di notifica, sicurezza, monitoraggio tecnico, manutenzione o assistenza.\n\nTali soggetti trattano i dati secondo le rispettive condizioni, policy e accordi applicabili. Il titolare conserva o si impegna a conservare la documentazione necessaria, inclusi eventuali Data Processing Agreement o accordi di nomina a responsabile del trattamento, ove richiesti."
  },
  {
    "title": "17. Trasferimenti extra SEE",
    "body": "Alcuni fornitori tecnici potrebbero trattare dati anche al di fuori dello Spazio Economico Europeo.\n\nIn tali casi, il trasferimento avverrà nel rispetto delle garanzie previste dal GDPR, quali decisioni di adeguatezza, clausole contrattuali standard o altri strumenti riconosciuti dalla normativa applicabile."
  },
  {
    "title": "18. Periodi di conservazione",
    "body": "I dati sono conservati per il tempo necessario alle finalità per cui sono raccolti.\n\nIndicativamente: dati account: fino alla cancellazione del profilo, salvo necessità ulteriori; dati profilo: fino alla modifica o cancellazione dell’account; eventi attivi: per la durata dell’evento e per il tempo necessario alla gestione; eventi conclusi: per un periodo limitato agli utenti coinvolti, ad esempio per consultare partecipanti, chat o galleria, e poi rimossi o resi non accessibili secondo le regole del servizio; Flash e disponibilità temporanee: fino alla scadenza prevista; messaggi chat: per il tempo necessario al funzionamento della chat evento e alla gestione di eventuali segnalazioni o contestazioni; segnalazioni e dati di moderazione: per il tempo necessario alla gestione del caso e alla tutela del servizio; log tecnici: per il tempo necessario a sicurezza, manutenzione e prevenzione abusi; dati necessari per obblighi legali o tutela dei diritti: per il tempo previsto dalla legge o necessario alla difesa del titolare o degli utenti."
  },
  {
    "title": "19. Cancellazione account",
    "body": "L’utente può richiedere la cancellazione del profilo tramite la funzione disponibile nell’app, se presente, oppure scrivendo a privacy@bajuju.it.\n\nA seguito della richiesta, il titolare provvederà alla cancellazione o anonimizzazione dei dati dove tecnicamente possibile, salvo dati che debbano essere conservati per obblighi legali, sicurezza, prevenzione abusi, gestione di contestazioni o tutela dei diritti."
  },
  {
    "title": "20. Diritti dell’utente",
    "body": "L’utente può esercitare i diritti previsti dagli articoli 15-22 del GDPR, tra cui: accesso ai dati personali; rettifica dei dati inesatti; cancellazione dei dati; limitazione del trattamento; opposizione al trattamento; portabilità dei dati, ove applicabile; revoca del consenso, quando il trattamento si basa sul consenso.\n\nLe richieste possono essere inviate a: privacy@bajuju.it.\n\nIl titolare risponderà nei tempi previsti dalla normativa applicabile."
  },
  {
    "title": "21. Reclamo al Garante",
    "body": "L’utente ha diritto di proporre reclamo al Garante per la protezione dei dati personali se ritiene che il trattamento dei dati personali avvenga in violazione della normativa applicabile."
  },
  {
    "title": "22. Sicurezza dei dati",
    "body": "Bajuju adotta misure tecniche e organizzative ragionevoli per proteggere i dati personali da accessi non autorizzati, perdita, modifica, divulgazione o uso improprio.\n\nTra le misure possono rientrare autenticazione, permessi di accesso, regole di sicurezza del database, limitazioni agli accessi amministrativi, monitoraggio tecnico, backup e strumenti di protezione dei fornitori utilizzati.\n\nL’utente deve usare password sicure, non condividere le credenziali e segnalare eventuali accessi sospetti."
  },
  {
    "title": "23. Data breach",
    "body": "In caso di violazione dei dati personali che comporti rischi per i diritti e le libertà degli utenti, il titolare valuterà gli obblighi di notifica al Garante e, ove necessario, agli interessati, secondo quanto previsto dalla normativa applicabile."
  },
  {
    "title": "24. Privacy by design e by default",
    "body": "Bajuju si impegna a sviluppare il servizio tenendo conto dei principi di minimizzazione dei dati, limitazione delle finalità, sicurezza, accesso controllato, conservazione limitata e protezione dei dati fin dalla progettazione e per impostazione predefinita."
  },
  {
    "title": "25. Modifiche alla Privacy Policy",
    "body": "La presente Privacy Policy può essere aggiornata nel tempo per adeguarla a nuove funzionalità, obblighi normativi, modifiche tecniche o cambiamenti organizzativi.\n\nGli utenti saranno informati degli aggiornamenti rilevanti tramite il sito, l’app o altri canali disponibili."
  },
  {
    "title": "26. Contatti",
    "body": "Per richieste privacy, esercizio dei diritti, segnalazioni relative ai dati personali o informazioni è possibile scrivere a: privacy@bajuju.it."
  }
];

export default function PrivacyScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju</Text>
        <Text style={styles.title}>Privacy Policy Bajuju</Text>
        <Text style={styles.subtitle}>Informativa sul trattamento dei dati personali ai sensi del Regolamento UE 2016/679</Text>
        <Text style={styles.updated}>Ultimo aggiornamento: 16 giugno 2026</Text>

        {PRIVACY_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.text}>{section.body}</Text>
          </View>
        ))}

        <TouchableOpacity style={styles.button} onPress={() => router.push('/profile')}>
          <Text style={styles.buttonText}>Torna alla pagina precedente</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    backgroundColor: '#fff8fb',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  kicker: {
    color: '#ef2d82',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    color: '#4b1430',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  updated: {
    color: '#8a3a5a',
    fontSize: 13,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 8,
  },
  text: {
    color: '#4b1430',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#ef2d82',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
