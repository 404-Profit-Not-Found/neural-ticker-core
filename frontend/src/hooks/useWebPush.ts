import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export function useWebPush() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check support and current subscription status on mount.
  // If the browser has a subscription, re-send it to the backend so the
  // server-side record stays in sync (the server auto-deletes expired
  // subscriptions on 404/410, but the browser retains its local copy).
  useEffect(() => {
    const check = async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      setIsSupported(supported);

      if (!supported) {
        setIsLoading(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        if (registration) {
          const sub = await registration.pushManager.getSubscription();
          setIsSubscribed(!!sub);

          if (sub) {
            const subJson = sub.toJSON();
            await api.post('/push/subscribe', {
              endpoint: subJson.endpoint,
              keys: {
                p256dh: subJson.keys?.p256dh,
                auth: subJson.keys?.auth,
              },
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        console.warn('Failed to check push subscription:', err);
      } finally {
        setIsLoading(false);
      }
    };

    check();
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;

    setIsSubscribed(true); // optimistic
    setIsLoading(true);

    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Get VAPID key from backend
      const { data } = await api.get('/push/vapid-key');
      const vapidKey = data.key;

      if (!vapidKey) {
        console.warn('No VAPID key configured on server');
        setIsSubscribed(false);
        return false;
      }

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission denied');
        setIsSubscribed(false);
        return false;
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Send subscription to backend
      const subJson = subscription.toJSON();
      await api.post('/push/subscribe', {
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
        },
      });

      return true;
    } catch (err) {
      console.error('Failed to subscribe to push:', err);
      setIsSubscribed(false); // revert on error
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    setIsSubscribed(false); // optimistic
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          // Tell backend to remove subscription
          await api.post('/push/unsubscribe', {
            endpoint: sub.endpoint,
          });
          // Unsubscribe locally
          await sub.unsubscribe();
        }
      }

      return true;
    } catch (err) {
      console.error('Failed to unsubscribe from push:', err);
      setIsSubscribed(true); // revert on error
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  };
}
