import React from 'react';
import { Linking, StyleProp, Text, TextStyle } from 'react-native';

// Link nei messaggi di chat: tappabili SOLO se il messaggio è di un admin.
// Per gli utenti normali il testo resta com'è (link non cliccabili).
const LINK_PATTERN = /((?:https?:\/\/|bajuju:\/\/|www\.)[^\s<>"']+)/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}»"']+$/;

function openChatLink(raw: string) {
  const url = /^www\./i.test(raw) ? `https://${raw}` : raw;
  void Linking.openURL(url).catch(() => console.log('Link non disponibile.'));
}

type Props = {
  text: string;
  linksEnabled: boolean;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
};

export function BajujuLinkText({ text, linksEnabled, style, linkStyle }: Props) {
  if (!linksEnabled || !text) return <Text style={style}>{text}</Text>;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  LINK_PATTERN.lastIndex = 0;

  while ((match = LINK_PATTERN.exec(text)) !== null) {
    let link = match[0];
    const trailing = link.match(TRAILING_PUNCTUATION)?.[0] || '';
    if (trailing) link = link.slice(0, link.length - trailing.length);
    const start = match.index;
    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    if (link.length > 0) {
      parts.push(
        <Text
          key={`link-${start}`}
          style={[{ textDecorationLine: 'underline', fontWeight: '700' }, linkStyle]}
          onPress={() => openChatLink(link)}
          suppressHighlighting={false}
          accessibilityRole="link"
        >
          {link}
        </Text>
      );
    }
    lastIndex = start + link.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return <Text style={style}>{parts}</Text>;
}
