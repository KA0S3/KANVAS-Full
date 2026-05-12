/**
 * MIGRATION PROGRESS TRACKING AND REPORTING
 * 
 * Comprehensive progress tracking system for the v2 migration process.
 * Provides real-time progress updates, detailed reporting, and monitoring.
 * 
 * 🔒 CRITICAL: This system ensures migration visibility and helps
 * identify issues during the migration process.
 */

import { supabase } from '@/lib/supabase';
import { db } from '@/storage/indexeddb';

export interface MigrationProgress {
  migrationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  startTime: string;
  endTime?: string;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  progressPercentage: number;
  steps: MigrationStep[];
  errors: MigrationError[];
  warnings: MigrationWarning[];
  metadata: Record<string, any>;
}

export interface MigrationStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: string;
  endTime?: string;
  duration?: number;
  progressPercentage: number;
  itemsProcessed: number;
  totalItems: number;
  metadata: Record<string, any>;
}

export interface MigrationError {
  id: string;
  stepId: string;
  timestamp: string;
  severity: 'critical' | 'error' | 'warning';
  code: string;
  message: string;
  details?: Record<string, any>;
  resolved: boolean;
  resolution?: string;
}

export interface MigrationWarning {
  id: string;
  stepId: string;
  timestamp: string;
  code: string;
  message: string;
  recommendation: string;
  acknowledged: boolean;
}

export interface MigrationReport {
  migrationId: string;
  summary: MigrationSummary;
  steps: StepReport[];
  errors: ErrorReport[];
  warnings: WarningReport[];
  performanceMetrics: PerformanceMetrics;
  recommendations: string[];
}

export interface MigrationSummary {
  status: 'completed' | 'failed' | 'partial';
  totalDuration: number;
  stepsCompleted: number;
  stepsTotal: number;
  itemsMigrated: number;
  errorsCount: number;
  warningsCount: number;
  successRate: number;
}

export interface StepReport {
  id: string;
  name: string;
  status: string;
  duration: number;
  itemsProcessed: number;
  itemsTotal: number;
  successRate: number;
  errors: string[];
}

export interface ErrorReport {
  id: string;
  stepId: string;
  severity: string;
  code: string;
  message: string;
  resolved: boolean;
  resolution?: string;
}

export interface WarningReport {
  id: string;
  stepId: string;
  code: string;
  message: string;
  recommendation: string;
  acknowledged: boolean;
}

export interface PerformanceMetrics {
  averageStepDuration: number;
  slowestStep: string;
  fastestStep: string;
  totalItemsPerSecond: number;
  memoryUsage: number;
  databaseOperations: number;
}

/**
 * Migration progress tracker
 */
export class MigrationProgressTracker {
  private currentMigration: MigrationProgress | null = null;
  private progressCallbacks: ((progress: MigrationProgress) => void)[] = [];
  private progressLog: string[] = [];

  /**
   * Start tracking a new migration
   */
  async startMigration(migrationId: string, steps: Omit<MigrationStep, 'id' | 'status' | 'progressPercentage' | 'itemsProcessed' | 'metadata'>[]): Promise<void> {
    this.currentMigration = {
      migrationId,
      status: 'running',
      startTime: new Date().toISOString(),
      currentStep: '',
      totalSteps: steps.length,
      completedSteps: 0,
      progressPercentage: 0,
      steps: steps.map((step, index) => ({
        ...step,
        id: `step_${index + 1}`,
        status: 'pending',
        progressPercentage: 0,
        itemsProcessed: 0,
        metadata: {},
      })),
      errors: [],
      warnings: [],
      metadata: {},
    };

    this.log(`Started migration tracking for ${migrationId} with ${steps.length} steps`);
    await this.saveProgress();
    this.notifyProgress();
  }

