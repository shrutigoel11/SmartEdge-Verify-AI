/**
 * ConfigUtil.ts
 *
 * Configures the backend laptop API server connection endpoint.
 * Persists changes in expo-secure-store so the IP address can be adjusted
 * dynamically on physical devices without recompiling code or native builds.
 */

import * as SecureStore from 'expo-secure-store';

const SERVER_API_URL_KEY = 'SMART_EDGE_VERIFY_SERVER_API_URL';

// Default fallback API endpoint (assumes standard local developer network setup)
const DEFAULT_API_BASE_URL = 'http://192.168.1.100:5000';

export class ConfigUtil {
  private static activeApiBaseUrl = DEFAULT_API_BASE_URL;

  /**
   * Loads the saved API Base URL from SecureStore on startup.
   */
  public static async init(): Promise<string> {
    try {
      const savedUrl = await SecureStore.getItemAsync(SERVER_API_URL_KEY);
      if (savedUrl) {
        this.activeApiBaseUrl = savedUrl;
        console.log(`[ConfigUtil] Loaded custom API Server URL: ${this.activeApiBaseUrl}`);
      } else {
        console.log(`[ConfigUtil] Using default API Server URL: ${this.activeApiBaseUrl}`);
      }
    } catch (error) {
      console.warn('[ConfigUtil] Failed to load server URL from SecureStore, using default.', error);
    }
    return this.activeApiBaseUrl;
  }

  /**
   * Synchronously retrieves the cached API base URL.
   */
  public static getApiBaseUrl(): string {
    return this.activeApiBaseUrl;
  }

  /**
   * Saves and caches a new API server URL.
   */
  public static async saveApiBaseUrl(newUrl: string): Promise<void> {
    try {
      // Validate string has protocol and host
      let formattedUrl = newUrl.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `http://${formattedUrl}`;
      }

      this.activeApiBaseUrl = formattedUrl;
      await SecureStore.setItemAsync(SERVER_API_URL_KEY, formattedUrl);
      console.log(`[ConfigUtil] API Server URL successfully saved and updated: ${formattedUrl}`);
    } catch (error) {
      console.error('[ConfigUtil] Failed to save custom API Server URL to SecureStore:', error);
      throw error;
    }
  }
}
