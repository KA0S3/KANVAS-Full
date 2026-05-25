import { useEffect, useState } from 'react';
import { db } from '@/storage/indexeddb';
import type { Book } from '@/types/book';

type BookWorldStats = {
  assetCount: number;
  tagCount: number;
  lastModified: string;
};

const statsCache = new Map<string, BookWorldStats>();

const getFallbackStats = (book: Book | null | undefined): BookWorldStats => ({
  assetCount: Object.keys(book?.worldData?.assets || {}).length,
  tagCount: Object.keys(book?.worldData?.tags || {}).length,
  lastModified: book?.updatedAt ? new Date(book.updatedAt).toLocaleDateString() : 'Unknown',
});

export function useBookWorldStats(book: Book | null | undefined): BookWorldStats {
  const [stats, setStats] = useState<BookWorldStats>(() => getFallbackStats(book));

  useEffect(() => {
    let cancelled = false;

    if (!book?.id) {
      setStats(getFallbackStats(book));
      return () => {
        cancelled = true;
      };
    }

    const cached = statsCache.get(book.id);
    if (cached) {
      setStats(cached);
      return () => {
        cancelled = true;
      };
    }

    setStats(getFallbackStats(book));

    void db.loadProjectBundle(book.id)
      .then((bundle) => {
        if (cancelled) return;

        const nextStats = {
          assetCount: bundle.assets.length,
          tagCount: bundle.projectTags.length + bundle.globalTags.length,
          lastModified: book.updatedAt ? new Date(book.updatedAt).toLocaleDateString() : 'Unknown',
        };
        statsCache.set(book.id, nextStats);
        setStats(nextStats);
      })
      .catch(() => {
        if (!cancelled) {
          setStats(getFallbackStats(book));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [book?.id, book?.worldData?.assets, book?.worldData?.tags]);

  return stats;
}
