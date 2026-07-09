import { Alert, Platform } from 'react-native';

/**
 * Cross-platform dialogs. React Native Web's Alert.alert is a SILENT NO-OP —
 * buttons never render, callbacks never fire — which made every
 * confirm-gated action (remove contact, reset, …) dead on the web app.
 * On web these fall back to window.confirm/alert; native keeps Alert.
 */

export function notify(title: string, body?: string): void {
  if (Platform.OS === 'web') {
    window.alert(body ? `${title}\n\n${body}` : title);
    return;
  }
  Alert.alert(title, body);
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
}

export function confirmAction(opts: ConfirmOptions, onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    if (window.confirm(opts.body ? `${opts.title}\n\n${opts.body}` : opts.title)) onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.body, [
    { text: opts.cancelText, style: 'cancel' },
    {
      text: opts.confirmText,
      style: opts.destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}
