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
    const opcoes = buttons?.length ? buttons : [{ text: 'OK' }];

    if (typeof document === 'undefined') {
      const confirmed =
        opcoes.length <= 1 ||
        window.confirm([title, message].filter(Boolean).join('\n\n'));

      if (confirmed) {
        const action = opcoes.find(button => button.style !== 'cancel' && button.onPress);
        action?.onPress?.();
      }

      return;
    }

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '22px';
    overlay.style.background = 'rgba(0,0,0,.58)';
    overlay.style.backdropFilter = 'blur(4px)';

    const card = document.createElement('div');
    card.style.width = 'min(360px, 100%)';
    card.style.borderRadius = '18px';
    card.style.background = '#111';
    card.style.border = '1px solid rgba(201,169,110,.35)';
    card.style.boxShadow = '0 24px 70px rgba(0,0,0,.45)';
    card.style.padding = '20px';
    card.style.fontFamily = 'Arial, Helvetica, sans-serif';

    const titleEl = document.createElement('div');
    titleEl.textContent = title || 'BeautyHub';
    titleEl.style.color = '#FFF';
    titleEl.style.fontSize = '18px';
    titleEl.style.fontWeight = '900';
    titleEl.style.marginBottom = message ? '8px' : '0';
    titleEl.style.lineHeight = '1.25';
    card.appendChild(titleEl);

    if (message) {
      const messageEl = document.createElement('div');
      messageEl.textContent = message;
      messageEl.style.color = '#CFCFCF';
      messageEl.style.fontSize = '14px';
      messageEl.style.lineHeight = '1.45';
      messageEl.style.marginBottom = '18px';
      card.appendChild(messageEl);
    }

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.justifyContent = 'flex-end';
    row.style.flexWrap = 'wrap';

    const close = (callback?: () => void) => {
      overlay.remove();
      callback?.();
    };

    opcoes.forEach(button => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = button.text || 'OK';
      btn.style.minHeight = '44px';
      btn.style.border = '0';
      btn.style.borderRadius = '12px';
      btn.style.padding = '0 16px';
      btn.style.fontWeight = '900';
      btn.style.cursor = 'pointer';

      if (button.style === 'destructive') {
        btn.style.background = '#C62828';
        btn.style.color = '#FFF';
      } else if (button.style === 'cancel') {
        btn.style.background = '#252525';
        btn.style.color = '#FFF';
      } else {
        btn.style.background = '#C9A96E';
        btn.style.color = '#000';
      }

      btn.onclick = () => close(button.onPress);
      row.appendChild(btn);
    });

    card.appendChild(row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  },
};
