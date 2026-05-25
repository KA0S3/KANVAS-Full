import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/legacyPlanDetection.ts"; // Import to enable legacy plan detection
import { ConsoleFilter } from "./utils/consoleFilter";
import { migrateToV2 } from "./migrations/migrateToV2";
import { architectureValidator } from "./tests/validateV2Architecture";
import { repairIndexedDBSchemaInDevelopment, verifyIndexedDBSchemaHealth } from "./storage/indexeddb";
import { hydrateLocalPersistenceFromIndexedDB } from "./startup/localPersistenceHydration";

// Enable console filtering to reduce log spam
ConsoleFilter.enableFiltering();

// Initialize V2 architecture before app starts
const initializeV2Architecture = async () => {
  try {
    console.log('[Main] Initializing V2 architecture...');

    const resetRequested = import.meta.env.DEV && (
      localStorage.getItem('kanvas_dev_reset_stale_indexeddb') === 'true' ||
      new URLSearchParams(window.location.search).get('resetKanvasDb') === '1'
    );

    try {
      await verifyIndexedDBSchemaHealth();
    } catch (error) {
      if (!resetRequested) {
        throw error;
      }

      console.warn('[Main] Development-only IndexedDB schema reset requested. Deleting and recreating kanvas-db-v2.');
      localStorage.removeItem('kanvas_v2_migration_complete');
      await repairIndexedDBSchemaInDevelopment();
      localStorage.removeItem('kanvas_dev_reset_stale_indexeddb');
      await verifyIndexedDBSchemaHealth();
    }
    
    // Run migration if needed
    const migration = await migrateToV2();
    if (!migration.success) {
      throw new Error(`V2 migration failed: ${migration.errors.join('; ') || 'unknown error'}`);
    }

    try {
      await verifyIndexedDBSchemaHealth();
    } catch (error) {
      throw error;
    }

    await hydrateLocalPersistenceFromIndexedDB();
    
    // Run architecture validation in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Main] Running V2 architecture validation...');
      const validation = await architectureValidator.validateAll();
      
      if (!validation.overallSuccess) {
        console.error('[Main] Architecture validation failed:', validation.summary);
        console.log(architectureValidator.getValidationReport());
      } else {
        console.log('[Main] ✅ V2 architecture validation passed successfully');
      }
    }
    
    console.log('[Main] V2 architecture initialized successfully');
  } catch (error) {
    console.error('[Main] FATAL: IndexedDB/local persistence initialization failed. App startup blocked to avoid data loss.', error);
    throw error;
  }
};

// Request persistent storage to prevent data eviction under storage pressure
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((persisted) => {
    if (persisted) {
      console.log('[Main] Persistent storage granted');
    } else {
      console.warn('[Main] Persistent storage permission denied; continuing because this is only eviction protection, not save confirmation.');
    }
  }).catch((err) => {
    console.warn('[Main] Persistent storage permission request failed; continuing because this is non-fatal.', err);
  });
}

// Initialize V2 architecture and start app
initializeV2Architecture().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
}).catch((error) => {
  console.error('[Main] Failed to start app:', error);
  createRoot(document.getElementById("root")!).render(
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Local persistence is unavailable</h1>
      <p>IndexedDB schema validation failed, so the app stopped before loading to avoid losing local changes.</p>
      <p>Check the console for the missing object store details. In development, clear the <code>kanvas-db-v2</code> IndexedDB database only after confirming there is no data you need to preserve.</p>
    </div>
  );
});
