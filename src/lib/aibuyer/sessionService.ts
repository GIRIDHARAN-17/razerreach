/**
 * Session management service for AI Buyer frontend.
 * Manages conversational session_id lifecycle across multi-turn queries.
 * Authoritative state remains on backend (AgentState / MongoDB).
 */

const SESSION_STORAGE_KEY = "razorreach_ai_session_id";
const USER_STORAGE_KEY = "razorreach_ai_user_id";

class AISessionService {
  private memorySessionId: string | null = null;
  private memoryUserId: string | null = null;

  private isBrowser(): boolean {
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
  }

  private getStorageKey(userId?: string): string {
    const uid = userId || this.memoryUserId;
    return uid ? `razorreach_ai_session:${uid}` : SESSION_STORAGE_KEY;
  }

  /**
   * Get the current active conversational session_id.
   */
  public getSessionId(): string | null {
    if (!this.isBrowser()) {
      return this.memorySessionId;
    }
    try {
      const key = this.getStorageKey();
      return sessionStorage.getItem(key) || sessionStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return this.memorySessionId;
    }
  }

  /**
   * Store an active session_id returned from backend /api/ai/search.
   */
  public setSessionId(sessionId: string, userId?: string): void {
    this.memorySessionId = sessionId;
    if (userId) {
      this.memoryUserId = userId;
    }

    if (!this.isBrowser()) return;

    try {
      const key = this.getStorageKey(userId);
      if (sessionId) {
        sessionStorage.setItem(key, sessionId);
      } else {
        sessionStorage.removeItem(key);
      }

      if (userId) {
        sessionStorage.setItem(USER_STORAGE_KEY, userId);
      }
    } catch (e) {
      console.warn("Could not save AI session to sessionStorage", e);
    }
  }

  /**
   * Reset the conversational session for "New Search".
   * Note: This does NOT mutate the user's cart, orders, or database state.
   */
  public clearSession(): void {
    this.memorySessionId = null;
    if (!this.isBrowser()) return;
    try {
      const key = this.getStorageKey();
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn("Could not clear AI session from sessionStorage", e);
    }
  }

  /**
   * Ensure the session belongs to the currently authenticated user.
   * If user ID changed, clears the session to prevent cross-user leakage.
   */
  public validateUser(currentUserId: string | undefined): void {
    if (!currentUserId) return;

    let storedUserId: string | null = this.memoryUserId;
    if (this.isBrowser()) {
      try {
        storedUserId = sessionStorage.getItem(USER_STORAGE_KEY);
      } catch {
        storedUserId = this.memoryUserId;
      }
    }

    if (storedUserId && storedUserId !== currentUserId) {
      // User switched — clear stale session
      this.clearSession();
      this.memoryUserId = currentUserId;
      if (this.isBrowser()) {
        try {
          sessionStorage.setItem(USER_STORAGE_KEY, currentUserId);
        } catch {
          // ignore
        }
      }
    } else if (!storedUserId) {
      this.memoryUserId = currentUserId;
      if (this.isBrowser()) {
        try {
          sessionStorage.setItem(USER_STORAGE_KEY, currentUserId);
        } catch {
          // ignore
        }
      }
    }
  }
}

export const sessionService = new AISessionService();
