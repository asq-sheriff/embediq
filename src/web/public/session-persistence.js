/**
 * SecureSessionManager — encrypted sessionStorage checkpoint.
 * Survives page refresh, dies on tab close (key lives only in JS memory).
 * Uses Web Crypto API (AES-256-GCM) for encryption at rest in sessionStorage.
 */
class SecureSessionManager {
  constructor() {
    this._sessionKey = null;
    this._initialized = false;
  }

  async _ensureKey() {
    if (!this._sessionKey) {
      this._sessionKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    }
    return this._sessionKey;
  }

  async saveCheckpoint(answers, metadata = {}) {
    try {
      const key = await this._ensureKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const payload = JSON.stringify({
        answers,
        metadata: {
          ...metadata,
          savedAt: new Date().toISOString(),
          questionCount: Object.keys(answers).length,
        },
      });

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(payload)
      );

      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      sessionStorage.setItem(
        'embediq_checkpoint',
        btoa(String.fromCharCode(...combined))
      );
      return true;
    } catch (err) {
      console.warn('Session checkpoint save failed:', err);
      return false;
    }
  }

  async restoreCheckpoint() {
    try {
      const stored = sessionStorage.getItem('embediq_checkpoint');
      if (!stored || !this._sessionKey) return null;

      const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this._sessionKey,
        ciphertext
      );

      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (err) {
      sessionStorage.removeItem('embediq_checkpoint');
      return null;
    }
  }

  clearCheckpoint() {
    sessionStorage.removeItem('embediq_checkpoint');
  }
}

// Singleton instance — used by app.js
const sessionManager = new SecureSessionManager();
