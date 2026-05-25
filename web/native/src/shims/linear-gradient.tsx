import React from 'react';
import { View } from 'react-native';

export default function LinearGradient({ colors = [], style, children, ...props }: any) {
  const background = Array.isArray(colors) && colors.length
    ? { backgroundImage: `linear-gradient(135deg, ${colors.join(', ')})` }
    : null;
  return (
    <View {...props} style={[background, style]}>
      {children}
    </View>
  );
}
