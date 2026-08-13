import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(__dirname, '../..');
const shim = (name: string) => path.resolve(__dirname, 'src/shims', name);

export default defineConfig({
  root: path.resolve(__dirname),
  base: process.env.BEAUTYHUB_WEB_BASE || '/',
  plugins: [react()],
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: [
      { find: '../../../src/screens/CartaoScreen', replacement: shim('../screens/CartaoScreen.web.tsx') },
      { find: '../screens/CartaoScreen', replacement: shim('../screens/CartaoScreen.web.tsx') },
      { find: '../../../src/contexts/AuthContext', replacement: shim('../AuthContext.web.tsx') },
      { find: '../contexts/AuthContext', replacement: shim('../AuthContext.web.tsx') },
      { find: /^react-native$/, replacement: shim('react-native.ts') },
      { find: /^react-native-vector-icons\/.*$/, replacement: shim('icon.tsx') },
      { find: /^@react-native-masked-view\/masked-view$/, replacement: shim('empty-component.tsx') },
      { find: '@react-native-firebase/app', replacement: shim('firebase-app.ts') },
      { find: '@react-native-firebase/auth', replacement: shim('firebase-auth.ts') },
      { find: '@react-native-firebase/firestore', replacement: shim('firebase-firestore.ts') },
      { find: '@react-native-firebase/functions', replacement: shim('firebase-functions.ts') },
      { find: '@react-native-firebase/storage', replacement: shim('firebase-storage.ts') },
      { find: '@react-native-firebase/messaging', replacement: shim('messaging.ts') },
      { find: '@react-native-google-signin/google-signin', replacement: shim('google-signin.ts') },
      { find: '@notifee/react-native', replacement: shim('notifee.ts') },
      { find: 'react-native-linear-gradient', replacement: shim('linear-gradient.tsx') },
      { find: 'react-native-maps', replacement: shim('maps.tsx') },
      { find: 'react-native-video', replacement: shim('video.tsx') },
      { find: 'react-native-webview', replacement: shim('empty-component.tsx') },
      { find: 'react-native-image-picker', replacement: shim('image-picker.ts') },
      { find: 'react-native-share', replacement: shim('share.ts') },
      { find: 'react-native-fs', replacement: shim('fs.ts') },
      { find: 'react-native-qrcode-svg', replacement: shim('empty-component.tsx') },
      { find: 'react-native-chart-kit', replacement: shim('chart-kit.tsx') },
      { find: 'react-native-toast-message', replacement: shim('toast.tsx') },
      { find: 'react-native-safe-area-context', replacement: shim('safe-area.tsx') },
      { find: 'react-native-gesture-handler', replacement: shim('gesture-handler.tsx') },
      { find: 'react-native-screens', replacement: shim('screens.tsx') },
      { find: 'react-native-reanimated', replacement: shim('reanimated.ts') },
      { find: 'react-native-worklets', replacement: shim('worklets.ts') },
      { find: '@react-native-community/geolocation', replacement: shim('geolocation.ts') },
      { find: '@react-native-community/slider', replacement: shim('slider.tsx') },
      { find: '@react-native-async-storage/async-storage', replacement: shim('async-storage.ts') },
      { find: '@react-native-clipboard/clipboard', replacement: shim('clipboard.ts') },
    ],
  },
  optimizeDeps: {
    esbuildOptions: {
      resolveExtensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js'],
      alias: {
        'react-native': shim('react-native.ts'),
        '@react-native-firebase/app': shim('firebase-app.ts'),
        '@react-native-firebase/auth': shim('firebase-auth.ts'),
        '@react-native-firebase/firestore': shim('firebase-firestore.ts'),
        '@react-native-firebase/functions': shim('firebase-functions.ts'),
        '@react-native-firebase/storage': shim('firebase-storage.ts'),
        '@react-native-firebase/messaging': shim('messaging.ts'),
      },
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    global: 'globalThis',
  },
  server: {
    host: '127.0.0.1',
    port: 5180,
  },
  build: {
    outDir: path.resolve(root, 'web/native/dist'),
    emptyOutDir: true,
  },
});
