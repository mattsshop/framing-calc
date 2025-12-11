
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { FIREBASE_CONFIG } from '../config';

const firebaseConfig = FIREBASE_CONFIG;

let app;
let auth: firebase.auth.Auth | undefined;
let googleProvider: firebase.auth.GoogleAuthProvider | undefined;

try {
    // Check if config is still default placeholder to avoid hard crash
    if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE" || !firebaseConfig.apiKey) {
        // Warning suppressed to avoid console spam if auth isn't being used
        // console.warn("Firebase Config is missing. Update config.ts to enable authentication.");
    } else {
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
        } else {
            app = firebase.app();
        }
        auth = firebase.auth();
        googleProvider = new firebase.auth.GoogleAuthProvider();
    }
} catch (error) {
    console.error("Firebase initialization error. Make sure you have updated the firebaseConfig in config.ts", error);
}

export const signInWithGoogle = async () => {
  if (!auth || !googleProvider) {
      alert("Authentication is not configured. Please update config.ts with your Firebase credentials.");
      return;
  }
  try {
    const result = await auth.signInWithPopup(googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const signOut = async () => {
  if (!auth) return;
  try {
    await auth.signOut();
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

// Wrapper for onAuthStateChanged to match App.tsx usage (single argument)
// and handle uninitialized auth gracefully.
const onAuthStateChangedWrapper = (callback: (user: firebase.User | null) => void) => {
    if (!auth) {
        // If auth didn't initialize, just return a dummy unsubscribe function
        return () => {}; 
    }
    return auth.onAuthStateChanged(callback);
};

export { auth, onAuthStateChangedWrapper as onAuthStateChanged };
export type User = firebase.User;
