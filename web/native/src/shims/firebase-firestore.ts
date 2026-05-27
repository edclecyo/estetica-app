import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getWebApp } from './firebase-core';

function dataWithId(snap: any) {
  return { id: snap.id, ...snap.data() };
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label} demorou para responder`));
    }, timeoutMs);

    promise.then(
      value => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      error => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function wrapDoc(ref: any) {
  return {
    get: () => withTimeout(getDoc(ref), 'Firestore doc.get'),
    set: (data: any, options?: any) => setDoc(ref, data, options),
    update: (data: any) => updateDoc(ref, data),
    delete: () => deleteDoc(ref),
    onSnapshot: (next: any, error?: any) => onSnapshot(ref, next, error),
    collection: (name: string) => wrapCollection(collection(ref, name)),
    _ref: ref,
  };
}

function wrapCollection(ref: any) {
  const build = (constraints: any[]) => query(ref, ...constraints);
  return {
    doc: (id?: string) => wrapDoc(id ? doc(ref, id) : doc(ref)),
    add: (data: any) => addDoc(ref, data),
    get: () => withTimeout(getDocs(ref), 'Firestore collection.get'),
    where: (field: string, op: any, value: any) => wrapQuery(build([where(field, op, value)])),
    orderBy: (field: string, dir?: any) => wrapQuery(build([orderBy(field, dir)])),
    limit: (n: number) => wrapQuery(build([limit(n)])),
    onSnapshot: (next: any, error?: any) => onSnapshot(ref, next, error),
    _ref: ref,
  };
}

function wrapQuery(q: any, constraints: any[] = []) {
  const next = (constraint: any) => wrapQuery(query(q, constraint), [...constraints, constraint]);
  return {
    get: () => withTimeout(getDocs(q), 'Firestore query.get'),
    where: (field: string, op: any, value: any) => next(where(field, op, value)),
    orderBy: (field: string, dir?: any) => next(orderBy(field, dir)),
    limit: (n: number) => next(limit(n)),
    startAfter: (...values: any[]) => next(startAfter(...values)),
    onSnapshot: (nextFn: any, error?: any) => onSnapshot(q, nextFn, error),
    _ref: q,
  };
}

function firestore() {
  const db = getFirestore(getWebApp());
  return {
    batch: () => {
      const batch = writeBatch(db);

      return {
        set: (ref: any, data: any, options?: any) =>
          options ? batch.set(ref._ref || ref, data, options) : batch.set(ref._ref || ref, data),
        update: (ref: any, data: any) => batch.update(ref._ref || ref, data),
        delete: (ref: any) => batch.delete(ref._ref || ref),
        commit: () => batch.commit(),
      };
    },
    collection: (name: string) => wrapCollection(collection(db, name)),
  };
}

firestore.FieldValue = { serverTimestamp, arrayUnion };
firestore.Timestamp = Timestamp;

export { arrayUnion, dataWithId, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, Timestamp, updateDoc, where, writeBatch };
export default firestore;
