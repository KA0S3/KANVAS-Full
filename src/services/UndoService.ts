/**
 * UNDO SERVICE - Undo/Redo Functionality
 * 
 * Provides undo/redo capabilities for asset operations
 * This is a simplified version for the new architecture
 */

interface UndoAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  assetId: string;
  description: string;
  beforeState?: any;
  afterState?: any;
  timestamp: number;
  projectId: string;
}

class UndoService {
  private currentProjectId: string | null = null;
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private maxStackSize = 100;

  /**
   * Set current project for undo operations
   */
  setCurrentProject(projectId: string): void {
    this.currentProjectId = projectId;
    // Clear stacks when switching projects to avoid cross-project operations
    this.clearStack();
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get description of next undo action
   */
  getNextUndoDescription(): string {
    if (this.undoStack.length === 0) return '';
    return this.undoStack[this.undoStack.length - 1].description;
  }

  /**
   * Get description of next redo action
   */
  getNextRedoDescription(): string {
    if (this.redoStack.length === 0) return '';
    return this.redoStack[this.redoStack.length - 1].description;
  }

  /**
   * Perform undo operation
   */
  async undo(): Promise<boolean> {
    if (!this.canUndo()) return false;

    const action = this.undoStack.pop()!;
    this.redoStack.push(action);

    try {
      // In the new architecture, this would use the persistence layer
      // For now, implement basic undo logic
      switch (action.type) {
        case 'create':
          // Undo create = delete the asset
          await this.undoCreate(action);
          break;
        case 'update':
          // Undo update = restore previous state
          await this.undoUpdate(action);
          break;
        case 'delete':
          // Undo delete = recreate the asset
          await this.undoDelete(action);
          break;
      }
      return true;
    } catch (error) {
      console.error('Undo failed:', error);
      // Move back to undo stack if failed
      this.undoStack.push(action);
      this.redoStack.pop();
      return false;
    }
  }

  /**
   * Perform redo operation
   */
  async redo(): Promise<boolean> {
    if (!this.canRedo()) return false;

    const action = this.redoStack.pop()!;
    this.undoStack.push(action);

    try {
      // Re-apply the original action
      switch (action.type) {
        case 'create':
          await this.redoCreate(action);
          break;
        case 'update':
          await this.redoUpdate(action);
          break;
        case 'delete':
          await this.redoDelete(action);
          break;
      }
      return true;
    } catch (error) {
      console.error('Redo failed:', error);
      // Move back to redo stack if failed
      this.redoStack.push(action);
      this.undoStack.pop();
      return false;
    }
  }

  /**
   * Clear both undo and redo stacks
   */
  clearStack(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Add an action to the undo stack
   */
  addAction(action: Omit<UndoAction, 'id' | 'timestamp'>): void {
    if (!this.currentProjectId) return;

    const undoAction: UndoAction = {
      ...action,
      id: this.generateId(),
      timestamp: Date.now(),
      projectId: this.currentProjectId
    };

    this.undoStack.push(undoAction);
    
    // Clear redo stack when new action is added
    this.redoStack = [];
    
    // Limit stack size
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
  }

  // Private helper methods
  private async undoCreate(action: UndoAction): Promise<void> {
    // Import dynamically to avoid circular dependencies
    const { assetPersistence } = await import('@/persistence/assets');
    await assetPersistence.delete(action.assetId, action.projectId);
  }

  private async undoUpdate(action: UndoAction): Promise<void> {
    if (!action.beforeState) return;
    
    const { assetPersistence } = await import('@/persistence/assets');
    await assetPersistence.update(action.assetId, action.beforeState);
  }

  private async undoDelete(action: UndoAction): Promise<void> {
    if (!action.beforeState) return;
    
    const { assetPersistence } = await import('@/persistence/assets');
    await assetPersistence.create(action.beforeState);
  }

  private async redoCreate(action: UndoAction): Promise<void> {
    if (!action.afterState) return;
    
    const { assetPersistence } = await import('@/persistence/assets');
    await assetPersistence.create(action.afterState);
  }

  private async redoUpdate(action: UndoAction): Promise<void> {
    if (!action.afterState) return;
    
    const { assetPersistence } = await import('@/persistence/assets');
    await assetPersistence.update(action.assetId, action.afterState);
  }

  private async redoDelete(action: UndoAction): Promise<void> {
    const { assetPersistence } = await import('@/persistence/assets');
    await assetPersistence.delete(action.assetId, action.projectId);
  }

  private generateId(): string {
    return `undo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const undoService = new UndoService();
