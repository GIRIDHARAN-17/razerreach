import {
  signInWithPopup,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider, appleProvider, isFirebaseConfigured } from "../firebase";
import { apiClient, setAuthToken, clearAuthToken } from "../api/client";
import type { User } from "./types";

interface AuthUserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url?: string;
}

interface AuthResponse {
  access_token: string;
  user: AuthUserResponse;
}

interface AuthError {
  code?: string;
  status?: number;
  message?: string;
}

let currentUser: User | null = null;
let authInitialized = false;
const initListeners: Array<(initialized: boolean) => void> = [];

function isBrowser() {
  return typeof window !== "undefined";
}

const notifyListeners = () => {
  initListeners.forEach((cb) => cb(authInitialized));
};

async function loadCurrentUser() {
  const token = localStorage.getItem("razorreach_token");
  if (!token) {
    // No stored token — user is not logged in, skip the /auth/me call
    return;
  }
  try {
    const data = await apiClient<AuthUserResponse>("/auth/me");
    currentUser = {
      id: data.id,
      email: data.email,
      name: data.name,
      avatarUrl: data.avatar_url || null,
      role: data.role,
    };
  } catch (err) {
    currentUser = null;
    clearAuthToken();
  }
}

// Initial session load
if (isBrowser()) {
  loadCurrentUser().finally(() => {
    authInitialized = true;
    notifyListeners();
  });
} else {
  authInitialized = true;
}

