import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// TODO: Replace with your Firebase project config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const firestore = getFirestore(app);

// 開啟 Firestore 原生離線快取 (Offline Persistence)
enableIndexedDbPersistence(firestore).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('離線快取啟用失敗：可能有多個分頁同時開啟此 App。');
  } else if (err.code === 'unimplemented') {
    console.warn('離線快取啟用失敗：瀏覽器不支援此功能。');
  }
});