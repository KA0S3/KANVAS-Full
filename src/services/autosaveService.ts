/**
 * AUTOSAVE SERVICE
 * 
 * Handles automatic saving of project data
 * This is a simplified version for compatibility
 */

interface AutosaveConfig {
  interval: number; // in milliseconds
  enabled: boolean;
  debounceMs: number;
}

interface AutosaveState {
  lastSave: string | null;
  pending: boolean;
  error: string | null;
  saveCount: number;
}

class AutosaveService {
  private static instance: AutosaveService;
  private config: AutosaveConfig = {
    interval: 30000, // 30 seconds
    enabled: true,
    debounceMs: 2000 // 2 seconds
  };
  
  private state: AutosaveState = {
    lastSave: null,
    pending: false,
    error: null,
    saveCount: 0
  };
  
  private intervalId: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private listeners: ((state: AutosaveState) => void)[] = [];

  static getInstance(): AutosaveService {
    if (!AutosaveService.instance) {
      AutosaveService.instance = new AutosaveService();
    }
    return AutosaveService.instance;
  }

  private constructor() {
    // Start autosave if enabled
    if (this.config.enabled) {
      this.start();
    }
  }

  /**
   * Start autosave
   */
  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.performAutosave();
    }, this.config.interval);

    console.log('Autosave service started');
  }

  /**
   * Stop autosave
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    console.log('Autosave service stopped');
  }

  /**
   * Trigger immediate save
   */
  async saveNow(): Promise<boolean> {
    try {
      await this.performAutosave();
      return true;
    } catch (error) {
      console.error('Immediate save failed:', error);
      return false;
    }
  }

  /**
   * Queue a save with debouncing
   */
  queueSave(): void {
    if (!this.config.enabled) return;

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this.performAutosave();
    }, this.config.debounceMs);
  }

  /**
   * Get current autosave state
   */
  getState(): AutosaveState {
    return { ...this.state };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AutosaveConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Restart if interval changed
    if (newConfig.interval && newConfig.interval !== oldConfig.interval) {
      if (this.intervalId) {
        this.stop();
        if (this.config.enabled) {
          this.start();
        }
      }
    }

    // Start/stop if enabled state changed
    if (newConfig.enabled !== undefined && newConfig.enabled !== oldConfig.enabled) {
      if (newConfig.enabled) {
        this.start();
      } else {
        this.stop();
      }
    }
  }

  /**
   * Add state change listener
   */
  addListener(listener: (state: AutosaveState) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove state change listener
   */
  removeListener(listener: (state: AutosaveState) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.state.pending;
  }

  /**
   * Get time since last save
   */
  getTimeSinceLastSave(): number {
    if (!this.state.lastSave) return Infinity;
    return Date.now() - new Date(this.state.lastSave).getTime();
  }

  // Private helper methods
  private async performAutosave(): Promise<void> {
    if (this.state.pending) return; // Already saving

    try {
      // Update state
      this.state.pending = true;
      this.state.error = null;
      this.notifyListeners();

      // Get current project data
      const projectData = await this.getCurrentProjectData();
      
      if (projectData) {
        // Save to persistence layer
        await this.saveProjectData(projectData);

        // Update success state
        this.state.lastSave = new Date().toISOString();
        this.state.saveCount++;
        console.log(`Autosave completed (${this.state.saveCount} saves)`);
      }

    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Autosave failed:', error);
    } finally {
      this.state.pending = false;
      this.notifyListeners();
    }
  }

  private async getCurrentProjectData(): Promise<any> {
    try {
      // Get current project ID
      const projectId = localStorage.getItem('currentProjectId');
      if (!projectId) return null;

      // Import persistence modules dynamically
      const { projectPersistence } = await import('@/persistence/projects');
      const { assetPersistence } = await import('@/persistence/assets');

      // Get project and assets
      const project = await projectPersistence.get(projectId);
      const assets = await assetPersistence.getProjectAssets(projectId);

      return {
        project,
        assets,
        savedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to get current project data:', error);
      return null;
    }
  }

  private async saveProjectData(data: any): Promise<void> {
    // In a real implementation, this would save to cloud storage
    // For now, just simulate saving
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Save to localStorage as backup
    localStorage.setItem('autosave-backup', JSON.stringify(data));
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }
}

// Export singleton instance
export const autosaveService = AutosaveService.getInstance();
