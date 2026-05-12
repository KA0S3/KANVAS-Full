import { useState } from 'react';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useTagStore } from '@/stores/tagStore';
import { useAssetStore } from '@/stores/assetStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TagFilterControlsProps {
  className?: string;
  showActiveFilters?: boolean;
  compact?: boolean;
}

export function TagFilterControls({ 
  className, 
  showActiveFilters = true, 
  compact = false 
}: TagFilterControlsProps) {
  const { tags, getAllTags } = useTagStore();
  const { getAllAssets } = useAssetStore();
  const assets = getAllAssets();
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Filter functions
  const toggleFilter = (tagId: string) => {
    setActiveFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(tagId)) {
        newFilters.delete(tagId);
      } else {
        newFilters.add(tagId);
      }
      return newFilters;
    });
  };

  const clearFilters = () => {
    setActiveFilters(new Set());
  };

  const setFilters = (filters: Set<string>) => {
    setActiveFilters(new Set(filters));
  };
  
  // Helper function to convert color to rgba format for opacity support
  const getColorWithOpacity = (color: string, opacity: number): string => {
    if (color.startsWith('#')) {
      // Convert hex to rgba
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    } else if (color.startsWith('hsl')) {
      // Convert hsl to hsla
      return color.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`);
    } else if (color.startsWith('rgba')) {
      // Update existing rgba opacity
      return color.replace(/[\d.]+\)$/, `${opacity})`);
    } else if (color.startsWith('hsla')) {
      // Update existing hsla opacity
      return color.replace(/[\d.]+\)$/, `${opacity})`);
    }
    // Fallback to the original color
    return color;
  };
  
  const allTags = Object.values(tags);
  
  // Sort tags by usage count
  const sortedTags = allTags
    .map(tag => ({
      ...tag,
      usageCount: Object.values(assets).filter(asset => asset.metadata?.tags?.includes(tag.id)).length
    }))
    .sort((a, b) => b.usageCount - a.usageCount);
  
  const displayedTags = showAll ? sortedTags : sortedTags.slice(0, compact ? 5 : 10);
  
  const handleToggleFilter = (tagId: string) => {
    const tag = tags[tagId];
    const isActive = activeFilters.has(tagId);
    
    toggleFilter(tagId);
    
    if (isActive) {
      toast.success(`Removed "${tag.name}" filter`);
    } else {
      toast.success(`Added "${tag.name}" filter`);
    }
  };
  
  const handleClearAll = () => {
    clearFilters();
    toast.success('All tag filters cleared');
  };
  
  const handleSelectAll = () => {
    const allTagIds = new Set(allTags.map(tag => tag.id));
    setFilters(allTagIds);
    toast.success(`Applied all ${allTagIds.size} tag filters`);
  };
  
  const getFilterDescription = () => {
    if (activeFilters.size === 0) return 'No filters';
    if (activeFilters.size === 1) {
      const tagId = Array.from(activeFilters)[0];
      const tag = tags[tagId];
      return tag ? `Filter: ${tag.name}` : '1 filter';
    }
    return `${activeFilters.size} filters`;
  };
  
  return (
    <div className={cn('space-y-2', className)}>
      {/* Filter button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size={compact ? "sm" : "default"}
            className={cn(
              'justify-start gap-2 bg-glass/30 border-glass-border/40 hover:bg-glass/50',
              activeFilters.size > 0 && 'bg-accent/20 text-accent-foreground border-accent/30',
              compact && 'h-7 px-2 text-xs'
            )}
          >
            <Filter className={cn('w-4 h-4', compact && 'w-3 h-3')} />
            <span className="truncate">
              {compact ? getFilterDescription() : 'Filter by Tags'}
            </span>
            {!compact && activeFilters.size > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {activeFilters.size}
              </Badge>
            )}
            <ChevronDown className={cn('w-4 h-4', compact && 'w-3 h-3')} />
          </Button>
        </PopoverTrigger>
        
        <PopoverContent 
          className="w-80 p-0 glass cosmic-glow border-glass-border/40" 
          align="start"
          side="bottom"
        >
          <div className="p-3 border-b border-glass-border/20">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm">Tag Filters</h3>
              <div className="flex gap-1">
                {allTags.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={handleSelectAll}
                  >
                    All
                  </Button>
                )}
                {activeFilters.size > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={handleClearAll}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            
            {activeFilters.size > 0 && (
              <div className="flex flex-wrap gap-1">
                {Array.from(activeFilters).map(filterId => {
                  const tag = tags[filterId];
                  if (!tag) return null;
                  return (
                    <Badge
                      key={filterId}
                      variant="secondary"
                      className="gap-1 pr-1"
                      style={{ backgroundColor: getColorWithOpacity(tag.color, 0.19), color: tag.color }}
                    >
                      {tag.name}
                      <button
                        className="p-0.5 hover:bg-black/10 rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFilter(filterId);
                        }}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {allTags.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tags available</p>
                <p className="text-xs">Create tags first to enable filtering</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {displayedTags.map((tag) => {
                  const isActive = activeFilters.has(tag.id);
                  
                  return (
                    <div
                      key={tag.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-accent/20 cursor-pointer"
                      onClick={() => handleToggleFilter(tag.id)}
                    >
                      <Checkbox
                        checked={isActive}
                        className="pointer-events-none"
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-border flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1 text-sm truncate">{tag.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {tag.usageCount}
                      </span>
                    </div>
                  );
                })}
                
                {!showAll && sortedTags.length > displayedTags.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center text-xs"
                    onClick={() => setShowAll(true)}
                  >
                    Show {sortedTags.length - displayedTags.length} more...
                  </Button>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      
      {/* Active filters display */}
      {showActiveFilters && activeFilters.size > 0 && !compact && (
        <div className="flex flex-wrap gap-1">
          {Array.from(activeFilters).map(filterId => {
            const tag = tags[filterId];
            if (!tag) return null;
            return (
              <Badge
                key={filterId}
                variant="secondary"
                className="gap-1 pr-1 text-xs"
                style={{ backgroundColor: getColorWithOpacity(tag.color, 0.19), color: tag.color }}
              >
                {tag.name}
                <button
                  className="p-0.5 hover:bg-black/10 rounded"
                  onClick={() => toggleFilter(filterId)}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
