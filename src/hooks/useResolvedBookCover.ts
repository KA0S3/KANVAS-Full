import { useEffect, useState } from 'react';
import type { Book } from '@/types/book';
import { loadBookCover } from '@/utils/bookCoverStorage';

export function useResolvedBookCover(book: Book | null | undefined, previewOverride?: string | null): string | undefined {
  const [resolvedCover, setResolvedCover] = useState<string | undefined>(() => previewOverride || book?.coverImage);

  useEffect(() => {
    let cancelled = false;

    if (!book) {
      setResolvedCover(previewOverride || undefined);
      return () => {
        cancelled = true;
      };
    }

    if (previewOverride) {
      setResolvedCover(previewOverride);
      return () => {
        cancelled = true;
      };
    }

    if (book.hasLocalCoverImage || book.coverImageStorageKey) {
      loadBookCover(book.coverImageStorageKey || book.id)
        .then((cover) => {
          if (!cancelled) {
            setResolvedCover(cover || book.coverImage || undefined);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResolvedCover(book.coverImage || undefined);
          }
        });
    } else {
      setResolvedCover(book.coverImage || undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [
    book?.id,
    book?.coverImage,
    book?.coverImageStorageKey,
    book?.hasLocalCoverImage,
    previewOverride,
  ]);

  return resolvedCover;
}
