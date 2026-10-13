/**
 * Teeex — Service Worker Registration.
 *
 * Registers the background Service Worker to cache immutable WASM binaries,
 * font metrics, and PDF.js CMaps across hard browser reloads.
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Automatically check for worker updates periodically
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('[Teeex SW] Service worker registration ignored:', err);
      });
  });
}