  /**
   * Start a specific migration step
   */
  async startStep(stepId: string): Promise<void> {
    if (!this.currentMigration) {
      throw new Error('No active migration to track');
    }

    const step = this.currentMigration.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    step.status = 'running';
    step.startTime = new Date().toISOString();
    step.progressPercentage = 0;
    step.itemsProcessed = 0;

    this.currentMigration.currentStep = step.name;
    this.updateOverallProgress();

    this.log(`Started step: ${step.name}`);
    await this.saveProgress();
    this.notifyProgress();
  }

  /**
   * Update step progress
   */
  async updateStepProgress(stepId: string, itemsProcessed: number, totalItems: number): Promise<void> {
    if (!this.currentMigration) {
      throw new Error('No active migration to track');
    }

    const step = this.currentMigration.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    step.itemsProcessed = itemsProcessed;
    step.totalItems = totalItems;
    step.progressPercentage = totalItems > 0 ? (itemsProcessed / totalItems) * 100 : 0;

    this.updateOverallProgress();

    await this.saveProgress();
    this.notifyProgress();
  }

  /**
   * Complete a step
   */
  async completeStep(stepId: string, success: boolean = true): Promise<void> {
    if (!this.currentMigration) {
      throw new Error('No active migration to track');
    }

    const step = this.currentMigration.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    step.status = success ? 'completed' : 'failed';
    step.endTime = new Date().toISOString();
    step.progressPercentage = 100;

    if (step.startTime) {
      step.duration = new Date(step.endTime).getTime() - new Date(step.startTime).getTime();
    }

    if (!success) {
      this.currentMigration.status = 'failed';
    }

    this.updateOverallProgress();

    this.log(`Completed step: ${step.name} (${success ? 'success' : 'failed'})`);
    await this.saveProgress();
    this.notifyProgress();
  }

  /**
   * Add error to migration
   */
  async addError(stepId: string, severity: 'critical' | 'error' | 'warning', code: string, message: string, details?: Record<string, any>): Promise<void> {
    if (!this.currentMigration) {
      throw new Error('No active migration to track');
    }

    const error: MigrationError = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      stepId,
      timestamp: new Date().toISOString(),
      severity,
      code,
      message,
      details,
      resolved: false,
    };

    this.currentMigration.errors.push(error);

    // Update step status if critical error
    if (severity === 'critical') {
      const step = this.currentMigration.steps.find(s => s.id === stepId);
      if (step) {
        step.status = 'failed';
      }
      this.currentMigration.status = 'failed';
    }

