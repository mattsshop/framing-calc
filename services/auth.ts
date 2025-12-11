
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged as firebaseOnAuthStateChanged, type User, type Auth } from 'firebase/auth';

// --- CONFIGURATION REQUIRED ---
// Paste your firebase config object from the Firebase Console here:
// Project Settings -> General -> Your apps -> SDK setup and configuration -> Config
const firebaseConfig = {
  apiKey: "AIzaSyDeHJuPDWHg8d0kBnYFkBk_Y8FZfXJrA1o",
  authDomain: "framing-calc.firebaseapp.com",
  projectId: "framing-calc",
  storageBucket: "framing-calc.firebasestorage.app",
  messagingSenderId: "528108938610",
  appId: "1:528108938610:web:f8c1ca81dc8b3ea2eae9eb",
  measurementId: "G-L9RTQSGT82"
};

let app;
let auth: Auth | undefined;
let googleProvider: GoogleAuthProvider | undefined;

try {
    // Check if config is still default placeholder to avoid hard crash
    if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE") {
        console.warn("Firebase Config is missing. Update services/auth.ts to enable authentication.");
    } else {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        googleProvider = new GoogleAuthProvider();
    }
} catch (error) {
    console.error("Firebase initialization error. Make sure you have updated the firebaseConfig in services/auth.ts", error);
}

export const signInWithGoogle = async () => {
  if (!auth || !googleProvider) {
      alert("Authentication is not configured. Please update services/auth.ts with your Firebase credentials.");
      return;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const signOut = async () => {
  if (!auth) return;
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

// Wrapper for onAuthStateChanged to match App.tsx usage (single argument)
// and handle uninitialized auth gracefully.
const onAuthStateChangedWrapper = (callback: (user: User | null) => void) => {
    if (!auth) {
        // If auth didn't initialize, just return a dummy unsubscribe function
        return () => {}; 
    }
    return firebaseOnAuthStateChanged(auth, callback);
};

export { auth, onAuthStateChangedWrapper as onAuthStateChanged, type User };
