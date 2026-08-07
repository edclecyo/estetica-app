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

function snapshotExists(snap: any) {
  return typeof snap?.exists === 'function' ? snap.exists() : !!snap?.exists;
}

function wrapDocumentSnapshot(snap: any) {
  if (!snap || snap.__beautyHubDocSnapshot) return snap;

  return {
    id: snap.id,
    ref: snap.ref ? wrapDoc(snap.ref) : undefined,
    exists: snapshotExists(snap),
    metadata: snap.metadata,
    data: (options?: any) => snap.data(options),
    get: (fieldPath: any, options?: any) => snap.get(fieldPath, options),
    _snap: snap,
    __beautyHubDocSnapshot: true,
  };
}

function wrapQuerySnapshot(snap: any) {
  if (!snap || snap.__beautyHubQuerySnapshot) return snap;

  return {
    docs: snap.docs.map(wrapDocumentSnapshot),
    empty: snap.empty,
    size: snap.size,
    metadata: snap.metadata,
    query: snap.query,
    forEach: (callback: any, thisArg?: any) =>
      snap.forEach((docSnap: any) => callback.call(thisArg, wrapDocumentSnapshot(docSnap))),
    docChanges: (options?: any) =>
      snap.docChanges(options).map((change: any) => ({
        ...change,
        doc: wrapDocumentSnapshot(change.doc),
      })),
    _snap: snap,
    __beautyHubQuerySnapshot: true,
  };
}

function wrapSnapshot(snap: any) {
  return Array.isArray(snap?.docs) ? wrapQuerySnapshot(snap) : wrapDocumentSnapshot(snap);
}

function listenSnapshot(ref: any, next: any, error?: any) {
  if (typeof next === 'function') {
    return onSnapshot(ref, snap => next(wrapSnapshot(snap)), error);
  }

  if (next && typeof next === 'object') {
    return onSnapshot(
      ref,
      {
        ...next,
        next: (snap: any) => next.next?.(wrapSnapshot(snap)),
      },
      error
    );
  }

  return onSnapshot(ref, next, error);
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
    get: () => withTimeout(getDoc(ref).then(wrapDocumentSnapshot), 'Firestore doc.get'),
    set: (data: any, options?: any) => setDoc(ref, data, options),
    update: (data: any) => updateDoc(ref, data),
    delete: () => deleteDoc(ref),
    onSnapshot: (next: any, error?: any) => listenSnapshot(ref, next, error),
    collection: (name: string) => wrapCollection(collection(ref, name)),
    _ref: ref,
  };
}

function wrapCollection(ref: any) {
  const build = (constraints: any[]) => query(ref, ...constraints);
  return {
    doc: (id?: string) => wrapDoc(id ? doc(ref, id) : doc(ref)),
    add: (data: any) => addDoc(ref, data),
    get: () => withTimeout(getDocs(ref).then(wrapQuerySnapshot), 'Firestore collection.get'),
    where: (field: string, op: any, value: any) => wrapQuery(build([where(field, op, value)])),
    orderBy: (field: string, dir?: any) => wrapQuery(build([orderBy(field, dir)])),
    limit: (n: number) => wrapQuery(build([limit(n)])),
    onSnapshot: (next: any, error?: any) => listenSnapshot(ref, next, error),
    _ref: ref,
  };
}

function wrapQuery(q: any, constraints: any[] = []) {
  const next = (constraint: any) => wrapQuery(query(q, constraint), [...constraints, constraint]);
  return {
    get: () => withTimeout(getDocs(q).then(wrapQuerySnapshot), 'Firestore query.get'),
    where: (field: string, op: any, value: any) => next(where(field, op, value)),
    orderBy: (field: string, dir?: any) => next(orderBy(field, dir)),
    limit: (n: number) => next(limit(n)),
    startAfter: (...values: any[]) => next(startAfter(...values.map(value => value?._snap || value))),
    onSnapshot: (nextFn: any, error?: any) => listenSnapshot(q, nextFn, error),
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

firestore.FieldValue = { serverTimestamp, arrayUnion, increment };
firestore.Timestamp = Timestamp;

export { arrayUnion, dataWithId, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, Timestamp, updateDoc, where, writeBatch };
export default firestore;
