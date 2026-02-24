// lib/useNotifications.ts
// Hook para gerenciar permissão de push e enviar notificações locais
'use client';

import { useEffect, useState, useCallback } from 'react';

export type NotifPermission = 'default' | 'granted' | 'denied';

export function useNotifications() {
  const [permission, setPermission] = useState<NotifPermission>('default');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
    setSupported(ok);
    if (ok) setPermission(Notification.permission as NotifPermission);
  }, []);

  // Pede permissão ao usuário
  const requestPermission = useCallback(async (): Promise<NotifPermission> => {
    if (!supported) return 'denied';
    const result = await Notification.requestPermission();
    setPermission(result as NotifPermission);
    return result as NotifPermission;
  }, [supported]);

  // Dispara notificação local via Service Worker
  const notify = useCallback(async (title: string, body: string, url = '/dashboard', tag?: string) => {
    if (!supported || permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || 'rc-' + Date.now(),
      data: { url },
      vibrate: [200, 100, 200],
    } as any);
  }, [supported, permission]);

  // Agenda lembretes de recorrências pendentes
  const scheduleRecurrenceReminders = useCallback(async (recurrences: { id: string; name: string; next_date: string }[]) => {
    if (!supported || permission !== 'granted') return;

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    for (const r of recurrences) {
      if (r.next_date === today) {
        await notify(
          '🔔 Conta vence hoje!',
          `${r.name} vence hoje. Não esqueça de registrar o pagamento.`,
          '/recurrences',
          `rec-${r.id}`
        );
      } else if (r.next_date === tomorrow) {
        await notify(
          '⏰ Conta vence amanhã',
          `${r.name} vence amanhã.`,
          '/recurrences',
          `rec-${r.id}-tomorrow`
        );
      }
    }
  }, [supported, permission, notify]);

  return { supported, permission, requestPermission, notify, scheduleRecurrenceReminders };
}