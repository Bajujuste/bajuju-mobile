import React, { useEffect, useState } from 'react';
import { Image, ImageProps, ImageSourcePropType } from 'react-native';
import { eventThumbUrl } from '../../lib/eventCards';

type Props = Omit<ImageProps, 'source'> & { uri: string; fallback?: ImageSourcePropType };

// Foto evento ridotta per le schede; se la versione ridotta non arriva usa l'originale.
export function EventCardImage({ uri, fallback, ...props }: Props) {
  const thumb = eventThumbUrl(uri);
  const [source, setSource] = useState(thumb);
  useEffect(() => { setSource(eventThumbUrl(uri)); }, [uri]);

  if (!source) return fallback ? <Image {...props} source={fallback} /> : null;
  return (
    <Image
      {...props}
      source={{ uri: source }}
      onError={() => { if (source !== uri) setSource(uri); }}
    />
  );
}
