import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Tag, Plus, Settings, Palette } from 'lucide-react';
import { useTagStore } from '@/stores/tagStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DeleteTagDialog } from '@/components/DeleteTagDialog';
import { SketchPicker } from 'react-color';

export function GlobalTagManager() {
  const { tags, createTag, deleteTag, updateTag } = useTagStore();
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(`hsl(${Math.random() * 360}, 70%, 50%)`);
  const [newTagScope, setNewTagScope] = useState<'project' | 'global'>('project');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingTagColor, setEditingTagColor] = useState('');
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<{ id: string; name: string; color: string } | null>(null);

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    
    try {
      createTag({
        name: newTagName.trim(),
        color: newTagColor,
        scope: newTagScope,
      });
      
      setNewTagName('');
      setNewTagColor(`hsl(${Math.random() * 360}, 70%, 50%)`);
      toast.success('Tag created successfully');
    } catch (error) {
      toast.error('Failed to create tag');
    }
  };

  const handleDeleteTag = (tagId: string, tagName: string, tagColor: string) => {
    setTagToDelete({ id: tagId, name: tagName, color: tagColor });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteTag = () => {
    if (tagToDelete) {
      deleteTag(tagToDelete.id);
      toast.success('Tag deleted successfully');
      setDeleteDialogOpen(false);
      setTagToDelete(null);
    }
  };

  const cancelDeleteTag = () => {
    setDeleteDialogOpen(false);
    setTagToDelete(null);
  };

  const handleStartEdit = (tagId: string, tagName: string, tagColor: string) => {
    setEditingTagId(tagId);
    setEditingTagName(tagName);
    setEditingTagColor(tagColor);
  };

  const handleSaveEdit = () => {
    if (!editingTagId || !editingTagName.trim()) return;
    
    try {
      updateTag(editingTagId, { 
        name: editingTagName.trim(),
        color: editingTagColor 
      });
      setEditingTagId(null);
      setEditingTagName('');
      setEditingTagColor('');
      toast.success('Tag updated successfully');
    } catch (error) {
      toast.error('Failed to update tag');
    }
  };

  const handleCancelEdit = () => {
    setEditingTagId(null);
    setEditingTagName('');
    setEditingTagColor('');
  };

  const predefinedColors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#64748b', '#000000'
  ];


  const ColorPicker = ({ currentColor, onColorChange, onClose }: {
    currentColor: string;
    onColorChange: (color: string) => void;
    onClose: () => void;
  }) => {
    return (
      <div className="absolute top-full right-0 mt-1 z-50 bg-background border border-border rounded-md shadow-lg p-3 w-80">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">Color Picker</div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Close color picker"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <SketchPicker 
                color={currentColor} 
                onChange={(color) => onColorChange(color.hex)}
                disableAlpha={true}
                presetColors={[]}
              />
              <Input
                value={currentColor}
                onChange={(e) => onColorChange(e.target.value)}
                className="h-6 text-xs mt-2"
                placeholder="#000000"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Quick Colors</div>
              <div className="grid grid-cols-3 gap-1">
                {predefinedColors.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      "w-6 h-6 rounded border-2 transition-all hover:scale-110",
                      currentColor === color ? 'border-primary' : 'border-border'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      onColorChange(color);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const tagList = Object.values(tags);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          title="Manage Tags"
        >
          <Tag className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl min-h-[500px] w-full glass cosmic-glow border-glass-border/40 flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Tag Manager
            <span className="text-sm text-muted-foreground font-normal">
              ({tagList.length} tags)
            </span>
          </DialogTitle>
          {/* Create new tag */}
          <div className="flex gap-2 mt-3">
            <Input
              placeholder="New tag name..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="flex-1 h-9 bg-glass/50 border-glass-border/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateTag();
                }
              }}
            />
            <Select value={newTagScope} onValueChange={(value: 'project' | 'global') => setNewTagScope(value)}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="global">Global</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowColorPicker('new')}
                className="h-9 w-9 p-0"
              >
                <div 
                  className="w-4 h-4 rounded-full border border-border" 
                  style={{ backgroundColor: newTagColor }}
                />
              </Button>
              {showColorPicker === 'new' && (
                <ColorPicker
                  currentColor={newTagColor}
                  onColorChange={setNewTagColor}
                  onClose={() => setShowColorPicker(null)}
                />
              )}
            </div>
            <Button
              size="sm"
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              className="h-9 px-3"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {/* Tag list */}
        <div className="max-h-96 overflow-y-auto flex-grow mt-4">
          <div>
            {tagList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-base mb-1">No tags yet</p>
                <p className="text-sm">Create your first tag to get started</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {tagList.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/20 group border border-transparent hover:border-glass-border/30 transition-all"
                  >
                    <div
                      className="w-4 h-4 rounded-full border border-border flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {tag.scope}
                    </Badge>
                    
                    {editingTagId === tag.id ? (
                      <div className="flex-1 space-y-3">
                        <div className="flex gap-2">
                          <Input
                            value={editingTagName}
                            onChange={(e) => setEditingTagName(e.target.value)}
                            className="flex-1 h-8 bg-glass/50 border-glass-border/40"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveEdit();
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            autoFocus
                          />
                          <div className="relative">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowColorPicker(tag.id)}
                              className="h-8 w-8 p-0"
                            >
                              <div 
                                className="w-3 h-3 rounded-full border border-border" 
                                style={{ backgroundColor: editingTagColor }}
                              />
                            </Button>
                            {showColorPicker === tag.id && (
                              <ColorPicker
                                currentColor={editingTagColor}
                                onColorChange={setEditingTagColor}
                                onClose={() => setShowColorPicker(null)}
                              />
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            className="h-8 px-3"
                          >
                            ✓ Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                            className="h-8 px-3"
                          >
                            ✕ Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-base font-medium">{tag.name}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStartEdit(tag.id, tag.name, tag.color)}
                            className="h-8 w-8 p-0"
                            title="Edit tag"
                          >
                            ✏️
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTag(tag.id, tag.name, tag.color)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title="Delete tag"
                          >
                            🗑️
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
      
      <DeleteTagDialog
        tagName={tagToDelete?.name || ''}
        tagColor={tagToDelete?.color || ''}
        isOpen={deleteDialogOpen}
        onClose={cancelDeleteTag}
        onConfirm={confirmDeleteTag}
      />
    </Dialog>
  );
}
