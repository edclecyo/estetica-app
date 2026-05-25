import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { getWebApp } from './firebase-core';

async function toUploadBody(file: any) {
  if (file instanceof Blob) return file;
  if (file?.file instanceof Blob) return file.file;
  if (typeof file === 'string' && (file.startsWith('blob:') || file.startsWith('data:'))) {
    return fetch(file).then(res => res.blob());
  }
  return file;
}

function storage() {
  const st = getStorage(getWebApp());
  return {
    ref(path = '') {
      const r = ref(st, path);
      return {
        putFile: async (file: any) => uploadBytes(r, await toUploadBody(file)),
        put: async (file: any) => uploadBytes(r, await toUploadBody(file)),
        getDownloadURL: () => getDownloadURL(r),
        child: (childPath: string) => storage().ref(`${path}/${childPath}`),
      };
    },
  };
}

export default storage;
