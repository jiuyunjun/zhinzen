import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectDatabaseEmulator,
  getDatabase,
  type Database,
} from 'firebase/database';
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from 'firebase/functions';

import {
  firebaseConfig,
  isFirebaseConfigured,
  useFirebaseEmulators,
} from './env';

export interface FirebaseServices {
  app: FirebaseApp;
  firestore: Firestore;
  database: Database;
  functions: Functions;
}

let services: FirebaseServices | null = null;
let emulatorsConnected = false;

export function getFirebaseServices(): FirebaseServices {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Fill VITE_FIREBASE_* in .env.local.');
  }

  if (services) {
    return services;
  }

  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const firestore = getFirestore(app);
  const database = getDatabase(app);
  const functions = getFunctions(app);

  if (useFirebaseEmulators && !emulatorsConnected) {
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    connectDatabaseEmulator(database, '127.0.0.1', 9000);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorsConnected = true;
  }

  services = {
    app,
    firestore,
    database,
    functions,
  };

  return services;
}
