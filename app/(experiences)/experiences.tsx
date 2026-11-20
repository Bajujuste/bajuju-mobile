import { Redirect } from 'expo-router';

// La vecchia pagina "Esperienze" è stata unita a "Tutti gli eventi".
// I link vecchi (notifiche, pulsanti) arrivano qui e vengono portati lì.
// I propri eventi (partecipi, organizzi, passati) sono in "I miei eventi".
export default function ExperiencesRedirect() {
  return <Redirect href={'/all-events' as any} />;
}
