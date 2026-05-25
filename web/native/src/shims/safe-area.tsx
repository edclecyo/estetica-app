import React from 'react';
import { View } from 'react-native';

export const SafeAreaProvider = ({ children }: any) => <>{children}</>;
export const SafeAreaView = ({ children, style }: any) => <View style={style}>{children}</View>;
export const SafeAreaInsetsContext = React.createContext({ top: 0, bottom: 0, left: 0, right: 0 });
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
export const initialWindowMetrics = null;
