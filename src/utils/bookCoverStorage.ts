import { indexedDBStorage } from './indexedDBStorage';

const BOOK_COVER_PREFIX = 'book-cover:';

export function getBookCoverStorageKey(bookId: string): string {
  return `${BOOK_COVER_PREFIX}${bookId}`;
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
}

export async function saveBookCover(bookId: string, source: File | string): Promise<{
  storageKey: string;
  compressedSize?: number;
}> {
  const storageKey = getBookCoverStorageKey(bookId);
  const file = typeof source === 'string'
    ? await dataUrlToFile(source, `${storageKey}.png`)
    : source;

  const result = await indexedDBStorage.storeImage(storageKey, file);
  if (!result.success) {
    throw new Error(result.error || 'Failed to save book cover locally');
  }

  return {
    storageKey,
    compressedSize: result.compressedSize,
  };
}

export async function loadBookCover(bookIdOrStorageKey: string): Promise<string | null> {
  const storageKey = bookIdOrStorageKey.startsWith(BOOK_COVER_PREFIX)
    ? bookIdOrStorageKey
    : getBookCoverStorageKey(bookIdOrStorageKey);

  return indexedDBStorage.getImage(storageKey);
}

export async function removeBookCover(bookIdOrStorageKey: string): Promise<boolean> {
  const storageKey = bookIdOrStorageKey.startsWith(BOOK_COVER_PREFIX)
    ? bookIdOrStorageKey
    : getBookCoverStorageKey(bookIdOrStorageKey);

  return indexedDBStorage.removeImage(storageKey);
}