    this.log(`Added ${severity} error to step ${stepId}: ${message}`);
    await this.saveProgress();
    this.notifyProgress();
  }

  /**
   * Add warning to migration
   */
  async addWarning(stepId: string, code: string, message: string, recommendation: string): Promise<void> {
    if (!this.currentMigration) {
      throw new Error('No active migration to track');
    }

    const warning: MigrationWarning = {
      id: `warning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      stepId,
      timestamp: new Date().toISOString(),
      code,
      message,
      recommendation,
      acknowledged: false,
    };

    this.currentMigration.warnings.push(warning);

    this.log(`Added warning to step ${stepId}: ${message}`);
    await this.saveProgress();
    this.notifyProgress();
  }

  /**
   * Complete migration
   */
  async completeMigration(success: boolean = true): Promise<void> {
    if (!this.currentMigration) {
      throw new Error('No active migration to complete');
    }

    this.currentMigration.status = success ? 'completed' : 'failed';
    this.currentMigration.endTime = new Date().toISOString();
    this.currentMigration.progressPercentage = 100;
    this.currentMigration.completedSteps = this.currentMigration.steps.filter(s => s.status === 'completed').length;

    this.log(`Completed migration: ${success ? 'success' : 'failed'}`);
    await this.saveProgress();
    this.notifyProgress();
  }

  /**
   * Pause migration
   */
  async pauseMigration(): Promise<void> {
    if (!this.currentMigration) {
      throw new Error('No active migration to pause');
    }

    this.currentMigration.status = 'paused';

    this.log('Migration paused');
    await this.saveProgress();
    this.notifyProgress();
  }

  /**
   * Resume migration
   */
  async resumeMigration(): Promise<void> {
    if (!this.currentMigration) {
      throw new Error('No paused migration to resume');
    }

    this.currentMigration.status = 'running';

    this.log('Migration resumed');
    await this.saveProgress();
    this.notifyProgress();
  }

  /**
   * Get current migration progress
   */
  getCurrentProgress(): MigrationProgress | null {
    return this.currentMigration ? { ...this.currentMigration } : null;
  }

  /**
   * Register progress callback
   */
  onProgress(callback: (progress: MigrationProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Unregister progress callback
   */
  offProgress(callback: (progress: MigrationProgress) => void): void {
    const index = this.progressCallbacks.indexOf(callback);
    if (index > -1) {
      this.progressCallbacks.splice(index, 1);
    }
  }

  /**
   * Generate comprehensive migration report
   */
  async generateReport(): Promise<MigrationReport> {
    if (!this.currentMigration) {
      throw new Error('No migration data available for report generation');
    }

    const migration = this.currentMigration;
    const summary = this.generateSummary(migration);
    const steps = this.generateStepReports(migration);
    const errors = this.generateErrorReports(migration);
    const warnings = this.generateWarningReports(migration);
    const performanceMetrics = this.generatePerformanceMetrics(migration);
    const recommendations = this.generateRecommendations(migration);

    return {
      migrationId: migration.migrationId,
      summary,
      steps,
      errors,
      warnings,
      performanceMetrics,
      recommendations,
    };
  }

  /**
   * Load existing migration progress
   */
  async loadProgress(migrationId: string): Promise<void> {
    try {
      // Try to load from IndexedDB first
      const savedProgress = await db.migrationProgress.get(migrationId);
      if (savedProgress) {
        this.currentMigration = savedProgress;
        this.log(`Loaded migration progress for ${migrationId}`);
        return;
      }

      // Try to load from Supabase
      const { data: supabaseProgress } = await supabase
        .from('migration_progress')
        .select('*')
        .eq('migration_id', migrationId)
        .single();

      if (supabaseProgress) {
        this.currentMigration = supabaseProgress.data;
        this.log(`Loaded migration progress from Supabase for ${migrationId}`);
      }

    } catch (error) {
      this.log(`Failed to load migration progress: ${error}`);
    }
  }

  /**
   * Clear migration progress
   */
  async clearProgress(): Promise<void> {
    if (this.currentMigration) {
      await db.migrationProgress.delete(this.currentMigration.migrationId);
      await supabase
        .from('migration_progress')
        .delete()
        .eq('migration_id', this.currentMigration.migrationId);
    }

    this.currentMigration = null;
    this.progressLog = [];
  }

  /**
   * Update overall progress
   */
  private updateOverallProgress(): void {
    if (!this.currentMigration) return;

    const completedSteps = this.currentMigration.steps.filter(s => s.status === 'completed').length;
    this.currentMigration.completedSteps = completedSteps;
    this.currentMigration.progressPercentage = this.currentMigration.totalSteps > 0 
      ? (completedSteps / this.currentMigration.totalSteps) * 100 
      : 0;
  }

  /**
   * Save progress to storage
   */
  private async saveProgress(): Promise<void> {
    if (!this.currentMigration) return;

    try {
      // Save to IndexedDB
      await db.migrationProgress.put(this.currentMigration);

      // Save to Supabase
      await supabase
        .from('migration_progress')
        .upsert({
          migration_id: this.currentMigration.migrationId,
          data: this.currentMigration,
          updated_at: new Date().toISOString(),
        });

    } catch (error) {
      this.log(`Failed to save migration progress: ${error}`);
    }
  }

  /**
   * Notify progress callbacks
   */
  private notifyProgress(): void {
    if (this.currentMigration) {
      const progressCopy = { ...this.currentMigration };
      this.progressCallbacks.forEach(callback => {
        try {
          callback(progressCopy);
        } catch (error) {
          this.log(`Progress callback error: ${error}`);
        }
      });
    }
  }

  /**
   * Generate migration summary
   */
  private generateSummary(migration: MigrationProgress): MigrationSummary {
    const endTime = migration.endTime || new Date().toISOString();
    const totalDuration = new Date(endTime).getTime() - new Date(migration.startTime).getTime();
    const stepsCompleted = migration.steps.filter(s => s.status === 'completed').length;
    const itemsMigrated = migration.steps.reduce((total, step) => total + step.itemsProcessed, 0);
    const errorsCount = migration.errors.filter(e => !e.resolved).length;
    const warningsCount = migration.warnings.filter(w => !w.acknowledged).length;
    const successRate = migration.totalSteps > 0 ? (stepsCompleted / migration.totalSteps) * 100 : 0;

    return {
      status: migration.status === 'completed' ? 'completed' : 
              migration.status === 'failed' ? 'failed' : 'partial',
      totalDuration,
      stepsCompleted,
      stepsTotal: migration.totalSteps,
      itemsMigrated,
      errorsCount,
      warningsCount,
      successRate,
    };
  }

  /**
   * Generate step reports
   */
  private generateStepReports(migration: MigrationProgress): StepReport[] {
    return migration.steps.map(step => ({
      id: step.id,
      name: step.name,
      status: step.status,
      duration: step.duration || 0,
      itemsProcessed: step.itemsProcessed,
      itemsTotal: step.totalItems,
      successRate: step.totalItems > 0 ? (step.itemsProcessed / step.totalItems) * 100 : 0,
      errors: migration.errors.filter(e => e.stepId === step.id).map(e => e.message),
    }));
  }

  /**
   * Generate error reports
   */
  private generateErrorReports(migration: MigrationProgress): ErrorReport[] {
    return migration.errors.map(error => ({
      id: error.id,
      stepId: error.stepId,
      severity: error.severity,
      code: error.code,
      message: error.message,
      resolved: error.resolved,
      resolution: error.resolution,
    }));
  }

  /**
   * Generate warning reports
   */
  private generateWarningReports(migration: MigrationProgress): WarningReport[] {
    return migration.warnings.map(warning => ({
      id: warning.id,
      stepId: warning.stepId,
      code: warning.code,
      message: warning.message,
      recommendation: warning.recommendation,
      acknowledged: warning.acknowledged,
    }));
  }

  /**
   * Generate performance metrics
   */
  private generatePerformanceMetrics(migration: MigrationProgress): PerformanceMetrics {
    const completedSteps = migration.steps.filter(s => s.status === 'completed' && s.duration);
    const averageStepDuration = completedSteps.length > 0 
      ? completedSteps.reduce((sum, step) => sum + (step.duration || 0), 0) / completedSteps.length 
      : 0;
    
    const slowestStep = completedSteps.length > 0 
      ? completedSteps.reduce((slowest, step) => (step.duration || 0) > (slowest.duration || 0) ? step : slowest).name 
      : '';
    
    const fastestStep = completedSteps.length > 0 
      ? completedSteps.reduce((fastest, step) => (step.duration || 0) < (fastest.duration || 0) ? step : fastest).name 
      : '';
    
    const totalItems = migration.steps.reduce((sum, step) => sum + step.itemsProcessed, 0);
    const totalDuration = new Date(migration.endTime || new Date().toISOString()).getTime() - 
                         new Date(migration.startTime).getTime();
    const totalItemsPerSecond = totalDuration > 0 ? (totalItems / (totalDuration / 1000)) : 0;

    return {
      averageStepDuration,
      slowestStep,
      fastestStep,
      totalItemsPerSecond,
      memoryUsage: 0, // Would need to implement memory tracking
      databaseOperations: totalItems, // Approximation
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(migration: MigrationProgress): string[] {
    const recommendations: string[] = [];

    if (migration.errors.length > 0) {
      recommendations.push('Review and resolve migration errors before proceeding');
    }

    if (migration.warnings.length > 0) {
      recommendations.push('Review migration warnings for potential improvements');
    }

    const slowSteps = migration.steps.filter(s => s.duration && s.duration > 10000); // > 10 seconds
    if (slowSteps.length > 0) {
      recommendations.push('Consider optimizing slow migration steps');
    }

    const failedSteps = migration.steps.filter(s => s.status === 'failed');
    if (failedSteps.length > 0) {
      recommendations.push('Retry failed migration steps or implement manual fixes');
    }

    if (migration.status === 'completed' && migration.errors.length === 0) {
      recommendations.push('Migration completed successfully - consider cleanup of legacy data');
    }

    return recommendations;
  }

  /**
   * Log migration events
   */
  private log(message: string): void {
    this.progressLog.push(`${new Date().toISOString()}: ${message}`);
    console.log(`[Migration Progress] ${message}`);
  }

  /**
   * Get progress log
   */
  getProgressLog(): string[] {
    return [...this.progressLog];
  }

  /**
   * Clear progress log
   */
  clearLog(): void {
    this.progressLog = [];
  }
}

// Export singleton instance
export const migrationProgressTracker = new MigrationProgressTracker();

/**
 * Migration progress reporter for generating formatted reports
 */
export class MigrationProgressReporter {
  /**
   * Generate HTML report
   */
  static generateHTMLReport(report: MigrationReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>KANVAS Migration Report - ${report.migrationId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f9f9f9; padding: 15px; border-radius: 5px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .metric .value { font-size: 24px; font-weight: bold; color: #007acc; }
        .section { margin-bottom: 30px; }
        .section h2 { border-bottom: 2px solid #007acc; padding-bottom: 10px; }
        .step { border: 1px solid #ddd; margin-bottom: 10px; padding: 15px; border-radius: 5px; }
        .step.completed { border-left: 4px solid #28a745; }
        .step.failed { border-left: 4px solid #dc3545; }
        .step.running { border-left: 4px solid #ffc107; }
        .error { background: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; margin: 5px 0; border-radius: 3px; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 5px 0; border-radius: 3px; }
        .recommendations { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>KANVAS Migration Report</h1>
        <p><strong>Migration ID:</strong> ${report.migrationId}</p>
        <p><strong>Status:</strong> ${report.summary.status}</p>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>Status</h3>
            <div class="value">${report.summary.status}</div>
        </div>
        <div class="metric">
            <h3>Duration</h3>
            <div class="value">${Math.round(report.summary.totalDuration / 1000)}s</div>
        </div>
        <div class="metric">
            <h3>Steps</h3>
            <div class="value">${report.summary.stepsCompleted}/${report.summary.stepsTotal}</div>
        </div>
        <div class="metric">
            <h3>Items Migrated</h3>
            <div class="value">${report.summary.itemsMigrated}</div>
        </div>
        <div class="metric">
            <h3>Success Rate</h3>
            <div class="value">${Math.round(report.summary.successRate)}%</div>
        </div>
        <div class="metric">
            <h3>Errors</h3>
            <div class="value">${report.summary.errorsCount}</div>
        </div>
    </div>

    <div class="section">
        <h2>Migration Steps</h2>
        ${report.steps.map(step => `
            <div class="step ${step.status}">
                <h3>${step.name}</h3>
                <p><strong>Status:</strong> ${step.status}</p>
                <p><strong>Duration:</strong> ${Math.round(step.duration / 1000)}s</p>
                <p><strong>Progress:</strong> ${step.itemsProcessed}/${step.itemsTotal} (${Math.round(step.successRate)}%)</p>
                ${step.errors.length > 0 ? `
                    <h4>Errors:</h4>
                    ${step.errors.map(error => `<div class="error">${error}</div>`).join('')}
                ` : ''}
            </div>
        `).join('')}
    </div>

    ${report.errors.length > 0 ? `
        <div class="section">
            <h2>Errors</h2>
            ${report.errors.map(error => `
                <div class="error">
                    <strong>${error.code}:</strong> ${error.message}
                    ${error.resolution ? `<p><strong>Resolution:</strong> ${error.resolution}</p>` : ''}
                </div>
            `).join('')}
        </div>
    ` : ''}

    ${report.warnings.length > 0 ? `
        <div class="section">
            <h2>Warnings</h2>
            ${report.warnings.map(warning => `
                <div class="warning">
                    <strong>${warning.code}:</strong> ${warning.message}
                    <p><strong>Recommendation:</strong> ${warning.recommendation}</p>
                </div>
            `).join('')}
        </div>
    ` : ''}

    ${report.recommendations.length > 0 ? `
        <div class="section">
            <h2>Recommendations</h2>
            <div class="recommendations">
                <ul>
                    ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        </div>
    ` : ''}
</body>
</html>`;
  }

  /**
   * Generate Markdown report
   */
  static generateMarkdownReport(report: MigrationReport): string {
    const lines = [
      `# KANVAS Migration Report`,
      `**Migration ID:** ${report.migrationId}`,
      `**Status:** ${report.summary.status}`,
      `**Generated:** ${new Date().toISOString()}`,
      '',
      '## Summary',
      `- **Status:** ${report.summary.status}`,
      `- **Duration:** ${Math.round(report.summary.totalDuration / 1000)}s`,
      `- **Steps:** ${report.summary.stepsCompleted}/${report.summary.stepsTotal}`,
      `- **Items Migrated:** ${report.summary.itemsMigrated}`,
      `- **Success Rate:** ${Math.round(report.summary.successRate)}%`,
      `- **Errors:** ${report.summary.errorsCount}`,
      `- **Warnings:** ${report.summary.warningsCount}`,
      '',
      '## Migration Steps',
      ...report.steps.map(step => [
        `### ${step.name}`,
        `- **Status:** ${step.status}`,
        `- **Duration:** ${Math.round(step.duration / 1000)}s`,
        `- **Progress:** ${step.itemsProcessed}/${step.itemsTotal} (${Math.round(step.successRate)}%)`,
        step.errors.length > 0 ? [
          '**Errors:**',
          ...step.errors.map(error => `- ${error}`)
        ].join('\n') : '',
        ''
      ].flat()),
    ];

    if (report.errors.length > 0) {
      lines.push(
        '## Errors',
        ...report.errors.map(error => [
          `### ${error.code}`,
          `- **Severity:** ${error.severity}`,
          `- **Message:** ${error.message}`,
          error.resolution ? `- **Resolution:** ${error.resolution}` : '',
          ''
        ].flat())
      );
    }

    if (report.warnings.length > 0) {
      lines.push(
        '## Warnings',
        ...report.warnings.map(warning => [
          `### ${warning.code}`,
          `- **Message:** ${warning.message}`,
          `- **Recommendation:** ${warning.recommendation}`,
          ''
        ].flat())
      );
    }

    if (report.recommendations.length > 0) {
      lines.push(
        '## Recommendations',
        ...report.recommendations.map(rec => `- ${rec}`)
      );
    }

    return lines.join('\n');
  }

  /**
   * Generate JSON report
   */
  static generateJSONReport(report: MigrationReport): string {
    return JSON.stringify(report, null, 2);
  }
}

// Export main functions
export const startMigrationTracking = (migrationId: string, steps: any[]) => 
  migrationProgressTracker.startMigration(migrationId, steps);

export const getCurrentMigrationProgress = () => 
  migrationProgressTracker.getCurrentProgress();

export const generateMigrationReport = () => 
  migrationProgressTracker.generateReport();
