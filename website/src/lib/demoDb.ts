import { MAX_DEMO_ASSETS, MAX_DEMO_BOOKS, MAX_DEMO_UPLOAD_BYTES } from "./config";
import type { DemoAsset, DemoBook, DemoFile } from "../types/domain";

const DB_NAME = "kanvas-web-demo";
const DB_VERSION = 3;

type StoreName = "books" | "assets" | "files";

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function openDemoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("assets")) {
        const assets = db.createObjectStore("assets", { keyPath: "id" });
        assets.createIndex("bookId", "bookId", { unique: false });
      }
      if (!db.objectStoreNames.contains("files")) {
        const files = db.createObjectStore("files", { keyPath: "id" });
        files.createIndex("assetId", "assetId", { unique: false });
      }

      if (event.oldVersion < 2 && db.objectStoreNames.contains("assets")) {
        const assets = request.transaction?.objectStore("assets");
        if (assets) {
          const cursorRequest = assets.openCursor();
          cursorRequest.onsuccess = (cursorEvent) => {
            const cursor = (cursorEvent.target as IDBRequest<IDBCursorWithValue>).result;
            if (!cursor) return;
            const asset = cursor.value as Partial<DemoAsset>;
            cursor.update({
              ...asset,
              x: typeof asset.x === "number" ? asset.x : 140 + Math.floor(Math.random() * 360),
              y: typeof asset.y === "number" ? asset.y : 140 + Math.floor(Math.random() * 260),
              updatedAt: asset.updatedAt || asset.createdAt || new Date().toISOString(),
            });
            cursor.continue();
          };
        }
      }
    };

    request.onerror = () => reject(request.error || new Error("Unable to open demo database."));
    request.onsuccess = () => resolve(request.result);
  });
}

function readAll<T>(storeName: StoreName): Promise<T[]> {
  return withStore(storeName, "readonly", (store) => requestToPromise<T[]>(store.getAll()));
}

function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  return openDemoDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);

        run(store).then(resolve).catch(reject);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("Demo database transaction failed."));
        };
      })
  );
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getDemoState() {
  const [books, assets] = await Promise.all([readAll<DemoBook>("books"), readAll<DemoAsset>("assets")]);
  return {
    books: books.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    assets: assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function ensureDemoBook(): Promise<DemoBook> {
  const books = await readAll<DemoBook>("books");
  if (books[0]) {
    return books[0];
  }

  if (books.length >= MAX_DEMO_BOOKS) {
    throw new Error("The online demo is limited to one book.");
  }

  const now = new Date().toISOString();
  const book: DemoBook = {
    id: createId("book"),
    title: "My First World",
    createdAt: now,
    updatedAt: now,
  };

  await withStore("books", "readwrite", (store) => requestToPromise(store.add(book)));
  return book;
}

export async function updateDemoBookTitle(bookId: string, title: string): Promise<void> {
  const books = await readAll<DemoBook>("books");
  const book = books.find((item) => item.id === bookId);
  if (!book) {
    throw new Error("Demo book was not found.");
  }

  await withStore("books", "readwrite", (store) =>
    requestToPromise(store.put({ ...book, title: title.trim() || "My First World", updatedAt: new Date().toISOString() }))
  );
}

export async function addDemoAsset(bookId: string, input: { title: string; file?: File; parentId?: string | null }): Promise<DemoAsset> {
  const assets = await readAll<DemoAsset>("assets");
  if (assets.length >= MAX_DEMO_ASSETS) {
    throw new Error("The online demo is limited to 100 assets.");
  }

  if (input.file && input.file.size > MAX_DEMO_UPLOAD_BYTES) {
    throw new Error("The online demo only accepts files up to 2MB.");
  }

  const now = new Date().toISOString();
  const assetId = createId("asset");
  const fileId = input.file ? createId("file") : undefined;
  const asset: DemoAsset = {
    id: assetId,
    bookId,
    parentId: input.parentId || undefined,
    title: input.title.trim() || input.file?.name || "Untitled asset",
    x: 150 + (assets.filter((item) => (item.parentId || null) === (input.parentId || null)).length % 4) * 210,
    y: 150 + (assets.filter((item) => (item.parentId || null) === (input.parentId || null)).length % 3) * 130,
    fileId,
    mimeType: input.file?.type,
    sizeBytes: input.file?.size,
    createdAt: now,
    updatedAt: now,
  };

  const db = await openDemoDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["assets", "files"], "readwrite");
    transaction.objectStore("assets").add(asset);

    if (input.file && fileId) {
      const fileRecord: DemoFile = {
        id: fileId,
        assetId,
        name: input.file.name,
        mimeType: input.file.type || "application/octet-stream",
        sizeBytes: input.file.size,
        blob: input.file,
        createdAt: now,
      };
      transaction.objectStore("files").add(fileRecord);
    }

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Unable to save the demo asset."));
    };
  });

  return asset;
}

