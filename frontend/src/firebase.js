// Firebase initialization
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAhIJaE5znNp8X3_ZWsuK1RWn1PpMQY1Rw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "flowtrade210.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "flowtrade210",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "flowtrade210.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "924867520326",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:924867520326:web:fcf9cf14fc1649c5f6e747",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-ELDLV9CN3G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const analytics = getAnalytics(app);
export const googleProvider = new GoogleAuthProvider();

// Set provider custom parameters
googleProvider.setCustomParameters({ prompt: 'select_account' });

export default app;
