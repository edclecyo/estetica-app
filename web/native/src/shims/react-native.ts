export * from 'react-native-web';

export const PermissionsAndroid = {
  PERMISSIONS: {
    ACCESS_FINE_LOCATION: 'ACCESS_FINE_LOCATION',
    ACCESS_COARSE_LOCATION: 'ACCESS_COARSE_LOCATION',
    POST_NOTIFICATIONS: 'POST_NOTIFICATIONS',
    READ_EXTERNAL_STORAGE: 'READ_EXTERNAL_STORAGE',
    WRITE_EXTERNAL_STORAGE: 'WRITE_EXTERNAL_STORAGE',
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  request: async () => 'granted',
  requestMultiple: async (permissions: string[]) => Object.fromEntries(permissions.map(p => [p, 'granted'])),
  check: async () => true,
};

export const Alert = {
  alert(title: string, message?: string, buttons?: Array<{ text?: string; onPress?: () => void }>) {
    window.alert([title, message].filter(Boolean).join('\n'));
    const positive = buttons?.find(button => button.onPress) || buttons?.[0];
    positive?.onPress?.();
  },
};
