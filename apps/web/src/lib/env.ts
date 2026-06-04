/**
 * Typed access to the build-time `VITE_*` environment (see .env.example).
 * Centralizes env reads so the rest of the app never touches `import.meta.env`
 * directly. All values are client-exposed — security is enforced at the service
 * (Maps referrer restrictions, Firebase rules + App Check), not by hiding these.
 */

const env = import.meta.env;

export const mapsApiKey: string = env.VITE_MAPS_API_KEY ?? '';

/**
 * Optional Google Maps Map ID. A vector Map ID enables map rotation/heading
 * (the compass + heading-up feature). Without it the map renders as a raster
 * basemap that cannot rotate. Create one in Google Cloud → Maps → Map Management.
 */
export const mapsMapId: string = env.VITE_MAPS_MAP_ID ?? '';

/** True when a vector Map ID is configured (rotation/heading available). */
export function isMapRotatable(): boolean {
  return mapsMapId.length > 0;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  databaseURL: string;
}

export const firebaseConfig: FirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL ?? '',
};

export const useFirebaseEmulators: boolean =
  (env.VITE_USE_FIREBASE_EMULATORS ?? '').toLowerCase() === 'true';

/** True once the core Firebase web config is present (set in .env.local). */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.databaseURL);
}

/** True once a Maps key is present. */
export function isMapsConfigured(): boolean {
  return mapsApiKey.length > 0;
}