export async function deleteDemoAsset(asset: DemoAsset): Promise<void> {
  const allAssets = await readAll<DemoAsset>("assets");
  const idsToDelete = new Set<string>([asset.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of allAssets) {
      if (candidate.parentId && idsToDelete.has(candidate.parentId) && !idsToDelete.has(candidate.id)) {
        idsToDelete.add(candidate.id);
        changed = true;
      }
    }
  }

  const db = await openDemoDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["assets", "files"], "readwrite");
    const assetStore = transaction.objectStore("assets");
    const fileStore = transaction.objectStore("files");

    for (const id of idsToDelete) {
      const nextAsset = allAssets.find((item) => item.id === id);
      assetStore.delete(id);
      if (nextAsset?.fileId) {
        fileStore.delete(nextAsset.fileId);
      }
    }

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Unable to delete the demo asset."));
    };
  });
}

export async function updateDemoAsset(
  assetId: string,
  updates: Partial<Pick<DemoAsset, "title" | "x" | "y">>
): Promise<void> {
  const assets = await readAll<DemoAsset>("assets");
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) {
    throw new Error("Demo asset was not found.");
  }

  await withStore("assets", "readwrite", (store) =>
    requestToPromise(
      store.put({
        ...asset,
        ...updates,
        title: updates.title === undefined ? asset.title : updates.title.trim() || "Untitled asset",
        updatedAt: new Date().toISOString(),
      })
    )
  );
}

export async function getDemoFile(asset: DemoAsset): Promise<DemoFile | null> {
  if (!asset.fileId) return null;
  return withStore("files", "readonly", (store) => requestToPromise<DemoFile | undefined>(store.get(asset.fileId!))).then(
    (file) => file || null
  );
}

export async function getDemoBackgroundFile(owner: DemoBook | DemoAsset): Promise<DemoFile | null> {
  if (!owner.backgroundFileId) return null;
  return withStore("files", "readonly", (store) =>
    requestToPromise<DemoFile | undefined>(store.get(owner.backgroundFileId!))
  ).then((file) => file || null);
}

export async function updateDemoViewportBackground(
  owner: { type: "book"; id: string } | { type: "asset"; id: string },
  file: File | null
): Promise<void> {
  if (file && file.size > MAX_DEMO_UPLOAD_BYTES) {
    throw new Error("The online demo only accepts background files up to 2MB.");
  }

  const db = await openDemoDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["books", "assets", "files"], "readwrite");
    const ownerStore = transaction.objectStore(owner.type === "book" ? "books" : "assets");
    const fileStore = transaction.objectStore("files");
    const getRequest = ownerStore.get(owner.id);

    getRequest.onsuccess = () => {
      const record = getRequest.result as DemoBook | DemoAsset | undefined;
      if (!record) {
        transaction.abort();
        reject(new Error(owner.type === "book" ? "Demo book was not found." : "Demo asset was not found."));
        return;
      }

      if (record.backgroundFileId) {
        fileStore.delete(record.backgroundFileId);
      }

      const now = new Date().toISOString();
      if (!file) {
        ownerStore.put({
          ...record,
          backgroundFileId: undefined,
          backgroundMimeType: undefined,
          backgroundSizeBytes: undefined,
          updatedAt: now,
        });
        return;
      }

      const fileId = createId("background");
      const fileRecord: DemoFile = {
        id: fileId,
        assetId: `${owner.type}:${owner.id}:background`,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        blob: file,
        createdAt: now,
      };
      fileStore.add(fileRecord);
      ownerStore.put({
        ...record,
        backgroundFileId: fileId,
        backgroundMimeType: fileRecord.mimeType,
        backgroundSizeBytes: fileRecord.sizeBytes,
        updatedAt: now,
      });
    };

    getRequest.onerror = () => {
      reject(getRequest.error || new Error("Unable to load background owner."));
    };
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Unable to save the background image."));
    };
  });
}

export async function clearDemo(): Promise<void> {
  const db = await openDemoDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["books", "assets", "files"], "readwrite");
    transaction.objectStore("books").clear();
    transaction.objectStore("assets").clear();
    transaction.objectStore("files").clear();

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Unable to clear the demo."));
    };
  });
}
