import { mapsApiKey } from './env';

let loadPromise: Promise<typeof google.maps> | null = null;

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof google !== 'undefined' && google.maps) {
    return Promise.resolve(google.maps);
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (!mapsApiKey) {
      reject(new Error('missing-maps-api-key'));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-zhinzen-maps]');
    if (existing) {
      existing.addEventListener('load', () => resolve(google.maps), { once: true });
      existing.addEventListener('error', () => reject(new Error('maps-load-failed')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.dataset.zhinzenMaps = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      mapsApiKey,
    )}&v=weekly`;
    script.addEventListener('load', () => resolve(google.maps), { once: true });
    script.addEventListener('error', () => reject(new Error('maps-load-failed')), { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
}
