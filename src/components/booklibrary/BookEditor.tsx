import { useEffect, useRef, useState } from 'react';
import { X, Upload, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBookStore } from '@/stores/bookStoreSimple';
import type { Book } from '@/types/book';
import { loadBookCover, removeBookCover, saveBookCover } from '@/utils/bookCoverStorage';
import { cssUrl } from '@/utils/cssUrl';

const DEFAULT_FORM_DATA = {
  title: '',
  description: '',
  color: '#3b82f6',
  gradient: '',
  coverImage: '',
};

interface BookEditorProps {
  isOpen: boolean;
  onClose: () => void;
  book?: Book | null;
}

export function BookEditor({ isOpen, onClose, book }: BookEditorProps) {
  const { createBook, updateBook, leatherPresets } = useBookStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);

  const [selectedPreset, setSelectedPreset] = useState(
    book ? leatherPresets.find(p => p.color === (book.leatherColor || book.color)) : leatherPresets[0]
  );

  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrateForm = async () => {
      if (!isOpen) {
        return;
      }

      if (!book) {
        setFormData(DEFAULT_FORM_DATA);
        setSelectedPreset(leatherPresets[0]);
        setPendingCoverFile(null);
        setCoverRemoved(false);
        return;
      }

      const resolvedCoverImage = book.hasLocalCoverImage || book.coverImageStorageKey
        ? await loadBookCover(book.coverImageStorageKey || book.id)
        : book.coverImage || '';

      if (cancelled) {
        return;
      }

      setFormData({
        title: book.title || '',
        description: book.description || '',
        color: book.leatherColor || book.color || leatherPresets[0]?.color || '#8b4513',
        gradient: '',
        coverImage: resolvedCoverImage || book.coverImage || '',
      });
      setSelectedPreset(
        leatherPresets.find(p => p.color === (book.leatherColor || book.color)) || leatherPresets[0]
      );
      setPendingCoverFile(null);
      setCoverRemoved(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    hydrateForm();

    return () => {
      cancelled = true;
    };
  }, [book, leatherPresets, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const bookData: Record<string, unknown> = {
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      color: selectedPreset?.color || formData.color,
      gradient: undefined,
      leatherColor: selectedPreset?.color || formData.color,
      isLeatherMode: true,
      coverPresetId: selectedPreset?.id,
      worldData: book?.worldData,
    };

    if (book) {
      if (pendingCoverFile) {
        const { storageKey } = await saveBookCover(book.id, pendingCoverFile);
        bookData.coverImage = undefined;
        bookData.coverImageStorageKey = storageKey;
        bookData.hasLocalCoverImage = true;
      } else if (coverRemoved) {
        await removeBookCover(book.coverImageStorageKey || book.id);
        bookData.coverImage = undefined;
        bookData.coverImageStorageKey = undefined;
        bookData.hasLocalCoverImage = false;
      }

      updateBook(book.id, bookData);
    } else {
      const newBookId = await createBook(bookData);
      if (pendingCoverFile) {
        const { storageKey } = await saveBookCover(newBookId, pendingCoverFile);
        updateBook(newBookId, {
          coverImage: undefined,
          coverImageStorageKey: storageKey,
          hasLocalCoverImage: true,
        });
      }
    }

    onClose();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploadingCover(true);
      try {
        const previewUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve((event.target?.result as string) || '');
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(file);
        });

        setPendingCoverFile(file);
        setCoverRemoved(false);
        setFormData(prev => ({ ...prev, coverImage: previewUrl }));
      } catch (error) {
        console.error('Failed to load cover image locally:', error);
      } finally {
        setIsUploadingCover(false);
      }
    }
  };

  const handlePresetSelect = (preset: typeof leatherPresets[0]) => {
    setSelectedPreset(preset);
    setFormData(prev => ({
      ...prev,
      color: preset.color,
      gradient: '',
      coverImage: '',
    }));
    setPendingCoverFile(null);
    setCoverRemoved(!!book?.hasLocalCoverImage || !!book?.coverImageStorageKey || !!book?.coverImage);
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, coverImage: '' }));
    setPendingCoverFile(null);
    setCoverRemoved(!!book?.hasLocalCoverImage || !!book?.coverImageStorageKey || !!book?.coverImage);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl glass cosmic-glow border-glass-border/40">
          <DialogHeader>
            <DialogTitle>
              {book ? 'Edit Book' : 'Create New Book'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Book Preview */}
            <div className="flex justify-center">
              <div className="relative">
                <div
                  className="w-24 h-36 rounded-sm shadow-xl flex items-center justify-center text-white font-bold text-center p-2"
                  style={{
                    background: formData.coverImage 
                      ? `${cssUrl(formData.coverImage)} center/cover`
                      : formData.gradient || formData.color,
                  }}
                >
                  {!formData.coverImage && (
                    <span className="text-xs line-clamp-3">
                      {formData.title || 'New Book'}
                    </span>
                  )}
                </div>
                {formData.coverImage && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute -top-2 -right-2 w-6 h-6 p-0 rounded-full"
                    onClick={handleRemoveImage}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>

            {/* Text Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                <Label>Text Settings</Label>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter book title..."
                  required
                  className="bg-glass/50 border-glass-border/40"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter book description..."
                  rows={3}
                  className="bg-glass/50 border-glass-border/40"
                />
              </div>
            </div>

            {/* Cover Aesthetics */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                <Label>Cover Aesthetics</Label>
              </div>

              {/* Preset Colors */}
              <div className="space-y-2">
                <Label className="text-sm">Leather bound presets:</Label>
                <div className="grid grid-cols-3 gap-2">
                  {leatherPresets.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      variant={selectedPreset?.id === preset.id ? "default" : "outline"}
                      className="h-12 p-0"
                      style={{
                        background: `linear-gradient(135deg, ${preset.lightVariant}, ${preset.darkVariant})`,
                      }}
                      onClick={() => handlePresetSelect(preset)}
                    >
                      <span className="text-white text-xs drop-shadow">
                        {preset.name}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Custom Image Upload */}
              <div className="space-y-2">
                <Label className="text-sm">Or add custom cover image:</Label>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="cover-upload"
                  />
                  <Label htmlFor="cover-upload" className="flex-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Image
                    </Button>
                  </Label>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1">
                {book ? 'Update Book' : 'Create Book'}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
}
