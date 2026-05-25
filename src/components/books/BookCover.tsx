import React, { useState, useRef } from 'react';
import { X, Calendar, Tag, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Book } from '@/types/book';
import { useThemeStore } from '@/stores/themeStore';
import { useBookWorldStats } from '@/hooks/useBookWorldStats';
import { useResolvedBookCover } from '@/hooks/useResolvedBookCover';
import { cssUrl } from '@/utils/cssUrl';

// Import book cover images
import BlackBook from '@/assets/Book-Covers/Black_book.png';
import BlueBook from '@/assets/Book-Covers/Blue_book.png';
import BrownBook from '@/assets/Book-Covers/brown_book.png';
import GreenBook from '@/assets/Book-Covers/Green_book.png';
import PurpleBook from '@/assets/Book-Covers/purple_book.png';
import WhiteBook from '@/assets/Book-Covers/White_book.png';

interface BookCoverProps {
  book: Book;
  size?: 'small' | 'medium' | 'large';
  showBack?: boolean;
  className?: string;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

const BookCover: React.FC<BookCoverProps> = ({ 
  book, 
  size = 'medium', 
  showBack = false,
  className = '',
  onDoubleClick
}) => {
  // Add null check for book prop
  if (!book) {
    return (
      <div className={`${size === 'small' ? 'w-16 h-24' : size === 'medium' ? 'w-24 h-36' : 'w-48 h-72'} rounded-md bg-gray-300 flex items-center justify-center`}>
        <span className="text-gray-500 text-xs">No book data</span>
      </div>
    );
  }

  try {
    const { theme } = useThemeStore();
    const [isHovered, setIsHovered] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const resolvedCoverImage = useResolvedBookCover(book);
    const worldStats = useBookWorldStats(book);

    const handleBookClick = (e: React.MouseEvent) => {
      // Clear any existing timeout
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      // Set a timeout to handle single click after a delay
      clickTimeoutRef.current = setTimeout(() => {
        setIsFlipped(!isFlipped);
        clickTimeoutRef.current = null;
      }, 250);
    };

    const handleBookDoubleClick = (e: React.MouseEvent) => {
      console.log('[BookCover] Double-click detected for book:', book.title);
      // Clear the single click timeout
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      // Call the parent's double-click handler if provided
      if (onDoubleClick) {
        console.log('[BookCover] Calling onDoubleClick handler');
        onDoubleClick(e);
      } else {
        console.log('[BookCover] No onDoubleClick handler provided');
      }
    };
    
    const sizeClasses = {
      small: 'w-16 h-24 text-xs',
      medium: 'w-24 h-36 text-sm',
      large: 'w-48 h-72 text-lg'
    };

    const getLeatherStyle = () => {
      if (!book.isLeatherMode || resolvedCoverImage) return null;
      
      // Map leather colors to book cover images based on preset names
      const getBookCoverImage = (leatherColor: string) => {
        const colorLower = leatherColor.toLowerCase();
        
        // Match based on leather preset names and hex values
        if (colorLower.includes('rich black') || colorLower === '#1a1a1a' || colorLower === '#0d0d0d' || colorLower === '#2d2d2d') {
          return BlackBook;
        }
        if (colorLower.includes('navy blue') || colorLower === '#1e3a8a' || colorLower === '#1e2f5a' || colorLower === '#2563eb') {
          return BlueBook;
        }
        if (colorLower.includes('classic brown') || colorLower === '#8b4513' || colorLower === '#654321' || colorLower === '#a0522d') {
          return BrownBook;
        }
        if (colorLower.includes('forest green') || colorLower === '#2d5016' || colorLower === '#1f3a0f' || colorLower === '#3a6b1e') {
          return GreenBook;
        }
        if (colorLower.includes('royal purple') || colorLower === '#6b46c1' || colorLower === '#553c9a' || colorLower === '#8b5cf6') {
          return PurpleBook;
        }
        if (colorLower.includes('arctic white') || colorLower === '#f5f5f0' || colorLower === '#e8e8e0' || colorLower === '#fafaf5') {
          return WhiteBook;
        }
        
        // Default fallback
        return BrownBook;
      };
      
      const coverImage = getBookCoverImage(book.leatherColor || '#8B4513');
      
      return {
        background: `${cssUrl(coverImage)} center/cover no-repeat`,
        border: '2px solid rgba(0,0,0,0.2)',
        boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
        position: 'relative' as const
      };
    };

    const getCoverStyle = () => {
      // Custom cover image has highest priority
      if (resolvedCoverImage && !showBack) {
        return {
          backgroundImage: cssUrl(resolvedCoverImage),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        };
      }
      
      // Leather mode
      if (book.isLeatherMode && !showBack) {
        return getLeatherStyle();
      }
      
      // Use existing gradient or create fallback
      if (book.gradient && !showBack) {
        return {
          background: book.gradient,
          border: '2px solid',
          borderImage: 'linear-gradient(45deg, #C0C0C0, #E5E5E5, #C0C0C0, #8B8B8B, #C0C0C0) 1',
          boxShadow: '0 0 10px rgba(192, 192, 192, 0.5), inset 0 0 5px rgba(255, 255, 255, 0.3)'
        };
      }
      
      // Simple fallback from book color
      const fallbackGradient = `linear-gradient(135deg, ${book.color}dd, ${book.color}99), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.6), transparent 50%)`;
      return {
        background: fallbackGradient
      };
    };

    const getTextStyle = (textSettings: { type: string; customFont?: string; color: string; size: string; sizePx?: number }) => {
      // Get font family based on text type
      let fontFamily = 'serif';
      switch (textSettings.type) {
        case 'sans-serif':
          fontFamily = 'sans-serif';
          break;
        case 'monospace':
          fontFamily = 'monospace';
          break;
        case 'cursive':
          fontFamily = 'cursive';
          break;
        case 'fantasy':
          fontFamily = 'fantasy';
          break;
        case 'custom':
          fontFamily = textSettings.customFont || 'serif';
          break;
        default:
          fontFamily = 'serif';
      }
      
      // Use preserved pixel value if available, otherwise fall back to categorical size
      let fontSize = '14px';
      if (textSettings.sizePx) {
        fontSize = `${textSettings.sizePx}px`;
      } else {
        // Get font size based on size
        switch (textSettings.size) {
          case 'small':
            fontSize = '12px';
            break;
          case 'medium':
            fontSize = '14px';
            break;
          case 'large':
            fontSize = '18px';
            break;
          case 'extra-large':
            fontSize = '24px';
            break;
        }
      }
      
      return {
        fontFamily,
        color: textSettings.color,
        fontSize
      };
    };


    const renderContent = () => {
      if (showBack) {
        return (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <div className="font-bold mb-2" style={{ writingMode: 'horizontal-tb' }}>
              {book.title}
            </div>
            <div className="text-xs opacity-80 leading-tight">
              {book.description || 'No description available'}
            </div>
          </div>
        );
      }

      // Use cover page settings if enabled
      if (book.coverPageSettings?.showCoverPage) {
        const { title, subheading, description } = book.coverPageSettings;
        
        if (isHovered) {
          // Show description overlay on hover instead of stats
          return (
            <div className="absolute inset-0 bg-amber-100/80 flex items-center justify-center p-3 transition-opacity duration-200 ease-in-out">
              <div className="text-amber-900 text-center">
                <p className="text-xs leading-relaxed">
                  {book.description || 'No description available'}
                </p>
              </div>
            </div>
          );
        }

        // Show title, subheading, and description with custom positioning and styling
        return (
          <div className="absolute inset-0 h-full p-2">
            {/* Title */}
            {title.text && (
              <div 
                className="absolute"
                style={{
                  left: `${title.position.x}%`,
                  top: `${title.position.y}%`,
                  transform: 'translate(-50%, -50%)',
                  ...getTextStyle(title.style),
                  writingMode: 'horizontal-tb',
                  fontWeight: 'bold'
                }}
              >
                {title.text}
              </div>
            )}
            
            {/* Subheading */}
            {subheading?.text && (
              <div 
                className="absolute"
                style={{
                  left: `${subheading.position.x}%`,
                  top: `${subheading.position.y}%`,
                  transform: 'translate(-50%, -50%)',
                  ...getTextStyle(subheading.style),
                  writingMode: 'horizontal-tb',
                  fontSize: '12px',
                  opacity: 0.9
                }}
              >
                {subheading.text}
              </div>
            )}
            
            {/* Description */}
            {description?.text && (
              <div 
                className="absolute"
                style={{
                  left: `${description.position.x}%`,
                  top: `${description.position.y}%`,
                  transform: 'translate(-50%, -50%)',
                  ...getTextStyle(description.style),
                  writingMode: 'horizontal-tb',
                  fontSize: '12px',
                  opacity: 0.8
                }}
              >
                {description.text}
              </div>
            )}
          </div>
        );
      }

      if (resolvedCoverImage) {
        if (isHovered) {
          // Show description overlay on hover for image covers
          return (
            <div className="absolute inset-0 bg-amber-100/80 flex items-center justify-center p-3 transition-opacity duration-200 ease-in-out">
              <div className="text-amber-900 text-center">
                <p className="text-xs leading-relaxed">
                  {book.description || 'No description available'}
                </p>
              </div>
            </div>
          );
        }
        return null; // Image covers entire area when not hovered
      }

      if (isHovered) {
        // Show description on hover instead of stats
        return (
          <div className="absolute inset-0 bg-amber-100/80 flex items-center justify-center p-3 transition-opacity duration-200 ease-in-out">
            <div className="text-amber-900 text-center">
              <p className="text-xs leading-relaxed">
                {book.description || 'No description available'}
              </p>
            </div>
          </div>
        );
      }

      // Show normal content when not hovered
      return (
        <div className="flex flex-col items-center justify-center h-full p-2 text-center">
          <div className="font-bold mb-1" style={{ writingMode: 'horizontal-tb' }}>
            {book.title}
          </div>
          {book.subheading && (
            <div className="text-sm opacity-90 mb-1" style={{ writingMode: 'horizontal-tb' }}>
              {book.subheading}
            </div>
          )}
          {book.description && (
            <div className="text-xs opacity-80 line-clamp-2">
              {book.description}
            </div>
          )}
        </div>
      );
    };

    return (
      <div 
        className={`
          ${sizeClasses[size]} 
          rounded-md flex items-center justify-center 
          transition-all duration-300 ease-in-out
          ${book.isLeatherMode && !resolvedCoverImage ? 'leather-texture' : ''}
          ${className}
          relative overflow-hidden
        `}
        style={getCoverStyle()}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleBookClick}
        onDoubleClick={handleBookDoubleClick}
      >
        {/* Front Content */}
        <div className={`absolute inset-0 transition-opacity duration-300 ${isFlipped ? 'opacity-0' : 'opacity-100'}`}>
          {renderContent()}
        </div>

        {/* Back Content (Stats) */}
        <div 
          className={`absolute inset-0 transition-opacity duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0'}`}
        >
          {/* Flipped background */}
          {(() => {
            const coverStyle = getCoverStyle();
            return (
              <div 
                className="absolute inset-0"
                style={{
                  background: coverStyle.background || 
                           ('backgroundImage' in coverStyle && coverStyle.backgroundImage ? 
                            `${coverStyle.backgroundImage} center/cover no-repeat` :
                            coverStyle.background),
                  transform: 'scaleX(-1)'
                }}
              ></div>
            );
          })()}
          
          {/* Semi-transparent overlay for text readability */}
          <div className="absolute inset-0 bg-black/40"></div>
          
          {/* Close Button */}
          <div className="absolute top-2 right-2 z-10">
            <Button
              size="sm"
              variant="ghost"
              className="w-6 h-6 p-0 rounded-full text-white hover:bg-white/20 border border-white/30"
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(false);
              }}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>

