/**
 * CONNECTIVITY SERVICE
 * 
 * Simple connectivity monitoring service
 * Tracks online/offline status for sync operations
 */

class ConnectivityService {
  private isOnlineStatus: boolean = navigator.onLine;
  private listeners: ((isOnline: boolean) => void)[] = [];

  constructor() {
    // Listen for browser online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.isOnlineStatus;
  }

  /**
   * Add connectivity change listener
   */
  addListener(listener: (isOnline: boolean) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove connectivity change listener
   */
  removeListener(listener: (isOnline: boolean) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Start heartbeat (legacy method - not needed in new architecture)
   */
  startHeartbeat(): void {
    console.log('Connectivity heartbeat started - now handled automatically by browser events');
  }

  /**
   * Stop heartbeat (legacy method - not needed in new architecture)
   */
  stopHeartbeat(): void {
    console.log('Connectivity heartbeat stopped - now handled automatically by browser events');
  }

  private handleOnline = (): void => {
    this.isOnlineStatus = true;
    this.notifyListeners();
  };

  private handleOffline = (): void => {
    this.isOnlineStatus = false;
    this.notifyListeners();
  };

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.isOnlineStatus));
  }

  /**
   * Cleanup event listeners
   */
  cleanup(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.listeners = [];
  }
}

// Export singleton instance
export const connectivityService = new ConnectivityService();
