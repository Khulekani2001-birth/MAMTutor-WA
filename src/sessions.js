/**
 * sessions.js — Simple in-memory session store with 24-hour TTL
 * For production, replace with Redis or a database.
 */

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class SessionStore {
  constructor() {
    this._store = new Map();
    // Cleanup expired sessions every hour
    setInterval(() => this._cleanup(), 60 * 60 * 1000);
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.updatedAt > SESSION_TTL_MS) {
      this._store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data) {
    this._store.set(key, { data, updatedAt: Date.now() });
  }

  delete(key) {
    this._store.delete(key);
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._store.entries()) {
      if (now - entry.updatedAt > SESSION_TTL_MS) {
        this._store.delete(key);
      }
    }
    console.log(`Session cleanup: ${this._store.size} active sessions`);
  }

  get size() {
    return this._store.size;
  }
}

export const sessionStore = new SessionStore();