          {/* Stats Content - Normal orientation */}
          <div className="absolute inset-0 p-3 pt-12 text-white z-0">
            <div className="space-y-3 text-xs">
              <div>
                <h4 className="font-bold text-sm mb-1 text-blue-300">{book.title || 'Untitled World'}</h4>
                {book.description && (
                  <p className="text-xs opacity-90 line-clamp-2">{book.description}</p>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-white/30">
                <div className="flex items-center gap-2">
                  <Image className="w-3 h-3 text-green-400 flex-shrink-0" />
                  <span className="text-xs">{worldStats?.assetCount || 0} Assets</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                  <span className="text-xs">{worldStats?.tagCount || 0} Tags</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-purple-400 flex-shrink-0" />
                  <span className="text-xs">Created {worldStats?.lastModified || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('BookCover component error:', error);
    return (
      <div className={`${size === 'small' ? 'w-16 h-24' : size === 'medium' ? 'w-24 h-36' : 'w-48 h-72'} rounded-md bg-red-100 border border-red-300 flex items-center justify-center`}>
        <div className="text-center p-2">
          <span className="text-red-600 text-xs font-medium">Error</span>
          <span className="text-red-500 text-xs block mt-1">Failed to render</span>
        </div>
      </div>
    );
  }
};

export default BookCover;
