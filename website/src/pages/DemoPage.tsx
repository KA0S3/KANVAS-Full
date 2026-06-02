import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  Building,
  ChevronDown,
  ChevronRight,
  FileUp,
  GripVertical,
  Image,
  PanelRight,
  Plus,
  Search,
  Settings,
  Sparkles,
  Swords,
  Trash2,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { MAX_DEMO_ASSETS, MAX_DEMO_BOOKS, MAX_DEMO_UPLOAD_BYTES } from "../lib/config";
import { MobileDesktopGate } from "../components/MobileDesktopGate";
import {
  addDemoAsset,
  deleteDemoAsset,
  ensureDemoBook,
  getDemoBackgroundFile,
  getDemoFile,
  getDemoState,
  updateDemoAsset,
  updateDemoBookTitle,
  updateDemoViewportBackground,
} from "../lib/demoDb";
import type { DemoAsset, DemoBook } from "../types/domain";
import { usePurchaseOutlet } from "../components/usePurchaseOutlet";
import { useIsMobile } from "../components/useIsMobile";

const mbLabel = `${MAX_DEMO_UPLOAD_BYTES / 1024 / 1024}MB`;

function childCount(assets: DemoAsset[], assetId: string): number {
  return assets.filter((asset) => asset.parentId === assetId).length;
}

function isDescendantOf(assetId: string | null, ancestorId: string, assets: DemoAsset[]): boolean {
  let cursor = assetId ? assets.find((asset) => asset.id === assetId) || null : null;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.parentId === ancestorId) return true;
    seen.add(cursor.id);
    cursor = cursor.parentId ? assets.find((asset) => asset.id === cursor?.parentId) || null : null;
  }
  return false;
}

function includeMatchesWithAncestors(assets: DemoAsset[], query: string): DemoAsset[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return assets;

  const included = new Set<string>();
  for (const asset of assets) {
    if (!asset.title.toLowerCase().includes(normalizedQuery)) continue;
    let cursor: DemoAsset | null = asset;
    while (cursor && !included.has(cursor.id)) {
      included.add(cursor.id);
      cursor = cursor.parentId ? assets.find((candidate) => candidate.id === cursor?.parentId) || null : null;
    }
  }
  return assets.filter((asset) => included.has(asset.id));
}

