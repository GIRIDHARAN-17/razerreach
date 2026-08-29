import type { User } from "./types";

const AUTH_KEY = "aibuyer_mock_auth";

const MOCK_USER: User = {
  id: "mock-user-1",
  email: "user@aibuyer.app",
  name: "AI Buyer User",
  avatarUrl: null,
};

function isBrowser() {
  return typeof window !== "undefined";
}

export const authService = {
  isAuthenticated: (): boolean => {
    if (!isBrowser()) return false;
    return window.localStorage.getItem(AUTH_KEY) === "true";
  },

  signIn: async (_email: string, _password: string): Promise<User> => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (isBrowser()) window.localStorage.setItem(AUTH_KEY, "true");
    return MOCK_USER;
  },

  signInWithGoogle: async (): Promise<User> => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (isBrowser()) window.localStorage.setItem(AUTH_KEY, "true");
    return MOCK_USER;
  },

  signOut: async (): Promise<void> => {
    if (isBrowser()) window.localStorage.removeItem(AUTH_KEY);
  },

  getUser: (): User | null => {
    return authService.isAuthenticated() ? MOCK_USER : null;
  },
};
