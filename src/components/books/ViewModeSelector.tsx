import React from 'react';
import { Book, Layout, Edit } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';

interface ViewModeSelectorProps {
  currentMode: 'single' | 'spine';
  onModeChange: (mode: 'single' | 'spine') => void;
  bookCount?: number;
  className?: string;
  onEditBook?: () => void;
  enableEditing?: boolean;
  showEditButton?: boolean; // New prop to control Edit button visibility
}

const ViewModeSelector: React.FC<ViewModeSelectorProps> = ({
  currentMode,
  onModeChange,
  bookCount = 0,
  className = '',
  onEditBook,
  enableEditing = false,
  showEditButton = true
}) => {
  const { theme } = useThemeStore();
  const modes = [
    {
      id: 'single' as const,
      name: 'Single',
      icon: Book,
      description: 'Focus on one book at a time',
      disabled: bookCount === 0
    },
    {
      id: 'spine' as const,
      name: 'Shelf',
      icon: Layout,
      description: 'Books on a shelf',
      disabled: bookCount === 0
    }
  ];

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className={`flex rounded-md p-0.5 ${
        theme === 'dark' ? 'bg-gray-700/50' : 'bg-muted/50'
      }`}>
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isActive = currentMode === mode.id;
          
          return (
            <button
              key={mode.id}
              id={mode.id === 'spine' ? 'view-mode-selector' : undefined}
              onClick={() => !mode.disabled && onModeChange(mode.id)}
              disabled={mode.disabled}
              className={`
                relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm
                transition-all duration-200 ease-in-out
                ${isActive 
                  ? (theme === 'dark' ? 'bg-blue-600 text-white shadow-lg' : 'bg-primary text-primary-foreground shadow-lg')
                  : (theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-muted-foreground hover:text-foreground hover:bg-accent')
                }
                ${mode.disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'cursor-pointer'
                }
              `}
              title={mode.description}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs font-medium">
                {mode.name}
              </span>
              
              {isActive && (
                <div className={`absolute inset-0 rounded-md opacity-20 animate-pulse ${
                  theme === 'dark' ? 'bg-blue-500' : 'bg-primary'
                }`}></div>
              )}
            </button>
          );
        })}
      </div>
      
      {/* Edit Button - replaces description text */}
      {enableEditing && showEditButton && (
        <button
          onClick={onEditBook}
          className={`flex items-center gap-2 px-3 py-2 rounded-full transition-colors ${
            theme === 'dark' 
              ? 'bg-blue-600 hover:bg-blue-700' 
              : 'bg-primary hover:bg-primary/90'
          }`}
          title="Edit book"
        >
          <Edit className={`w-3.5 h-3.5 ${
            theme === 'dark' ? 'text-white' : 'text-primary-foreground'
          }`} />
          <span className={`text-xs font-medium ${
            theme === 'dark' ? 'text-white' : 'text-primary-foreground'
          }`}>Edit</span>
        </button>
      )}
    </div>
  );
};

export default ViewModeSelector;
