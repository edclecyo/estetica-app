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

const showWebCrash = (title: string, detail?: unknown) => {
  const root = document.getElementById('root');
  if (!root) return;

  const message =
    detail instanceof Error
      ? `${detail.name}: ${detail.message}`
      : typeof detail === 'string'
        ? detail
        : JSON.stringify(detail || 'Erro desconhecido');

  root.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:22px;background:#050505;color:#fff;font-family:Arial,Helvetica,sans-serif;">
      <section style="width:min(520px,100%);border:1px solid rgba(201,169,110,.45);border-radius:8px;padding:18px;background:#111;">
        <h1 style="font-size:20px;margin:0 0 10px;color:#fff;">${title}</h1>
        <p style="font-size:14px;line-height:1.45;color:#d8d8d8;margin:0 0 12px;">O iPhone escondeu o erro e deixou a tela preta. Envie essa mensagem para corrigir o ponto exato.</p>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#000;border-radius:8px;padding:12px;color:#f5c76a;font-size:12px;line-height:1.45;">${message.replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] || char))}</pre>
        <button type="button" onclick="location.reload()" style="width:100%;min-height:46px;border:0;border-radius:8px;background:#C9A96E;color:#000;font-weight:900;margin-top:14px;">Reabrir app</button>
      </section>
    </main>
  `;
};

window.addEventListener('error', event => {
  showWebCrash('Erro no BeautyHub iPhone', event.error || event.message);
});

window.addEventListener('unhandledrejection', event => {
  showWebCrash('Erro no BeautyHub iPhone', event.reason);
});

class WebErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    showWebCrash('Erro na tela do BeautyHub', error);
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

const ua = navigator.userAgent || '';
const platform = navigator.platform || '';
const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isLocalPreview = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

if (isIOS || isLocalPreview) {
  createRoot(document.getElementById('root')!).render(
    <WebErrorBoundary>
      <App />
    </WebErrorBoundary>
  );
}
