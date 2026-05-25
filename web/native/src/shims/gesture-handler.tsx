import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';

export const GestureHandlerRootView = ({ children, style }: any) => <View style={style}>{children}</View>;
export const RectButton = TouchableOpacity;
export const BorderlessButton = TouchableOpacity;
export { TouchableOpacity };
export const Swipeable = ({ children }: any) => <>{children}</>;
export const DrawerLayout = ({ children }: any) => <>{children}</>;
export const ScrollView as GestureScrollView = ScrollView;
export default {};
