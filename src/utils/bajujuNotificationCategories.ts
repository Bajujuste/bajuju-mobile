// Una sola classificazione condivisa tra la Home e la schermata Notifiche.
export type BajujuNotificationCategory = 'requests' | 'chat' | 'other';

export function getBajujuNotificationCategory(
  notificationType: string,
  data?: Record<string, unknown> | null,
): BajujuNotificationCategory {
  const type = String(notificationType || '').trim().toLowerCase();
  const screen = typeof data?.screen === 'string' ? data.screen.toLowerCase() : '';
  const section = typeof data?.section === 'string' ? data.section.toLowerCase() : '';

  if (
    type.includes('chat') ||
    type.includes('message') ||
    section === 'chat' ||
    screen === 'admin-private-chat'
  ) return 'chat';

  if (
    type.includes('request') ||
    type.includes('accepted') ||
    type.includes('rejected') ||
    type.includes('participant') ||
    type.includes('approval') ||
    type.includes('join_') ||
    screen === 'date-invites' ||
    screen === 'direct-contacts'
  ) return 'requests';

  return 'other';
}

export const BAJUJU_NOTIFICATION_CATEGORY_LABELS: Record<BajujuNotificationCategory, string> = {
  requests: 'Richieste',
  chat: 'Chat',
  other: 'Altre',
};
