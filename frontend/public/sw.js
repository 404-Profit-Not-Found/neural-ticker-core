/**
 * Service Worker for Web Push Notifications
 * Handles incoming push events and notification click actions.
 */

// Listen for push events from the server
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'NeuralTicker',
      body: event.data.text(),
    };
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon-robot.png',
    badge: '/favicon-robot.png',
    data: payload.data || {},
    vibrate: [100, 50, 100],
    tag: payload.data?.alertType
      ? `price-alert-${payload.data.symbol}`
      : payload.data?.symbol
        ? `research-${payload.data.symbol}`
        : 'notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'NeuralTicker', options));
});

// Handle notification clicks — focus existing tab or open a new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing tab
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open a new tab if none found
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
