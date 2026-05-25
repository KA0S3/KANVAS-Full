import React, { useState, useRef, useEffect } from 'react';
import type { Book } from '@/types/book';
import LeatherColorPicker from './LeatherColorPicker';
import { removeBookCover, saveBookCover } from '@/utils/bookCoverStorage';
import { useResolvedBookCover } from '@/hooks/useResolvedBookCover';
import { cssUrl } from '@/utils/cssUrl';

interface BookCoverSettings {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface EditableBookProps {
  book: Book;
  onUpdate?: (updatedBook: Book) => void;
  onViewWorld?: (book: Book) => void;
  className?: string;
}

const EditableBook: React.FC<EditableBookProps> = ({ 
  book, 
  onUpdate,
  onViewWorld,
  className = ''
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(book.title);
  const [coverSettings, setCoverSettings] = useState<BookCoverSettings>({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  });
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [localCoverPreview, setLocalCoverPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolvedCoverImage = useResolvedBookCover(book, localCoverPreview);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(`book-cover-${book.id}`);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setCoverSettings(parsed);
      } catch (error) {
        console.error('Failed to load cover settings:', error);
      }
    }
  }, [book.id]);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem(`book-cover-${book.id}`, JSON.stringify(coverSettings));
  }, [coverSettings, book.id]);

  useEffect(() => {
    setLocalCoverPreview(null);
  }, [book.id, book.coverImage, book.coverImageStorageKey, book.hasLocalCoverImage]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsUploadingCover(true);
      try {
        const imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || '');
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(file);
        });
        setLocalCoverPreview(imageUrl);
        const { storageKey } = await saveBookCover(book.id, file);
        const updatedBook = {
          ...book,
          coverImage: undefined,
          coverImageStorageKey: storageKey,
          hasLocalCoverImage: true,
          updatedAt: Date.now()
        };
        onUpdate?.(updatedBook);
      } catch (error) {
        console.error('Failed to save cover image locally:', error);
        setLocalCoverPreview(null);
      } finally {
        setIsUploadingCover(false);
      }
    }
  };

  const handleTitleUpdate = () => {
    if (title !== book.title) {
      const updatedBook = {
        ...book,
        title,
        updatedAt: Date.now()
      };
      onUpdate?.(updatedBook);
    }
  };

  const handleBookClick = (event: React.MouseEvent) => {
    if (event.detail === 2) { // Double click
      onViewWorld?.(book);
    } else {
      setIsEditing(!isEditing);
    }
  };

  const handleColorSelect = (preset: any) => {
    const updatedBook = {
      ...book,
      leatherColor: preset.color,
      isLeatherMode: true,
      coverImage: undefined,
      coverImageStorageKey: undefined,
      hasLocalCoverImage: false,
      updatedAt: Date.now()
    };
    onUpdate?.(updatedBook);
    setShowColorPicker(false);
  };

  const removeCoverImage = async () => {
    setLocalCoverPreview(null);
    await removeBookCover(book.coverImageStorageKey || book.id);
    const updatedBook = {
      ...book,
      coverImage: undefined,
      coverImageStorageKey: undefined,
      hasLocalCoverImage: false,
      updatedAt: Date.now()
    };
    onUpdate?.(updatedBook);
  };

  const getCoverStyle = () => {
    if (resolvedCoverImage) {
      return {
        backgroundImage: cssUrl(resolvedCoverImage),
        backgroundSize: `${coverSettings.scale * 100}%`,
        backgroundPosition: `${50 + coverSettings.offsetX}% ${50 + coverSettings.offsetY}%`,
        backgroundRepeat: 'no-repeat'
      };
    }

    if (book.isLeatherMode && book.leatherColor) {
      return {
        background: `linear-gradient(135deg, ${book.leatherColor}dd, ${book.leatherColor}99)`,
        border: `1px solid ${book.leatherColor}`,
        boxShadow: `inset 0 1px 0 ${book.leatherColor}44, 0 4px 8px rgba(0,0,0,0.3)`
      };
    }

    return {
      background: book.color || '#3b82f6'
    };
  };

  const renderEditingPanel = () => (
    <div className="absolute top-full left-0 right-0 mt-2 p-4 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
      <div className="space-y-4">
        {/* Title Editing */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Book Title
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleUpdate}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter book title"
            />
            <button
              onClick={handleTitleUpdate}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>

        {/* Cover Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Cover Image
          </label>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Upload Image
            </button>
            {resolvedCoverImage && (
            <button
              onClick={removeCoverImage}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
                Remove Image
              </button>
            )}
          </div>
        </div>

        {/* Image Controls (only show when image is present) */}
        {resolvedCoverImage && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Scale: {coverSettings.scale.toFixed(2)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={coverSettings.scale}
                onChange={(e) => setCoverSettings(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Horizontal Position: {coverSettings.offsetX.toFixed(0)}%
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={coverSettings.offsetX}
                onChange={(e) => setCoverSettings(prev => ({ ...prev, offsetX: parseFloat(e.target.value) }))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Vertical Position: {coverSettings.offsetY.toFixed(0)}%
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={coverSettings.offsetY}
                onChange={(e) => setCoverSettings(prev => ({ ...prev, offsetY: parseFloat(e.target.value) }))}
                className="w-full"
              />
            </div>
          </div>
        )}

        {/* Leather Color Selection */}
        <div>
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors text-left"
          >
            {showColorPicker ? 'Hide' : 'Show'} Leather Color Options
          </button>
          {showColorPicker && (
            <div className="mt-3">
              <LeatherColorPicker
                selectedColor={book.leatherColor}
                onColorSelect={handleColorSelect}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      {/* Book Container with 3D effect */}
      <div 
        className={`
          relative w-48 h-72 rounded-lg cursor-pointer transition-all duration-300 group
          hover:scale-105 hover:shadow-2xl
          ${isEditing ? 'ring-2 ring-blue-500' : ''}
        `}
        style={{
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          transform: 'perspective(1000px) rotateY(0deg)',
          transformStyle: 'preserve-3d',
          ...getCoverStyle()
        }}
        onClick={handleBookClick}
      >
        {/* Book Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
          {!resolvedCoverImage && (
            <>
              <div className="font-bold text-white text-lg mb-2 drop-shadow-lg">
                {title}
              </div>
              {book.description && (
                <div className="text-xs text-white/80 line-clamp-3 drop-shadow">
                  {book.description}
                </div>
              )}
            </>
          )}
        </div>

        {/* Book Spine Effect */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-4 bg-black/20"
          style={{
            transform: 'rotateY(-90deg) translateZ(-2px)',
            transformOrigin: 'left center'
          }}
        />

        {/* Edit Indicator */}
        {isEditing && (
          <div className="absolute top-2 right-2 w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
        )}

        {/* Hover Instructions */}
        {!isEditing && (
          <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-xs p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="text-center">
              <div>Click to edit • Double-click to open world</div>
            </div>
          </div>
        )}
      </div>

      {/* Editing Panel */}
      {isEditing && renderEditingPanel()}
    </div>
  );
};

export default EditableBook;
