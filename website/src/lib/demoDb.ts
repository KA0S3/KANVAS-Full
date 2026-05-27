import { MAX_DEMO_ASSETS, MAX_DEMO_BOOKS, MAX_DEMO_UPLOAD_BYTES } from "./config";
import type { DemoAsset, DemoBook, DemoFile } from "../types/domain";

const DB_NAME = "kanvas-web-demo";
const DB_VERSION = 1;

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

    request.onupgradeneeded = () => {
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
    title: "Demo Book",
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
    requestToPromise(store.put({ ...book, title: title.trim() || "Demo Book", updatedAt: new Date().toISOString() }))
  );
}

export async function addDemoAsset(bookId: string, input: { title: string; file?: File }): Promise<void> {
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
    title: input.title.trim() || input.file?.name || "Untitled asset",
    fileId,
    mimeType: input.file?.type,
    sizeBytes: input.file?.size,
    createdAt: now,
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
}

export async function deleteDemoAsset(asset: DemoAsset): Promise<void> {
  const db = await openDemoDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["assets", "files"], "readwrite");
    transaction.objectStore("assets").delete(asset.id);
    if (asset.fileId) {
      transaction.objectStore("files").delete(asset.fileId);
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
