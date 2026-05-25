export interface BookLimitResult {
  canCreate: boolean;
  reason?: string;
  upgradePrompt?: {
    title: string;
    message: string;
    action: string;
  };
}

export function canCreateBook(): BookLimitResult {
  return { canCreate: true };
}

export function useCanCreateBook(): BookLimitResult {
  return { canCreate: true };
}
