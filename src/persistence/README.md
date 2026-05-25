# Persistence Boundary

`src/persistence/index.ts` is the only approved project persistence boundary.

UI components and feature services should not call Supabase, IndexedDB, or `localStorage` directly for project save, load, autosave, export, import, list, or delete flows.

IndexedDB remains the runtime and autosave cache for now. Existing Supabase-backed behavior can still be wrapped behind this boundary where needed, but new project persistence call sites should go through the facade.

Filesystem and project-folder saving will be added later during Electron integration. No Electron work, filesystem APIs, or final serializer work are part of this step.

## Day 5 Serializer

`src/persistence/serializer` converts loaded project data into deterministic `project.json` and `metadata.json` objects for future project-folder saves.

Current constraints:

- The serializer is pure TypeScript and performs no filesystem writes.
- IndexedDB remains the runtime/autosave cache.
- `serializeProjectForInspection(projectId)` is a read-only inspection helper and does not replace existing save/export flows.
- Asset files are not copied yet; only relative asset references and warnings are produced.
- Electron IPC/preload, ZIP import/export, backups, licensing, and UI redesign are intentionally out of scope.
