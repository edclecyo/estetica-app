import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Region = Coordinate & {
  latitudeDelta?: number;
  longitudeDelta?: number;
};

function findCoordinate(children: React.ReactNode): Coordinate | null {
  let selected: Coordinate | null = null;

  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    const props = child.props as any;
    if (props?.coordinate) selected = props.coordinate;
  });

  return selected;
}

function getZoom(region?: Region) {
  const delta = Math.max(Number(region?.latitudeDelta || 0.01), Number(region?.longitudeDelta || 0.01));
  if (delta <= 0.003) return 17;
  if (delta <= 0.008) return 16;
  if (delta <= 0.02) return 15;
  return 13;
}

const MapView = forwardRef(function MapView({ children, initialRegion, region, style }: any, ref) {
  const [currentRegion, setCurrentRegion] = useState<Region | undefined>(region || initialRegion);
  const marker = findCoordinate(children);
  const coordinate = marker || currentRegion;

  useImperativeHandle(ref, () => ({
    animateToRegion(nextRegion: Region) {
      setCurrentRegion(nextRegion);
    },
  }));

  const url = useMemo(() => {
    if (!coordinate) return '';
    const zoom = getZoom(currentRegion);
    return `https://maps.google.com/maps?q=${coordinate.latitude},${coordinate.longitude}&z=${zoom}&output=embed`;
  }, [coordinate, currentRegion]);

  const externalUrl = coordinate
    ? `https://www.google.com/maps/search/?api=1&query=${coordinate.latitude},${coordinate.longitude}`
    : '';

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#101010' }, style]}>
      {url ? (
        <>
          {React.createElement('iframe', {
            src: url,
            title: 'Mapa BeautyHub',
            loading: 'lazy',
            referrerPolicy: 'no-referrer-when-downgrade',
            style: {
              border: 0,
              width: '100%',
              height: '100%',
              minHeight: 220,
              display: 'block',
            },
          })}
          {React.createElement(
            'a',
            {
              href: externalUrl,
              target: '_blank',
              rel: 'noreferrer',
              style: {
                position: 'absolute',
                right: 10,
                bottom: 10,
                padding: '8px 10px',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.72)',
                color: '#F0D080',
                fontSize: 12,
                fontWeight: 800,
                textDecoration: 'none',
              },
            },
            'Abrir no Maps'
          )}
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 220 }}>
          <Text style={{ color: '#777' }}>Mapa indisponivel</Text>
        </View>
      )}
    </View>
  );
});

export function Marker() {
  return null;
}

export const PROVIDER_GOOGLE = 'google';
export default MapView;
