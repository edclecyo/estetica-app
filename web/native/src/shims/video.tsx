import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';

type VideoProps = {
  source?: { uri?: string } | number;
  style?: any;
  paused?: boolean;
  repeat?: boolean;
  muted?: boolean;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'none';
  controls?: boolean;
  onLoad?: (event: any) => void;
  onEnd?: () => void;
  onError?: (event: any) => void;
};

export default function Video({
  source,
  style,
  paused,
  repeat,
  muted,
  resizeMode = 'cover',
  controls = false,
  onLoad,
  onEnd,
  onError,
}: VideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const uri = typeof source === 'object' ? source?.uri : undefined;
  const flatStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);

  useEffect(() => {
    const video = ref.current;
    if (!video || !uri) return;

    video.setAttribute('webkit-playsinline', 'true');

    if (paused) {
      video.pause();
      return;
    }

    video.play().catch(() => {
      // Safari may block autoplay until the user interacts with the PWA.
    });
  }, [paused, uri]);

  return (
    <video
      ref={ref}
      src={uri}
      muted={muted ?? true}
      loop={!!repeat}
      autoPlay={!paused}
      preload="auto"
      playsInline
      controls={controls}
      onLoadedMetadata={event => {
        const video = event.currentTarget;
        onLoad?.({ duration: video.duration || 0, naturalSize: { width: video.videoWidth, height: video.videoHeight } });
      }}
      onEnded={onEnd}
      onError={onError}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        ...flatStyle,
        objectFit: resizeMode === 'contain' ? 'contain' : resizeMode === 'stretch' ? 'fill' : 'cover',
        backgroundColor: flatStyle.backgroundColor || '#000',
      }}
    />
  );
}