export const authService = {
  waitForAuthInit: (): Promise<boolean> => {
    if (authInitialized) return Promise.resolve(true);
    return new Promise((resolve) => {
      const listener = (initialized: boolean) => {
        if (initialized) resolve(true);
      };
      initListeners.push(listener);
    });
  },

  getAuthState: (): "AUTH_LOADING" | "AUTHENTICATED" | "UNAUTHENTICATED" => {
    if (!authInitialized) return "AUTH_LOADING";
    return currentUser ? "AUTHENTICATED" : "UNAUTHENTICATED";
  },

  isInitialized: (): boolean => authInitialized,
  isAuthenticated: (): boolean => Boolean(currentUser),
  getUser: (): User | null => currentUser,
  getCurrentUser: (): User | null => currentUser,

  getIdToken: async (): Promise<string | null> => {
    // This is primarily a legacy call for Firebase, we just return a placeholder or our JWT if needed.
    return localStorage.getItem("razorreach_token");
  },

  signIn: async (email: string, password: string, role?: string): Promise<User> => {
    const cleanEmail = email.trim().toLowerCase();
    if (isFirebaseConfigured() && auth) {
      try {
        const { signInWithEmailAndPassword } = await import("firebase/auth");
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const idToken = await cred.user.getIdToken(true);
        const data = await apiClient<AuthResponse>("/auth/firebase", {
          method: "POST",
          requireAuth: false,
          data: { id_token: idToken, role },
        });
        setAuthToken(data.access_token);
        currentUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          avatarUrl: data.user.avatar_url || null,
          role: data.user.role,
        };
        return currentUser;
      } catch (fbErr: any) {
        console.warn("Firebase sign in failed, trying direct auth fallback:", fbErr);
      }
    }

    const data = await apiClient<AuthResponse>("/auth/login", {
      method: "POST",
      requireAuth: false,
      data: { email: cleanEmail, password },
    });
    setAuthToken(data.access_token);
    currentUser = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      avatarUrl: data.user.avatar_url || null,
      role: data.user.role,
    };
    return currentUser;
  },

  signUp: async (email: string, password: string, role: string = "customer"): Promise<User> => {
    const cleanEmail = email.trim().toLowerCase();
    if (isFirebaseConfigured() && auth) {
      try {
        const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import("firebase/auth");
        let firebaseUser;
        try {
          const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          firebaseUser = cred.user;
        } catch (fbErr: any) {
          if (fbErr?.code === "auth/email-already-in-use") {
            const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
            firebaseUser = cred.user;
          } else {
            throw fbErr;
          }
        }
        const idToken = await firebaseUser.getIdToken(true);
        const data = await apiClient<AuthResponse>("/auth/firebase", {
          method: "POST",
          requireAuth: false,
          data: { id_token: idToken, role },
        });
        setAuthToken(data.access_token);
        currentUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          avatarUrl: data.user.avatar_url || null,
          role: data.user.role,
        };
        return currentUser;
      } catch (fbErr: any) {
        console.warn("Firebase sign up failed, trying direct auth fallback:", fbErr);
      }
    }

    const name = cleanEmail.split("@")[0];
    await apiClient<AuthUserResponse>("/auth/register", {
      method: "POST",
      requireAuth: false,
      data: { email: cleanEmail, password, name, role },
    });
    const data = await apiClient<AuthResponse>("/auth/login", {
      method: "POST",
      requireAuth: false,
      data: { email: cleanEmail, password },
    });
    setAuthToken(data.access_token);
    currentUser = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      avatarUrl: data.user.avatar_url || null,
      role: data.user.role,
    };
    return currentUser;
  },

  signInWithGoogle: async (role?: string): Promise<User> => {
    if (!isFirebaseConfigured() || !auth) {
      throw new Error("Social login is not configured correctly.");
    }
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken(true);
      const data = await apiClient<AuthResponse>("/auth/firebase", {
        method: "POST",
        requireAuth: false,
        data: { id_token: idToken, role },
      });
      setAuthToken(data.access_token);
      currentUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        avatarUrl: data.user.avatar_url || null,
        role: data.user.role,
      };
      return currentUser;
    } catch (err: unknown) {
      const authErr = err as AuthError;
      if (
        authErr?.code === "auth/popup-closed-by-user" ||
        authErr?.code === "auth/cancelled-popup-request"
      ) {
        throw new Error("Google sign-in was cancelled.");
      } else if (authErr?.code === "auth/network-request-failed") {
        throw new Error("Unable to connect to the authentication service.");
      } else if (authErr?.status === 503 || authErr?.message?.includes("503")) {
        throw new Error("Social login is not configured correctly on backend.");
      } else if (
        authErr?.status === 401 ||
        authErr?.status === 400 ||
        authErr?.status === 409 ||
        authErr?.status === 403
      ) {
        throw new Error(authErr.message || "Authentication could not be verified.");
      }
      throw new Error(authErr?.message || "Unable to complete account authentication.");
    }
  },

  signInWithApple: async (role?: string): Promise<User> => {
    if (!isFirebaseConfigured() || !auth) {
      throw new Error("Social login is not configured correctly.");
    }
    try {
      const cred = await signInWithPopup(auth, appleProvider);
      const idToken = await cred.user.getIdToken(true);
      const data = await apiClient<AuthResponse>("/auth/firebase", {
        method: "POST",
        requireAuth: false,
        data: { id_token: idToken, role },
      });
      setAuthToken(data.access_token);
      currentUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        avatarUrl: data.user.avatar_url || null,
        role: data.user.role,
      };
      return currentUser;
    } catch (err: unknown) {
      const authErr = err as AuthError;
      if (
        authErr?.code === "auth/popup-closed-by-user" ||
        authErr?.code === "auth/cancelled-popup-request"
      ) {
        throw new Error("Apple sign-in was cancelled.");
      } else if (authErr?.code === "auth/network-request-failed") {
        throw new Error("Unable to connect to the authentication service.");
      } else if (authErr?.status === 503 || authErr?.message?.includes("503")) {
        throw new Error("Social login is not configured correctly on backend.");
      } else if (
        authErr?.status === 401 ||
        authErr?.status === 400 ||
        authErr?.status === 409 ||
        authErr?.status === 403
      ) {
        throw new Error(authErr.message || "Authentication could not be verified.");
      }
      throw new Error(authErr?.message || "Unable to complete account authentication.");
    }
  },

  sendPasswordReset: async (email: string): Promise<void> => {
    if (!isFirebaseConfigured() || !auth) {
      throw new Error("Firebase Authentication is not configured.");
    }
    await sendPasswordResetEmail(auth, email);
  },

  signOut: async (): Promise<void> => {
    if (isFirebaseConfigured() && auth) {
      await firebaseSignOut(auth).catch(() => {});
    }
    clearAuthToken();
    currentUser = null;
    if (isBrowser()) {
      window.sessionStorage.clear();
    }
  },
};
