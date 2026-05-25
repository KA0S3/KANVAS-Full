import { useState } from 'react';
import { BookOpen, Edit, Trash2, X, Calendar, Tag, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Book } from '@/types/book';
import { useBookWorldStats } from '@/hooks/useBookWorldStats';
import { useResolvedBookCover } from '@/hooks/useResolvedBookCover';
import { cssUrl } from '@/utils/cssUrl';

interface BookItemProps {
  book: Book;
  isSelected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showControls?: boolean;
}

export function BookItem({ 
  book, 
  isSelected = false, 
  onClick, 
  onEdit, 
  onDelete, 
  showControls = true 
}: BookItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const resolvedCoverImage = useResolvedBookCover(book);
  const worldStats = useBookWorldStats(book);

  const bookStyle = resolvedCoverImage
    ? { backgroundImage: cssUrl(resolvedCoverImage) }
    : book.gradient 
      ? { background: book.gradient }
      : { backgroundColor: book.color };

  const handleBookClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFlipped) {
      setIsFlipped(true);
      setTimeout(() => {
        setShowStats(true);
      }, 300); // Wait for flip animation to complete
    } else {
      setShowStats(false);
      setTimeout(() => {
        setIsFlipped(false);
      }, 150);
    }
  };

  const handleBookSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div 
      className="relative group cursor-pointer transition-all duration-300"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={handleDoubleClick}
    >
      {/* 3D Book Container */}
      <div 
        className={`
          relative preserve-3d transition-all duration-300
          ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        `}
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped 
            ? 'scale(1) rotateY(180deg)' 
            : isHovered 
              ? 'scale(1.05) rotateY(12deg)' 
              : 'scale(1) rotateY(0deg)',
        }}
        onClick={handleBookClick}
      >
        {/* Book Cover */}
        <Card 
          className="relative w-32 h-48 md:w-40 md:h-56 rounded-sm shadow-2xl overflow-hidden border-0 backface-hidden"
          style={bookStyle}
        >
          {/* Book Spine Effect */}
          <div 
            className="absolute left-0 top-0 bottom-0 w-2 opacity-30"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          />
          
          {/* Book Content */}
          <div className="absolute inset-0 p-3 flex flex-col justify-between text-white">
            {/* Title */}
            <div className="space-y-1">
              <h3 className="font-bold text-sm md:text-base line-clamp-3 drop-shadow-lg">
                {book.title}
              </h3>
              {book.description && (
                <p className="text-xs opacity-80 line-clamp-2 drop-shadow">
                  {book.description}
                </p>
              )}
            </div>
            
            {/* Book Icon */}
            <div className="flex justify-center">
              <BookOpen className="w-6 h-6 md:w-8 md:h-8 opacity-50 drop-shadow-lg" />
            </div>
          </div>

          {/* Hover Description Overlay */}
          {isHovered && !isFlipped && book.description && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-3 transition-opacity duration-200 ease-in-out">
              <div className="text-white text-center">
                <p className="text-xs md:text-sm leading-relaxed">
                  {book.description}
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Book Back (for flip animation) */}
        <Card 
          className="absolute inset-0 w-32 h-48 md:w-40 md:h-56 rounded-sm shadow-2xl overflow-hidden border-0 backface-hidden bg-gradient-to-br from-slate-800 to-slate-900"
          style={{
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Stats Panel */}
          <div className="absolute inset-0 p-3 text-white">
            {/* Close Button */}
            <div className="flex justify-end mb-2">
              <Button
                size="sm"
                variant="ghost"
                className="w-6 h-6 p-0 rounded-full text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStats(false);
                  setTimeout(() => {
                    setIsFlipped(false);
                  }, 150);
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>

            {/* Stats Content */}
            <div className="space-y-3 text-xs">
              <div>
                <h4 className="font-bold text-sm mb-1 text-blue-300">{book.title}</h4>
                {book.description && (
                  <p className="text-xs opacity-80 line-clamp-3">{book.description}</p>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-white/20">
                <div className="flex items-center gap-2">
                  <Image className="w-3 h-3 text-green-400" />
                  <span className="text-xs">{worldStats.assetCount} Assets</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag className="w-3 h-3 text-yellow-400" />
                  <span className="text-xs">{worldStats.tagCount} Tags</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-purple-400" />
                  <span className="text-xs">Created {formatDate(book.createdAt)}</span>
                </div>
              </div>

              {/* Select Button */}
              <div className="pt-2">
                <Button
                  size="sm"
                  className="w-full text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick?.();
                  }}
                >
                  Select This World
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Book Shadow */}
        <div 
          className="absolute -bottom-2 left-2 right-2 h-4 bg-black/20 rounded-full blur-md"
          style={{ transform: 'translateZ(-10px)' }}
        />
      </div>

      {/* Controls */}
      {showControls && isHovered && !isFlipped && (
        <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="secondary"
            className="w-6 h-6 p-0 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
          >
            <Edit className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="w-6 h-6 p-0 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-full animate-pulse" />
      )}
    </div>
  );
}
