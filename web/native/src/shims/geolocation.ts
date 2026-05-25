export default {
  setRNConfiguration() {},
  requestAuthorization: async () => 'granted',
  getCurrentPosition(success: any, error: any) {
    if (!navigator.geolocation) error?.({ message: 'Geolocalizacao indisponivel' });
    else navigator.geolocation.getCurrentPosition(success, error);
  },
  watchPosition(success: any, error: any) {
    if (!navigator.geolocation) return 0;
    return navigator.geolocation.watchPosition(success, error);
  },
  clearWatch(id: number) {
    navigator.geolocation?.clearWatch(id);
  },
};
