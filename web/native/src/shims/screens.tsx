import React from 'react';
import { View } from 'react-native';

export const enableScreens = () => {};
export const screensEnabled = () => false;
export const Screen = ({ children, style }: any) => <View style={style}>{children}</View>;
export const ScreenContainer = ({ children, style }: any) => <View style={style}>{children}</View>;
export const ScreenStack = ({ children, style }: any) => <View style={style}>{children}</View>;
export const ScreenStackItem = ({ children, style }: any) => <View style={style}>{children}</View>;
export const FullWindowOverlay = ({ children }: any) => <>{children}</>;
export default { enableScreens };
