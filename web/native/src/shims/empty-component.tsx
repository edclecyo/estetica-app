import React from 'react';
import { View } from 'react-native';

export default function EmptyComponent({ children, style }: any) {
  return <View style={style}>{children}</View>;
}

export const Marker = EmptyComponent;
export const PROVIDER_GOOGLE = 'google';
export const WebView = EmptyComponent;
