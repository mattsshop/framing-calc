
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import { FIREBASE_CONFIG } from '../config';

const firebaseConfig = FIREBASE_CONFIG;

let app;
let auth: firebase.auth.Auth | undefined;
let db: firebase.firestore.Firestore | undefined;
let googleProvider: firebase.auth.GoogleAuthProvider | undefined;

// --- Mock Auth State Management ---
// Used when Firebase is not supported in the current environment (e.g. StackBlitz, restricted iframes)
let mockUser: firebase.User | null = null;
const authListeners: Array<(user: firebase.User | null) => void> = [];

try {
    if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE" || !firebaseConfig.apiKey) {
        // Warning suppressed to avoid console spam if auth isn't being used
    } else {
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
        } else {
            app = firebase.app();
        }
        auth = firebase.auth();
        db = firebase.firestore();
        googleProvider = new firebase.auth.GoogleAuthProvider();
    }
} catch (error) {
    console.error("Firebase initialization error. Make sure you have updated the firebaseConfig in config.ts", error);
}

const notifyListeners = (user: firebase.User | null) => {
    authListeners.forEach(listener => listener(user));
};

const createMockUser = (): firebase.User => {
    return {
        uid: 'guest-' + Date.now(),
        displayName: 'Guest Builder',
        email: 'guest@framingpro.app',
        emailVerified: true,
        isAnonymous: true,
        photoURL: null, 
        phoneNumber: null,
        providerData: [],
        metadata: {} as any,
        refreshToken: '',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => 'mock-token',
        getIdTokenResult: async () => ({ token: 'mock' } as any),
        reload: async () => {},
        toJSON: () => ({}),
    } as unknown as firebase.User;
}

export const signInWithGoogle = async () => {
    // 1. Try Firebase Auth
    if (auth && googleProvider) {
        try {
            const result = await auth.signInWithPopup(googleProvider);
            return result.user;
        } catch (error: any) {
            console.warn("Firebase sign-in failed:", error.message);
            
            // Check for specific environment errors where we should fallback to guest mode
            if (error.code === 'auth/operation-not-supported-in-this-environment' || 
                error.code === 'auth/unauthorized-domain' ||
                error.code === 'auth/popup-blocked' ||
                error.code === 'auth/network-request-failed') {
                
                console.log("Falling back to Guest Mode due to environment restrictions.");
                mockUser = createMockUser();
                notifyListeners(mockUser);
                return mockUser;
            }
            throw error;
        }
    } else {
        // Auth not configured, use mock
        console.warn("Auth not configured. Using Guest Mode.");
        mockUser = createMockUser();
        notifyListeners(mockUser);
        return mockUser;
    }
};

export const signOut = async () => {
    if (mockUser) {
        mockUser = null;
        notifyListeners(null);
        return;
    }

    if (!auth) return;
    try {
        await auth.signOut();
    } catch (error) {
        console.error("Error signing out", error);
        throw error;
    }
};

const onAuthStateChangedWrapper = (callback: (user: firebase.User | null) => void) => {
    // Add to local listeners
    authListeners.push(callback);

    let unsubscribeFirebase: firebase.Unsubscribe | undefined;

    if (auth) {
        unsubscribeFirebase = auth.onAuthStateChanged((user) => {
            if (user) {
                // If firebase has a user, it takes precedence
                callback(user);
            } else {
                // If firebase has no user, check if we have a mock user active
                callback(mockUser);
            }
        });
    } else {
        // Initial callback if no auth instance
        callback(mockUser);
    }

    return () => {
        const idx = authListeners.indexOf(callback);
        if (idx > -1) authListeners.splice(idx, 1);
        if (unsubscribeFirebase) unsubscribeFirebase();
    };
};

// --- User Profile & Approval Logic ---

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: any;
}

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
    if (!db) return null; // Fallback for mock mode or unconfigured DB
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            return doc.data() as UserProfile;
        }
        return null;
    } catch (e) {
        console.error("Error fetching user profile", e);
        return null;
    }
};

export const createUserProfile = async (user: firebase.User): Promise<UserProfile> => {
    if (!db) {
        // Mock mode fallback
        return {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Guest',
            photoURL: user.photoURL || '',
            status: 'approved', // Mock users are auto-approved
            createdAt: new Date()
        };
    }

    const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || '',
        status: 'pending', // Default to pending
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('users').doc(user.uid).set(newProfile);
    return newProfile;
};

export const getPendingUsers = async (): Promise<UserProfile[]> => {
    if (!db) return [];
    const snapshot = await db.collection('users').where('status', '==', 'pending').get();
    return snapshot.docs.map(doc => doc.data() as UserProfile);
};

export const updateUserStatus = async (uid: string, status: 'approved' | 'rejected') => {
    if (!db) return;
    await db.collection('users').doc(uid).update({ status });
};


export { auth, onAuthStateChangedWrapper as onAuthStateChanged };
export type User = firebase.User;
