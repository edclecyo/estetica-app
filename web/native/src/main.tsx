import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.web';
import './styles.css';
import logo from '../../../src/assets/logo.png';
import seloVerificado from '../../../src/assets/selo_verificado.png';

const assets: Record<string, string> = {
  '../assets/logo.png': logo,
  '../assets/selo_verificado.png': seloVerificado,
};

(globalThis as any).require = (assetPath: string) => assets[assetPath] || assetPath;

const ua = navigator.userAgent || '';
const platform = navigator.platform || '';
const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isLocalPreview = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

if (isIOS || isLocalPreview) {
  createRoot(document.getElementById('root')!).render(<App />);
}
