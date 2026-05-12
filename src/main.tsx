import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/legacyPlanDetection.ts"; // Import to enable legacy plan detection
import { ConsoleFilter } from "./utils/consoleFilter";
import { migrateToV2 } from "./migrations/migrateToV2";
import { architectureValidator } from "./tests/validateV2Architecture";

// Enable console filtering to reduce log spam
ConsoleFilter.enableFiltering();

// Initialize V2 architecture before app starts
const initializeV2Architecture = async () => {
  try {
    console.log('[Main] Initializing V2 architecture...');
    
    // Run migration if needed
    await migrateToV2();
    
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
    console.error('[Main] Failed to initialize V2 architecture:', error);
  }
};

// Request persistent storage to prevent data eviction under storage pressure
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((persisted) => {
    console.log(`[Main] Persistent storage ${persisted ? 'granted' : 'denied'}`);
  }).catch((err) => {
    console.warn('[Main] Failed to request persistent storage:', err);
  });
}

// Initialize V2 architecture and start app
initializeV2Architecture().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
}).catch((error) => {
  console.error('[Main] Failed to start app:', error);
  createRoot(document.getElementById("root")!).render(<App />);
});
