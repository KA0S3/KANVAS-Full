import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useAssetStore } from '@/stores/assetStore';
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
import type { Asset } from '@/types/assetInterfaces';

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
  console.log('DeleteAssetDialog rendered with isOpen:', isOpen, 'asset:', asset?.name);
  const { toast } = useToast();
  const { deleteAsset, getAssetChildren } = useAssetStore();

  const confirmDelete = () => {
    if (!asset) return;

    const hasChildren = getAssetChildren(asset.id).length > 0;
    const deletedCount = hasChildren ? 1 + getAssetChildren(asset.id).length : 1;
    
    try {
      deleteAsset(asset.id);
      
      // Show success toast
      toast({
        title: "Asset deleted successfully",
        description: hasChildren 
          ? `Deleted "${asset.name}" and ${deletedCount - 1} contained asset(s)`
          : `Deleted "${asset.name}"`,
        variant: "default",
      });
      
      onClose();
    } catch (error) {
      // Show error toast if deletion fails
      toast({
        title: "Delete failed",
        description: `Failed to delete "${asset.name}". Please try again.`,
        variant: "destructive",
      });
    }
  };

  const cancelDelete = () => {
    onClose();
  };

  if (!asset) return null;

  const hasChildren = getAssetChildren(asset.id).length > 0;

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
                  Are you sure you want to delete <strong>"{asset.name}"</strong>?
                </div>
                <div className="text-destructive font-medium">
                  This will also delete all {getAssetChildren(asset.id).length} contained asset(s).
                </div>
                <div className="text-sm text-muted-foreground">
                  This action cannot be undone.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  Are you sure you want to delete <strong>"{asset.name}"</strong>?
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
