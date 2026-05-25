export const AndroidImportance = {
  HIGH: 4,
  DEFAULT: 3,
  LOW: 2,
  MIN: 1,
};

export default {
  requestPermission: async () => ({}),
  displayNotification: async () => {},
  createChannel: async () => 'default',
  getBadgeCount: async () => 0,
  setBadgeCount: async () => {},
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => {},
};
