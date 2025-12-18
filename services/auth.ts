import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import { FIREBASE_CONFIG } from '../config';

const firebaseConfig = FIREBASE_CONFIG;

let auth: firebase.auth.Auth | undefined;
let db: firebase.firestore.Firestore | undefined;
let googleProvider: firebase.auth.GoogleAuthProvider | undefined;

// --- Mock Auth State ---
let mockUser: firebase.User | null = null;
const authListeners: Array<(user: firebase.User | null) => void> = [];

// Export User type for the app
export type User = firebase.User;

try {
    const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('YOUR_API_KEY');
    
    if (isConfigured) {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        auth = firebase.auth();
        db = firebase.firestore();
        googleProvider = new firebase.auth.GoogleAuthProvider();
    }
} catch (error) {
    console.warn("Firebase initialization skipped. Using Guest Mode.");
}

const notifyListeners = (user: firebase.User | null) => {
    authListeners.forEach(listener => listener(user));
};

const createMockUser = (): firebase.User => {
    return {
        uid: 'guest-user-123',
        displayName: 'Guest Builder',
        email: 'guest@framingpro.app',
        photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest',
        emailVerified: true,
        isAnonymous: true,
    } as unknown as firebase.User;
};

export const signInWithGoogle = async () => {
    if (auth && googleProvider) {
        try {
            const result = await auth.signInWithPopup(googleProvider);
            return result.user;
        } catch (error: any) {
            console.error("Firebase sign-in failed, falling back to Guest:", error.message);
            mockUser = createMockUser();
            notifyListeners(mockUser);
            return mockUser;
        }
    } else {
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
    if (auth) {
        try {
            await auth.signOut();
        } catch (e) {
            console.error("Sign out error", e);
        }
    }
};

export const onAuthStateChanged = (callback: (user: firebase.User | null) => void) => {
    authListeners.push(callback);
    
    let unsubscribeFirebase: firebase.Unsubscribe | undefined;
    if (auth) {
        unsubscribeFirebase = auth.onAuthStateChanged((user) => {
            callback(user || mockUser);
        });
    } else {
        // Immediate notify for guest mode
        setTimeout(() => callback(mockUser), 0);
    }

    return () => {
        const idx = authListeners.indexOf(callback);
        if (idx > -1) authListeners.splice(idx, 1);
        if (unsubscribeFirebase) unsubscribeFirebase();
    };
};

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: any;
}

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
    if (uid === 'guest-user-123') {
        return {
            uid,
            email: 'guest@framingpro.app',
            displayName: 'Guest Builder',
            photoURL: '',
            status: 'approved',
            createdAt: new Date()
        };
    }
    if (!db) return null;
    try {
        const doc = await db.collection('users').doc(uid).get();
        return doc.exists ? (doc.data() as UserProfile) : null;
    } catch (e) {
        return null;
    }
};

export const createUserProfile = async (user: firebase.User): Promise<UserProfile> => {
    const profile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || '',
        status: user.isAnonymous ? 'approved' : 'pending',
        createdAt: new Date()
    };

    if (db && !user.isAnonymous) {
        try {
            await db.collection('users').doc(user.uid).set({
                ...profile,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.error("Firestore error", e);
        }
    }
    return profile;
};

export const getPendingUsers = async (): Promise<UserProfile[]> => {
    if (!db) return [];
    try {
        const snapshot = await db.collection('users').where('status', '==', 'pending').get();
        return snapshot.docs.map(doc => doc.data() as UserProfile);
    } catch (e) {
        return [];
    }
};

export const updateUserStatus = async (uid: string, status: 'approved' | 'rejected') => {
    if (!db) return;
    try {
        await db.collection('users').doc(uid).update({ status });
    } catch (e) {
        console.error("Update user status error", e);
    }
};