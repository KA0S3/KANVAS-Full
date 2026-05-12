import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useKanvasStore, selectAssetsByParentId } from '@/stores/kanvasStore';
import { useToast } from '@/hooks/use-toast';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Asset } from '@/types/Asset';

interface DeleteAssetDialogProps {
  asset: Asset | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteAssetDialog: React.FC<DeleteAssetDialogProps> = ({
  asset,
  isOpen,
  onClose,
}) => {
  console.log('DeleteAssetDialog rendered with isOpen:', isOpen, 'asset:', asset?.content.title);
  const { toast } = useToast();
  const { deleteAsset } = useKanvasStore();

  const confirmDelete = () => {
    if (!asset) return;

    const children = selectAssetsByParentId(asset.id)(useKanvasStore.getState());
    const hasChildren = children.length > 0;
    const deletedCount = hasChildren ? 1 + children.length : 1;
    
    try {
      deleteAsset(asset.id);
      
      // Show success toast
      toast({
        title: "Asset deleted successfully",
        description: hasChildren 
          ? `Deleted "${asset.content.title}" and ${deletedCount - 1} contained asset(s)`
          : `Deleted "${asset.content.title}"`,
        variant: "default",
      });
      
      onClose();
    } catch (error) {
      // Show error toast if deletion fails
      toast({
        title: "Delete failed",
        description: `Failed to delete "${asset.content.title}". Please try again.`,
        variant: "destructive",
      });
    }
  };

  const cancelDelete = () => {
    onClose();
  };

  if (!asset) return null;

  const children = selectAssetsByParentId(asset.id)(useKanvasStore.getState());
  const hasChildren = children.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md z-[10000]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Asset
          </DialogTitle>
          <DialogDescription className="text-left">
            {hasChildren ? (
              <div className="space-y-2">
                <div>
                  Are you sure you want to delete <strong>"{asset.content.title}"</strong>?
                </div>
                <div className="text-destructive font-medium">
                  This will also delete all {children.length} contained asset(s).
                </div>
                <div className="text-sm text-muted-foreground">
                  This action cannot be undone.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  Are you sure you want to delete <strong>"{asset.content.title}"</strong>?
                </div>
                <div className="text-sm text-muted-foreground">
                  This action cannot be undone.
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={cancelDelete}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
