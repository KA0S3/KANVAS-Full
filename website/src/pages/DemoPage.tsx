import { FormEvent, useEffect, useRef, useState } from "react";
import { Database, Trash2, Upload } from "lucide-react";
import { MAX_DEMO_ASSETS, MAX_DEMO_UPLOAD_BYTES } from "../lib/config";
import { addDemoAsset, clearDemo, deleteDemoAsset, ensureDemoBook, getDemoState, updateDemoBookTitle } from "../lib/demoDb";
import type { DemoAsset, DemoBook } from "../types/domain";
import { usePurchaseOutlet } from "../components/usePurchaseOutlet";

const mbLabel = `${MAX_DEMO_UPLOAD_BYTES / 1024 / 1024}MB`;

export function DemoPage() {
  const { openPurchase } = usePurchaseOutlet();
  const [book, setBook] = useState<DemoBook | null>(null);
  const [assets, setAssets] = useState<DemoAsset[]>([]);
  const [title, setTitle] = useState("");
  const [assetTitle, setAssetTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const nextBook = await ensureDemoBook();
    const state = await getDemoState();
    setBook(nextBook);
    setTitle(nextBook.title);
    setAssets(state.assets.filter((asset) => asset.bookId === nextBook.id));
  };

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to open the demo."))
      .finally(() => setLoading(false));
  }, []);

  const handleRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!book) return;
    setError(null);
    try {
      await updateDemoBookTitle(book.id, title);
      await refresh();
      setNotice("Demo book renamed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename the demo book.");
    }
  };

  const handleAddAsset = async (event: FormEvent) => {
    event.preventDefault();
    if (!book) return;
    setError(null);
    setNotice(null);

    const file = fileInputRef.current?.files?.[0];
    try {
      await addDemoAsset(book.id, { title: assetTitle, file });
      setAssetTitle("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await refresh();
      setNotice("Asset saved locally in browser IndexedDB.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save the asset.");
    }
  };

  const handleDelete = async (asset: DemoAsset) => {
    setError(null);
    try {
      await deleteDemoAsset(asset);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete the asset.");
    }
  };

  const handleClear = async () => {
    setError(null);
    try {
      await clearDemo();
      await refresh();
      setNotice("Demo data cleared from this browser.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to clear the demo.");
    }
  };

  return (
    <main className="page">
      <section className="page-heading">
        <p className="eyebrow">Local-only online demo</p>
        <h1>One book, 100 assets, IndexedDB storage</h1>
        <p className="muted">This trial can read files you choose from your PC, but it only stores demo data in this browser.</p>
      </section>

      <section className="demo-layout">
        <aside className="panel">
          <div className="limit-list">
            <div>
              <strong>Books</strong>
              <span>1 / 1</span>
            </div>
            <div>
              <strong>Assets</strong>
              <span>{assets.length} / {MAX_DEMO_ASSETS}</span>
            </div>
            <div>
              <strong>Upload size</strong>
              <span>{mbLabel} each</span>
            </div>
            <div>
              <strong>Storage</strong>
              <span>Browser IndexedDB</span>
            </div>
          </div>
          <button className="button primary full" type="button" onClick={openPurchase}>
            Purchase desktop app
          </button>
          <button className="button full" type="button" onClick={handleClear}>
            Clear demo data
          </button>
        </aside>

        <section className="panel demo-workspace">
          {loading ? <div className="notice">Loading demo database...</div> : null}
          {error ? <div className="notice error">{error}</div> : null}
          {notice ? <div className="notice success">{notice}</div> : null}

          <form className="form inline-form" onSubmit={handleRename}>
            <label>
              Demo book
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <button className="button" type="submit" disabled={!book}>
              Save title
            </button>
          </form>

          <form className="upload-form" onSubmit={handleAddAsset}>
            <label>
              Asset name
              <input value={assetTitle} onChange={(event) => setAssetTitle(event.target.value)} placeholder="NPC, location, item..." />
            </label>
            <label>
              Optional file
              <input ref={fileInputRef} type="file" />
            </label>
            <button className="button primary" type="submit" disabled={!book || assets.length >= MAX_DEMO_ASSETS}>
              <Upload size={16} />
              Add asset
            </button>
          </form>

          <div className="asset-grid" aria-live="polite">
            {assets.length === 0 ? (
              <div className="empty-state">
                <Database size={32} />
                <p>No demo assets yet.</p>
              </div>
            ) : (
              assets.map((asset) => (
                <article className="asset-card" key={asset.id}>
                  <div>
                    <h3>{asset.title}</h3>
                    <p>{asset.fileId ? `${asset.mimeType || "file"} · ${Math.ceil((asset.sizeBytes || 0) / 1024)}KB` : "No file attached"}</p>
                  </div>
                  <button className="icon-button" type="button" onClick={() => handleDelete(asset)} aria-label={`Delete ${asset.title}`}>
                    <Trash2 size={16} />
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
