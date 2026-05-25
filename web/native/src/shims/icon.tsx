import React from 'react';
import { Text } from 'react-native';

import materialCommunityGlyphs from '../../../../node_modules/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';
import fontAwesomeGlyphs from '../../../../node_modules/react-native-vector-icons/glyphmaps/FontAwesome.json';
import ioniconsGlyphs from '../../../../node_modules/react-native-vector-icons/glyphmaps/Ionicons.json';
import featherGlyphs from '../../../../node_modules/react-native-vector-icons/glyphmaps/Feather.json';

import materialCommunityFont from '../../../../node_modules/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf?url';
import fontAwesomeFont from '../../../../node_modules/react-native-vector-icons/Fonts/FontAwesome.ttf?url';
import ioniconsFont from '../../../../node_modules/react-native-vector-icons/Fonts/Ionicons.ttf?url';
import featherFont from '../../../../node_modules/react-native-vector-icons/Fonts/Feather.ttf?url';

const fontFaces = [
  ['MaterialCommunityIcons', materialCommunityFont],
  ['FontAwesome', fontAwesomeFont],
  ['Ionicons', ioniconsFont],
  ['Feather', featherFont],
] as const;

let fontsInjected = false;

function injectIconFonts() {
  if (fontsInjected || typeof document === 'undefined') return;
  fontsInjected = true;

  const style = document.createElement('style');
  style.textContent = fontFaces
    .map(
      ([family, url]) => `
@font-face {
  font-family: "${family}";
  src: url("${url}") format("truetype");
  font-weight: normal;
  font-style: normal;
  font-display: block;
}`
    )
    .join('\n');

  document.head.appendChild(style);
}

const iconSets = [
  { family: 'MaterialCommunityIcons', glyphs: materialCommunityGlyphs as Record<string, number> },
  { family: 'FontAwesome', glyphs: fontAwesomeGlyphs as Record<string, number> },
  { family: 'Ionicons', glyphs: ioniconsGlyphs as Record<string, number> },
  { family: 'Feather', glyphs: featherGlyphs as Record<string, number> },
];

function resolveIcon(name: string) {
  for (const set of iconSets) {
    const code = set.glyphs[name];
    if (typeof code === 'number') {
      return { family: set.family, char: String.fromCodePoint(code) };
    }
  }

  return { family: 'Arial', char: '?' };
}

export default function Icon({ name = '', size = 20, color = '#fff', style }: any) {
  injectIconFonts();

  const icon = resolveIcon(String(name));

  return (
    <Text
      selectable={false}
      style={[
        {
          color,
          fontSize: Number(size) || 20,
          lineHeight: Number(size) || 20,
          fontFamily: icon.family,
          fontWeight: 'normal',
          textAlign: 'center',
        },
        style,
      ]}
    >
      {icon.char}
    </Text>
  );
}
