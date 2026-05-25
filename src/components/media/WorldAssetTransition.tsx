import pedestalDark from '@/assets/pedestal-dark.png';
import cosmicBackground from '@/assets/cosmic-background.png';
import BlackBook from '@/assets/Book-Covers/Black_book.png';
import BlueBook from '@/assets/Book-Covers/Blue_book.png';
import BrownBook from '@/assets/Book-Covers/brown_book.png';
import GreenBook from '@/assets/Book-Covers/Green_book.png';
import PurpleBook from '@/assets/Book-Covers/purple_book.png';
import WhiteBook from '@/assets/Book-Covers/White_book.png';
import { useResolvedBookCover } from '@/hooks/useResolvedBookCover';
import type { Book } from '@/types/book';
import { cssUrl } from '@/utils/cssUrl';
import './world-asset-transition.css';

type TransitionDirection = 'enter' | 'return';

interface WorldAssetTransitionProps {
  direction: TransitionDirection;
  book?: Book;
}

export function WorldAssetTransition({ direction, book }: WorldAssetTransitionProps) {
  const resolvedCoverImage = useResolvedBookCover(book);
  const coverStyle = getTransitionCoverStyle(book, resolvedCoverImage);

  return (
    <div
      className={`world-asset-transition is-${direction}`}
      aria-hidden="true"
    >
      <div
        className="world-asset-transition__library"
        style={{ backgroundImage: cssUrl(pedestalDark) }}
      />
      <div
        className="world-asset-transition__cosmos"
        style={{ backgroundImage: cssUrl(cosmicBackground) }}
      />
      <div className="world-asset-transition__veil" />
      <div className="world-asset-transition__viewport-card" />
      <div className="world-asset-transition__book-wrap">
        <div className="world-asset-transition__book-stage">
          <div className="world-asset-transition__pages" />
          <div className="world-asset-transition__page world-asset-transition__page--left">
            <p>{book?.description || book?.subheading || 'No description available'}</p>
          </div>
          <div className="world-asset-transition__page world-asset-transition__page--right">
            <p>{book?.subheading || book?.title || 'World'}</p>
          </div>
          <div className="world-asset-transition__book-cover" style={coverStyle}>
            <div className="world-asset-transition__book-spine" />
            <div className="world-asset-transition__book-title">
              {book?.title || 'World'}
            </div>
            {book?.subheading && (
              <div className="world-asset-transition__book-subtitle">
                {book.subheading}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getTransitionCoverStyle(book: Book | undefined, resolvedCoverImage?: string) {
  if (!book) {
    return { background: 'linear-gradient(135deg, #5b3b22, #1b1410)' };
  }

  if (resolvedCoverImage) {
    return {
      backgroundImage: cssUrl(resolvedCoverImage),
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }

  if (book.isLeatherMode) {
    return {
      background: `${cssUrl(getLeatherBookImage(book.leatherColor || '#8B4513'))} center/cover no-repeat`,
    };
  }

  if (book.gradient) {
    return { background: book.gradient };
  }

  return {
    background: `linear-gradient(135deg, ${book.color || '#5b3b22'}dd, ${book.color || '#5b3b22'}99), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.6), transparent 50%)`,
  };
}

function getLeatherBookImage(leatherColor: string) {
  const colorLower = leatherColor.toLowerCase();

  if (colorLower.includes('rich black') || colorLower === '#1a1a1a' || colorLower === '#0d0d0d' || colorLower === '#2d2d2d') return BlackBook;
  if (colorLower.includes('navy blue') || colorLower === '#1e3a8a' || colorLower === '#1e2f5a' || colorLower === '#2563eb') return BlueBook;
  if (colorLower.includes('classic brown') || colorLower === '#8b4513' || colorLower === '#654321' || colorLower === '#a0522d') return BrownBook;
  if (colorLower.includes('forest green') || colorLower === '#2d5016' || colorLower === '#1f3a0f' || colorLower === '#3a6b1e') return GreenBook;
  if (colorLower.includes('royal purple') || colorLower === '#6b46c1' || colorLower === '#553c9a' || colorLower === '#8b5cf6') return PurpleBook;
  if (colorLower.includes('arctic white') || colorLower === '#f5f5f0' || colorLower === '#e8e8e0' || colorLower === '#fafaf5') return WhiteBook;

  return BrownBook;
}
