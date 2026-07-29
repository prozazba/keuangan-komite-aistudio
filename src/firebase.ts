import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore,
  collection as fsCollection, 
  doc as fsDoc, 
  deleteDoc as fsDeleteDoc, 
  setDoc as fsSetDoc, 
  updateDoc as fsUpdateDoc, 
  writeBatch as fsWriteBatch, 
  onSnapshot as fsOnSnapshot
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Check offline simulation override flag
function isOffline() {
  return localStorage.getItem('isOfflineMode') === 'true';
}

// Active Snapshot listeners per collection
const listeners: Record<string, Set<(snap: any) => void>> = {
  students: new Set(),
  transactions: new Set(),
  events: new Set(),
  student_bills: new Set(),
  classes: new Set(),
};

// In-memory cache of collection items fetched from NeonDb PostgreSQL
const cache: Record<string, any[]> = {
  students: [],
  transactions: [],
  events: [],
  student_bills: [],
  classes: []
};

// Trigger registered callbacks for a given collection name
async function fetchAndNotify(collName: string) {
  if (isOffline()) {
    const rawData = localStorage.getItem(`fs_${collName}`);
    const items = rawData ? JSON.parse(rawData) : [];
    cache[collName] = items;
  } else {
    try {
      const res = await fetch(`/api/${collName}`);
      if (res.ok) {
        const items = await res.json();
        cache[collName] = items;
      }
    } catch (err) {
      console.warn(`Failed fetching ${collName} from NeonDb PostgreSQL API:`, err);
    }
  }

  const items = cache[collName] || [];
  const snap = {
    empty: items.length === 0,
    docs: items.map((doc: any) => ({
      id: doc.id || '',
      data: () => doc
    }))
  };

  const list = listeners[collName];
  if (list) {
    list.forEach(cb => {
      try {
        cb(snap);
      } catch (e) {
        console.error(`Error in listener for ${collName}:`, e);
      }
    });
  }
}

// Polling interval for live sync with NeonDb
let pollingTimer: NodeJS.Timeout | null = null;
function ensurePolling() {
  if (!pollingTimer) {
    pollingTimer = setInterval(() => {
      Object.keys(listeners).forEach(collName => {
        if (listeners[collName].size > 0) {
          fetchAndNotify(collName);
        }
      });
    }, 4000);
  }
}

// Proxy API implementations connecting to NeonDb PostgreSQL
export function collection(databaseInstance: any, pathName: string) {
  return { path: pathName, isMock: true };
}

export function doc(dbOrColl: any, pathOrColl?: string, docId?: string) {
  if (typeof dbOrColl === 'string') {
    return { collection: dbOrColl, id: pathOrColl, isMock: true };
  }
  if (dbOrColl && dbOrColl.path) {
    return { collection: dbOrColl.path, id: pathOrColl, isMock: true };
  }
  return { collection: 'unknown', id: pathOrColl, isMock: true };
}

export function onSnapshot(collRef: any, callback: (snap: any) => void, errorCallback?: (err: any) => void) {
  const collName = collRef.path || 'unknown';
  if (!listeners[collName]) {
    listeners[collName] = new Set();
  }
  listeners[collName].add(callback);
  ensurePolling();

  // Fetch immediately for the newly subscribed collection
  fetchAndNotify(collName);

  return () => {
    listeners[collName]?.delete(callback);
  };
}

export async function setDoc(docRef: any, data: any, options?: any) {
  const collName = docRef.collection || 'unknown';
  const docId = docRef.id || 'unknown';

  const docData = { id: docId, ...data };

  if (isOffline()) {
    const key = `fs_${collName}`;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = list.findIndex((x: any) => x.id === docId);
    if (idx >= 0) {
      list[idx] = options?.merge ? { ...list[idx], ...data } : docData;
    } else {
      list.push(docData);
    }
    localStorage.setItem(key, JSON.stringify(list));
  } else {
    try {
      await fetch(`/api/${collName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docData)
      });
    } catch (err) {
      console.error(`Error saving doc to NeonDb PostgreSQL (${collName}):`, err);
    }
  }

  fetchAndNotify(collName);
}

export async function updateDoc(docRef: any, data: any) {
  const collName = docRef.collection || 'unknown';
  const docId = docRef.id || 'unknown';

  if (isOffline()) {
    const key = `fs_${collName}`;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = list.findIndex((x: any) => x.id === docId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data };
      localStorage.setItem(key, JSON.stringify(list));
    }
  } else {
    try {
      await fetch(`/api/${collName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId, ...data })
      });
    } catch (err) {
      console.error(`Error updating doc in NeonDb PostgreSQL (${collName}):`, err);
    }
  }

  fetchAndNotify(collName);
}

export async function deleteDoc(docRef: any) {
  const collName = docRef.collection || 'unknown';
  const docId = docRef.id || 'unknown';

  if (isOffline()) {
    const key = `fs_${collName}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list = list.filter((x: any) => x.id !== docId);
    localStorage.setItem(key, JSON.stringify(list));
  } else {
    try {
      await fetch(`/api/${collName}/${docId}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.error(`Error deleting doc in NeonDb PostgreSQL (${collName}):`, err);
    }
  }

  fetchAndNotify(collName);
}

export function writeBatch(databaseInstance: any) {
  const operations: Array<{ type: 'set' | 'update' | 'delete'; collection: string; id: string; data?: any }> = [];

  const batchObject = {
    set: (docRef: any, data: any, options?: any) => {
      const collName = docRef.collection || 'unknown';
      const docId = docRef.id || 'unknown';
      operations.push({ type: 'set', collection: collName, id: docId, data: { id: docId, ...data } });
      return batchObject;
    },
    update: (docRef: any, data: any) => {
      const collName = docRef.collection || 'unknown';
      const docId = docRef.id || 'unknown';
      operations.push({ type: 'update', collection: collName, id: docId, data });
      return batchObject;
    },
    delete: (docRef: any) => {
      const collName = docRef.collection || 'unknown';
      const docId = docRef.id || 'unknown';
      operations.push({ type: 'delete', collection: collName, id: docId });
      return batchObject;
    },
    commit: async () => {
      const affected = new Set(operations.map(op => op.collection));

      if (isOffline()) {
        operations.forEach(op => {
          const key = `fs_${op.collection}`;
          let list = JSON.parse(localStorage.getItem(key) || '[]');
          if (op.type === 'delete') {
            list = list.filter((x: any) => x.id !== op.id);
          } else if (op.data) {
            const idx = list.findIndex((x: any) => x.id === op.id);
            if (idx >= 0) {
              list[idx] = { ...list[idx], ...op.data };
            } else {
              list.push(op.data);
            }
          }
          localStorage.setItem(key, JSON.stringify(list));
        });
      } else {
        try {
          await fetch('/api/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operations })
          });
        } catch (err) {
          console.error("Error committing batch to NeonDb PostgreSQL:", err);
        }
      }

      affected.forEach(collName => {
        fetchAndNotify(collName);
      });
    }
  };

  return batchObject;
}