export function DemoPage() {
  const isMobile = useIsMobile();
  const { openPurchase } = usePurchaseOutlet();
  const [book, setBook] = useState<DemoBook | null>(null);
  const [assets, setAssets] = useState<DemoAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [assetTitle, setAssetTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentViewportId, setCurrentViewportId] = useState<string | null>(null);
  const [bookLibraryOpen, setBookLibraryOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [bookEditorOpen, setBookEditorOpen] = useState(false);
  const [backgroundModalOpen, setBackgroundModalOpen] = useState(false);
  const [expandedAssetIds, setExpandedAssetIds] = useState<Set<string>>(() => new Set());
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const selectedAsset = useMemo(
    () => (selectedAssetId ? assets.find((asset) => asset.id === selectedAssetId) || null : null),
    [assets, selectedAssetId]
  );
  const filteredAssets = useMemo(
    () => assets.filter((asset) => asset.title.toLowerCase().includes(searchQuery.trim().toLowerCase())),
    [assets, searchQuery]
  );
  const treeAssets = useMemo(() => includeMatchesWithAncestors(assets, searchQuery), [assets, searchQuery]);
  const visibleAssets = useMemo(
    () => filteredAssets.filter((asset) => (asset.parentId || null) === currentViewportId),
    [currentViewportId, filteredAssets]
  );
  const currentViewportAsset = useMemo(
    () => (currentViewportId ? assets.find((asset) => asset.id === currentViewportId) || null : null),
    [assets, currentViewportId]
  );
  const viewportPath = useMemo(() => {
    const path: DemoAsset[] = [];
    let cursor = currentViewportAsset;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      path.unshift(cursor);
      seen.add(cursor.id);
      cursor = cursor.parentId ? assets.find((asset) => asset.id === cursor?.parentId) || null : null;
    }
    return path;
  }, [assets, currentViewportAsset]);
  const assetLimitReached = assets.length >= MAX_DEMO_ASSETS;

  const refresh = async () => {
    const nextBook = await ensureDemoBook();
    const state = await getDemoState();
    const nextAssets = state.assets.filter((asset) => asset.bookId === nextBook.id);
    setBook(nextBook);
    setBookTitle(nextBook.title);
    setAssets(nextAssets);
    setSelectedAssetId((current) => (current && nextAssets.some((asset) => asset.id === current) ? current : nextAssets[0]?.id || null));
    setCurrentViewportId((current) => (current && nextAssets.some((asset) => asset.id === current) ? current : null));
    setExpandedAssetIds((current) => new Set([...current].filter((id) => nextAssets.some((asset) => asset.id === id))));
  };

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to open the demo."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    Promise.all(
      assets.map(async (asset) => {
        if (!asset.mimeType?.startsWith("image/")) return null;
        const file = await getDemoFile(asset);
        if (!file) return null;
        const url = URL.createObjectURL(file.blob);
        urls.push(url);
        return [asset.id, url] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) {
          setPreviewUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>));
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewUrls({});
      });

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assets]);

  useEffect(() => {
    if (!notice && !error) return;
    const timeout = window.setTimeout(() => {
      setNotice(null);
      setError(null);
    }, 3200);
    return () => window.clearTimeout(timeout);
  }, [notice, error]);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const owner = currentViewportAsset || book;

    if (!owner) {
      setBackgroundUrl(null);
      return;
    }

    getDemoBackgroundFile(owner)
      .then((file) => {
        if (!file) return null;
        url = URL.createObjectURL(file.blob);
        return url;
      })
      .then((nextUrl) => {
        if (!cancelled) setBackgroundUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) setBackgroundUrl(null);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [book, currentViewportAsset]);

  const handleBookRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!book) return;
    await runAction("Book saved locally.", "Unable to rename the demo book.", async () => {
      await updateDemoBookTitle(book.id, bookTitle);
      await refresh();
      setBookEditorOpen(false);
    });
  };

  const handleAddAsset = async (event: FormEvent) => {
    event.preventDefault();
    if (!book) return;
    await runAction("Asset saved to this browser.", "Unable to save the asset.", async () => {
      const createdAsset = await addDemoAsset(book.id, {
        title: assetTitle,
        file: fileInputRef.current?.files?.[0],
        parentId: currentViewportId,
      });
      setAssetTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
      setSelectedAssetId(createdAsset.id);
      setAssetModalOpen(false);
      setBookLibraryOpen(false);
    });
  };

  const handleDelete = async (asset: DemoAsset) => {
    await runAction("Asset removed.", "Unable to delete the asset.", async () => {
      await deleteDemoAsset(asset);
      if (currentViewportId === asset.id || isDescendantOf(currentViewportId, asset.id, assets)) {
        setCurrentViewportId(asset.parentId || null);
      }
      await refresh();
    });
  };

  const handleBackgroundSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!book) return;
    const file = backgroundInputRef.current?.files?.[0] || null;
    await runAction("Background saved locally.", "Unable to save the background image.", async () => {
      await updateDemoViewportBackground(currentViewportId ? { type: "asset", id: currentViewportId } : { type: "book", id: book.id }, file);
      if (backgroundInputRef.current) backgroundInputRef.current.value = "";
      await refresh();
      setBackgroundModalOpen(false);
    });
  };

  const handleBackgroundClear = async () => {
    if (!book) return;
    await runAction("Background cleared.", "Unable to clear the background image.", async () => {
      await updateDemoViewportBackground(currentViewportId ? { type: "asset", id: currentViewportId } : { type: "book", id: book.id }, null);
      await refresh();
      setBackgroundModalOpen(false);
    });
  };

  const runAction = async (success: string, failure: string, action: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    }
  };

  const handleAssetDragStart = (event: ReactPointerEvent<HTMLButtonElement>, asset: DemoAsset) => {
    const node = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = asset.x;
    const startTop = asset.y;

    node.setPointerCapture(event.pointerId);
    setSelectedAssetId(asset.id);

    const handleMove = (moveEvent: PointerEvent) => {
      const nextX = Math.max(24, Math.min(980, startLeft + moveEvent.clientX - startX));
      const nextY = Math.max(82, Math.min(680, startTop + moveEvent.clientY - startY));
      setAssets((current) => current.map((item) => (item.id === asset.id ? { ...item, x: nextX, y: nextY } : item)));
    };

    const handleUp = async (upEvent: PointerEvent) => {
      const nextX = Math.max(24, Math.min(980, startLeft + upEvent.clientX - startX));
      const nextY = Math.max(82, Math.min(680, startTop + upEvent.clientY - startY));
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      try {
        await updateDemoAsset(asset.id, { x: nextX, y: nextY });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to move the asset.");
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const handleEnterAsset = (assetId: string) => {
    setExpandedAssetIds((current) => new Set(current).add(assetId));
    setCurrentViewportId(assetId);
    setSelectedAssetId(null);
  };

  const handleToggleExpanded = (assetId: string) => {
    setExpandedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  if (isMobile) {
    return (
      <MobileDesktopGate
        title="KANVAS demo is desktop-only"
        description="The web demo is not available on mobile. If you need to complete a purchase, sign in, or access your installer links, continue straight to downloads. KANVAS itself still installs and runs on desktop only."
      />
    );
  }

  return (
    <main className="kanvas-app-demo h-screen bg-background text-foreground relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 w-full h-full transition-opacity duration-2000 opacity-100 app-background-layer" />

      <div className="demo-top-banner">
        <span className="demo-top-banner-message">
          <img className="demo-top-banner-logo" src="/KANVAS-LOGO-F3.png" alt="" aria-hidden="true" />
          <span>This app is a demo and does NOT represent the full app.</span>
        </span>
        <Link className="demo-top-banner-button" to="/download">Download full app</Link>
      </div>

      <div className="relative z-10 flex-1 min-h-0 transition-opacity duration-2000 flex w-full overflow-hidden opacity-100">
        <div className="flex-1 h-full overflow-hidden">
          {bookLibraryOpen ? (
            <DemoBookShelf
              assets={assets}
              book={book}
              onEditBook={() => setBookEditorOpen(true)}
              onEnter={() => setBookLibraryOpen(false)}
              onLockedFeature={openPurchase}
            />
          ) : null}

          {book ? (
            <div className="asset-viewport-shell flex h-full flex-col md:flex-row overflow-hidden">
              <div className="flex-1 flex flex-col relative min-h-0 overflow-hidden">
                <div className="flex-1 overflow-hidden">
                  <DemoAssetPort
                    assets={visibleAssets}
                    allAssets={assets}
                    book={book}
                    backgroundUrl={backgroundUrl}
                    currentViewportAsset={currentViewportAsset}
                    previewUrls={previewUrls}
                    selectedAssetId={selectedAssetId}
                    viewportPath={viewportPath}
                    onAssetDragStart={handleAssetDragStart}
                    onAssetEnter={handleEnterAsset}
                    onAssetSelect={setSelectedAssetId}
                    onCreateAsset={() => setAssetModalOpen(true)}
                    onOpenWorldLibrary={() => setBookLibraryOpen(true)}
                    onViewportChange={setCurrentViewportId}
                    onToggleSidebar={() => setSidebarOpen((value) => !value)}
                  />
                </div>
              </div>

              <aside className={`fantasy-overlay ${sidebarOpen ? "is-open" : ""} no-ads`} aria-hidden={!sidebarOpen}>
                <div className="fantasy-sidebar">
                  <div className="fantasy-sidebar-content">
                    <DemoAssetExplorer
                      assets={treeAssets}
                      allAssets={assets}
                      expandedAssetIds={expandedAssetIds}
                      onDelete={handleDelete}
                      onBackgroundOpen={() => setBackgroundModalOpen(true)}
                      onLockedFeature={openPurchase}
                      onSearchChange={setSearchQuery}
                      onSelect={setSelectedAssetId}
                      onEnterAsset={handleEnterAsset}
                      onToggleExpanded={handleToggleExpanded}
                      onCreateAsset={() => setAssetModalOpen(true)}
                      onViewportChange={setCurrentViewportId}
                      onToggleSidebar={() => setSidebarOpen((value) => !value)}
                      searchQuery={searchQuery}
                      selectedAsset={selectedAsset}
                      previewUrls={previewUrls}
                    />
                  </div>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </div>

      <div className="kanvas-demo-status">
        {loading ? <div className="notice">Loading local demo database...</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        {notice ? <div className="notice success">{notice}</div> : null}
      </div>

      {assetModalOpen ? (
        <DemoAssetModal
          assetLimitReached={assetLimitReached}
          assetTitle={assetTitle}
          fileInputRef={fileInputRef}
          onAssetTitleChange={setAssetTitle}
          onClose={() => setAssetModalOpen(false)}
          onSubmit={handleAddAsset}
        />
      ) : null}

      {bookEditorOpen ? (
        <DemoBookModal
          bookTitle={bookTitle}
          onBookTitleChange={setBookTitle}
          onClose={() => setBookEditorOpen(false)}
          onSubmit={handleBookRename}
        />
      ) : null}

      {backgroundModalOpen ? (
        <DemoBackgroundModal
          currentViewportName={currentViewportAsset?.title || book?.title || "World"}
          hasBackground={Boolean(backgroundUrl)}
          inputRef={backgroundInputRef}
          onClear={handleBackgroundClear}
          onClose={() => setBackgroundModalOpen(false)}
          onSubmit={handleBackgroundSave}
        />
      ) : null}
    </main>
  );
}

function DemoBookShelf({
  assets,
  book,
  onEditBook,
  onEnter,
  onLockedFeature,
}: {
  assets: DemoAsset[];
  book: DemoBook | null;
  onEditBook: () => void;
  onEnter: () => void;
  onLockedFeature: () => void;
}) {
  const [viewMode, setViewMode] = useState<"single" | "spine">("single");

  return (
    <div className="absolute inset-0 z-50 overflow-hidden bg-black/95 demo-book-shelf">
      <div className="relative h-full demo-book-shelf-stage">
        <div className="absolute top-0 left-0 right-0 z-10">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold drop-shadow-lg text-white">World Library</h1>
                <span className="autosave-pill">Demo</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="app-button app-button-outline" type="button" onClick={onLockedFeature}>
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <button className="app-button app-button-outline icon-only" type="button" onClick={onLockedFeature} title="Generators locked">
                <Wand2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="absolute top-12 left-0 right-0 z-10 flex justify-center">
          <div className="demo-view-mode-selector">
            <button className={viewMode === "single" ? "active" : ""} type="button" onClick={() => setViewMode("single")}>Single</button>
            <button className={viewMode === "spine" ? "active" : ""} type="button" onClick={() => setViewMode("spine")}>Spine</button>
          </div>
        </div>

        <div className="pt-32 h-full">
          <div className="relative h-full transition-all duration-500 ease-in-out">
            {viewMode === "single" ? (
              <div className="demo-single-book-focus">
                <button className="demo-app-book-cover" type="button" onDoubleClick={onEnter}>
                  <span>LOCAL WORLD</span>
                  <strong>{book?.title || "My First World"}</strong>
                  <small>Double-click to enter world</small>
                </button>
              </div>
            ) : (
              <div className="demo-spine-book-focus">
                <button className="demo-app-book-spine" type="button" onDoubleClick={onEnter}>
                  <span>LOCAL WORLD</span>
                  <strong>{book?.title || "My First World"}</strong>
                  <small>Double-click to enter</small>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-20 left-6 z-10">
          <button className="app-button app-button-primary" type="button" disabled={!book} onClick={onEditBook}>
            Edit
          </button>
        </div>
        <div className="absolute bottom-6 left-6 z-10">
          <button className="app-button app-button-primary" type="button" onClick={onLockedFeature}>
            Create New World
          </button>
        </div>
        <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-2">
          <button className="app-button app-button-outline" type="button" onClick={onLockedFeature}>
            <Archive className="w-4 h-4" />
            ZIP Backup
          </button>
        </div>
      </div>
    </div>
  );
}

function DemoAssetPort({
  assets,
  allAssets,
  book,
  backgroundUrl,
  currentViewportAsset,
  previewUrls,
  selectedAssetId,
  viewportPath,
  onAssetDragStart,
  onAssetEnter,
  onAssetSelect,
  onCreateAsset,
  onOpenWorldLibrary,
  onViewportChange,
  onToggleSidebar,
}: {
  assets: DemoAsset[];
  allAssets: DemoAsset[];
  book: DemoBook;
  backgroundUrl: string | null;
  currentViewportAsset: DemoAsset | null;
  previewUrls: Record<string, string>;
  selectedAssetId: string | null;
  viewportPath: DemoAsset[];
  onAssetDragStart: (event: ReactPointerEvent<HTMLButtonElement>, asset: DemoAsset) => void;
  onAssetEnter: (assetId: string) => void;
  onAssetSelect: (assetId: string) => void;
  onCreateAsset: () => void;
  onOpenWorldLibrary: () => void;
  onViewportChange: (assetId: string | null) => void;
  onToggleSidebar: () => void;
}) {
  return (
    <div className="glass-strong cosmic-glow rounded-lg w-[calc(100%_-_5px)] mx-[2.5px] h-full flex flex-col min-h-0 overflow-hidden bg-sidebar/85 border border-sidebar-border/40 shadow-[0_0_0_1px_hsl(var(--sidebar-border)/0.25),0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-2xl demo-asset-port">
      <div className="flex items-center justify-between p-1 md:p-2 border-b border-sidebar-border/40 flex-wrap gap-2 bg-sidebar/85 text-white demo-asset-port-header">
        <div className="flex items-center gap-1 md:gap-2 flex-wrap">
          <button id="world-library-button" className="app-button app-button-outline app-button-sm glass cosmic-glow" type="button" onClick={onOpenWorldLibrary}>
            <ArrowLeft className="w-4 h-4" />
            <span>Library</span>
          </button>
          <nav className="demo-breadcrumb">
            <button type="button" onClick={() => onViewportChange(null)}>Root</button>
            {viewportPath.map((asset) => (
              <span className="demo-breadcrumb-segment" key={asset.id}>
                <span>/</span>
                <button type="button" onClick={() => onViewportChange(asset.id)}>{asset.title}</button>
              </span>
            ))}
          </nav>
          <button id="add-asset-button" className="app-button app-button-cosmic app-button-sm" type="button" onClick={onCreateAsset}>
            <Plus className="w-4 h-4" />
            <span>Add Asset</span>
          </button>
        </div>
        <button id="sidebar-toggle-button" className="app-icon-button" type="button" onClick={onToggleSidebar} title="Toggle Shelf">
          <PanelRight className="w-5 h-5" />
        </button>
      </div>

      <div id="asset-canvas-area" className="flex-1 relative overflow-hidden glass cosmic-glow border-t border-glass-border/20 demo-asset-canvas">
        <div className="absolute inset-0 demo-canvas-glass" />
        {backgroundUrl ? <img className="demo-viewport-background" src={backgroundUrl} alt="" /> : null}
        <div className="absolute bottom-4 left-4 z-10">
          <span className="autosave-pill">Saved</span>
        </div>

        <div className="viewport-container">
          {assets.length === 0 ? (
            <div className="demo-empty-canvas">
              <Sparkles className="w-8 h-8" />
              <p>No assets yet</p>
              <small>Add your first asset {currentViewportAsset ? `inside ${currentViewportAsset.title}` : "from the sidebar"}</small>
            </div>
          ) : (
            assets.slice(0, 40).map((asset) => (
              <button
                className={`demo-asset-item ${selectedAssetId === asset.id ? "selected" : ""}`}
                key={asset.id}
                style={{ "--asset-x": `${asset.x}px`, "--asset-y": `${asset.y}px` } as CSSProperties}
                type="button"
                onPointerDown={(event) => onAssetDragStart(event, asset)}
                onClick={() => onAssetSelect(asset.id)}
                onDoubleClick={() => onAssetEnter(asset.id)}
              >
                {previewUrls[asset.id] ? <img src={previewUrls[asset.id]} alt="" /> : <Image className="w-5 h-5" />}
                <strong>{asset.title}</strong>
                <span>{childCount(allAssets, asset.id)} child assets / double-click to enter</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DemoAssetExplorer({
  assets,
  allAssets,
  expandedAssetIds,
  onDelete,
  onBackgroundOpen,
  onLockedFeature,
  onSearchChange,
  onSelect,
  onEnterAsset,
  onToggleExpanded,
  onCreateAsset,
  onViewportChange,
  onToggleSidebar,
  searchQuery,
  selectedAsset,
  previewUrls,
}: {
  assets: DemoAsset[];
  allAssets: DemoAsset[];
  expandedAssetIds: Set<string>;
  onDelete: (asset: DemoAsset) => void;
  onBackgroundOpen: () => void;
  onLockedFeature: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (assetId: string) => void;
  onEnterAsset: (assetId: string) => void;
  onToggleExpanded: (assetId: string) => void;
  onCreateAsset: () => void;
  onViewportChange: (assetId: string | null) => void;
  onToggleSidebar: () => void;
  searchQuery: string;
  selectedAsset: DemoAsset | null;
  previewUrls: Record<string, string>;
}) {
  return (
    <div className="h-full flex flex-col bg-sidebar demo-asset-explorer">
      <div className="flex-shrink-0 px-3 py-3 border-b border-sidebar-border">
        <div className="flex justify-end gap-2 mb-3">
          <button className="app-icon-button" type="button" onClick={onBackgroundOpen} title="Background Map">
            <Image className="w-4 h-4" />
          </button>
          <button className="app-icon-button" type="button" onClick={onLockedFeature} title="Settings">
            <Settings className="w-4 h-4" />
          </button>
          <button className="app-icon-button" type="button" onClick={onToggleSidebar} title="Close sidebar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div id="generators-button" className="flex gap-1">
          <DemoGeneratorButton icon={<Users className="w-4 h-4" />} label="Characters" onClick={onLockedFeature} />
          <DemoGeneratorButton icon={<Building className="w-4 h-4" />} label="Cities" onClick={onLockedFeature} />
          <DemoGeneratorButton icon={<Sparkles className="w-4 h-4" />} label="Gods" onClick={onLockedFeature} />
          <DemoGeneratorButton icon={<Swords className="w-4 h-4" />} label="Battles" onClick={onLockedFeature} />
        </div>
      </div>

      <div className="flex-shrink-0 px-3 py-2 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-sm tracking-wide text-sidebar-foreground">Assets</h2>
          <button className="app-icon-button" type="button" onClick={onCreateAsset} title="Create new asset">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <label className="demo-sidebar-search">
          <Search className="w-4 h-4" />
          <input placeholder="Search assets..." value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} />
        </label>
      </div>

      <div className="flex-1 fantasy-sidebar-content overflow-y-auto demo-tree-panel">
        <button className="demo-root-asset" type="button" onClick={() => onViewportChange(null)}>
          <span className="root-dot" />
          <span>Root</span>
          <ChevronDown className="w-4 h-4" />
        </button>

        <div className="py-1">
          {assets
            .filter((asset) => !asset.parentId)
            .map((asset) => (
              <DemoAssetTreeRow
                allAssets={allAssets}
                asset={asset}
                depth={0}
                expandedAssetIds={expandedAssetIds}
                key={asset.id}
                onDelete={onDelete}
                onEnterAsset={onEnterAsset}
                onToggleExpanded={onToggleExpanded}
                onSelect={onSelect}
                previewUrls={previewUrls}
                selectedAssetId={selectedAsset?.id || null}
                visibleAssets={assets}
              />
            ))}
          {!assets.length ? <div className="demo-tree-empty">No assets found.</div> : null}
        </div>
      </div>
    </div>
  );
}

function DemoAssetTreeRow({
  allAssets,
  asset,
  depth,
  expandedAssetIds,
  onDelete,
  onEnterAsset,
  onToggleExpanded,
  onSelect,
  previewUrls,
  selectedAssetId,
  visibleAssets,
}: {
  allAssets: DemoAsset[];
  asset: DemoAsset;
  depth: number;
  expandedAssetIds: Set<string>;
  onDelete: (asset: DemoAsset) => void;
  onEnterAsset: (assetId: string) => void;
  onToggleExpanded: (assetId: string) => void;
  onSelect: (assetId: string) => void;
  previewUrls: Record<string, string>;
  selectedAssetId: string | null;
  visibleAssets: DemoAsset[];
}) {
  const children = visibleAssets.filter((candidate) => candidate.parentId === asset.id);
  const isExpanded = expandedAssetIds.has(asset.id);
  return (
    <>
      <div className="demo-tree-asset-row" style={{ "--tree-depth": depth } as CSSProperties}>
        {children.length ? (
          <button className="demo-tree-expander" type="button" onClick={() => onToggleExpanded(asset.id)} aria-label={isExpanded ? "Collapse asset" : "Expand asset"}>
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="demo-tree-expander-placeholder" />
        )}
        <button
          className={`demo-tree-asset ${selectedAssetId === asset.id ? "selected" : ""}`}
          type="button"
          onClick={() => onSelect(asset.id)}
          onDoubleClick={() => onEnterAsset(asset.id)}
        >
          {previewUrls[asset.id] ? <img src={previewUrls[asset.id]} alt="" /> : <Image className="w-4 h-4" />}
          <span>{asset.title}</span>
          {childCount(allAssets, asset.id) ? <small>{childCount(allAssets, asset.id)}</small> : null}
        </button>
        <button className="app-icon-button danger demo-tree-delete" type="button" onClick={() => onDelete(asset)} title="Delete asset">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {isExpanded ? children.map((child) => (
        <DemoAssetTreeRow
          allAssets={allAssets}
          asset={child}
          depth={depth + 1}
          expandedAssetIds={expandedAssetIds}
          key={child.id}
          onDelete={onDelete}
          onEnterAsset={onEnterAsset}
          onToggleExpanded={onToggleExpanded}
          onSelect={onSelect}
          previewUrls={previewUrls}
          selectedAssetId={selectedAssetId}
          visibleAssets={visibleAssets}
        />
      )) : null}
    </>
  );
}

function DemoAssetModal({
  assetLimitReached,
  assetTitle,
  fileInputRef,
  onAssetTitleChange,
  onClose,
  onSubmit,
}: {
  assetLimitReached: boolean;
  assetTitle: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onAssetTitleChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="demo-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="demo-modal glass-strong cosmic-glow" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>Create Asset</h2>
          <button className="app-icon-button" type="button" onClick={onClose} aria-label="Close asset dialog">
            <X className="w-4 h-4" />
          </button>
        </header>
        <label>
          Name
          <input value={assetTitle} onChange={(event) => onAssetTitleChange(event.target.value)} placeholder="NPC, location, item..." autoFocus />
        </label>
        <label>
          Optional file
          <input ref={fileInputRef} type="file" />
        </label>
        <button className="app-button app-button-primary" type="submit" disabled={assetLimitReached}>
          <FileUp className="w-4 h-4" />
          {assetLimitReached ? "Asset limit reached" : "Create asset"}
        </button>
      </form>
    </div>
  );
}

function DemoBookModal({
  bookTitle,
  onBookTitleChange,
  onClose,
  onSubmit,
}: {
  bookTitle: string;
  onBookTitleChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="demo-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="demo-modal glass-strong cosmic-glow" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>Edit World</h2>
          <button className="app-icon-button" type="button" onClick={onClose} aria-label="Close world dialog">
            <X className="w-4 h-4" />
          </button>
        </header>
        <label>
          World name
          <input value={bookTitle} onChange={(event) => onBookTitleChange(event.target.value)} autoFocus />
        </label>
        <button className="app-button app-button-primary" type="submit">Save world</button>
      </form>
    </div>
  );
}

function DemoBackgroundModal({
  currentViewportName,
  hasBackground,
  inputRef,
  onClear,
  onClose,
  onSubmit,
}: {
  currentViewportName: string;
  hasBackground: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onClear: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="demo-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="demo-modal glass-strong cosmic-glow" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>Background Map</h2>
          <button className="app-icon-button" type="button" onClick={onClose} aria-label="Close background dialog">
            <X className="w-4 h-4" />
          </button>
        </header>
        <p className="demo-modal-note">{currentViewportName}</p>
        <label>
          Image file
          <input ref={inputRef} type="file" accept="image/*" />
        </label>
        <div className="demo-modal-actions">
          <button className="app-button app-button-primary" type="submit">
            <FileUp className="w-4 h-4" />
            Save background
          </button>
          <button className="app-button app-button-outline" type="button" onClick={onClear} disabled={!hasBackground}>
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}

function DemoGeneratorButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className="fantasy-tab" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
