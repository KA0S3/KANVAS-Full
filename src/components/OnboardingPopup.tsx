import { useState, useEffect, useRef } from 'react';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useMediaStore } from '@/stores/mediaStore';
import { X } from 'lucide-react';
import { resolvePublicAssetUrl } from '@/utils/appUrls';

interface OnboardingPopupProps {
  anchorElement?: HTMLElement | null;
}

const OnboardingPopup: React.FC<OnboardingPopupProps> = ({ anchorElement }) => {
  const { getAllBooks } = useBookStore();
  const { appPhase } = useMediaStore();
  const kaosSmokeSrc = resolvePublicAssetUrl('kaos-smoke.png');
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef(Date.now());
  const hasShownRef = useRef(false);

  // Get book count
  const getBookCount = () => getAllBooks().length;

  // Check if any modal is open (excluding our own popup)
  const isModalOpen = () => {
    const modals = document.querySelectorAll('[role="dialog"], [data-state="open"]');
    return modals.length > 0;
  };

  // Reset inactivity timer on user activity
  const resetInactivityTimer = () => {
    lastActivityRef.current = Date.now();
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    // Set new timer to show popup after 3 seconds of inactivity
    inactivityTimerRef.current = setTimeout(() => {
      checkAndShowPopup();
    }, 3000);
  };

  // Check conditions and show popup if appropriate
  const checkAndShowPopup = () => {
    // Don't show if already shown once
    if (hasShownRef.current) return;
    
    // Don't show if any modal is open
    if (isModalOpen()) return;
    
    // Check if user has no books/projects
    const bookCount = getBookCount();
    if (bookCount > 0) return;
    
    // Check if user is on world library page
    if (appPhase !== 'LIBRARY' || !anchorElement) return;
    
    // Check if enough time has passed since last activity (3 seconds)
    const timeSinceActivity = Date.now() - lastActivityRef.current;
    if (timeSinceActivity < 3000) return;
    
    // Calculate position relative to anchor element
    const rect = anchorElement.getBoundingClientRect();
    const popupWidth = 240; // Current width of popup
    const popupHeight = 80; // Approximate height of popup
    
    // Position popup so bottom-left corner touches top-right corner of button
    const top = rect.top - popupHeight + 2; // Overlap by 2px to remove gap
    const left = rect.right - 2; // Overlap by 2px to remove gap
    
    setPosition({ top, left });
    setIsVisible(true);
    hasShownRef.current = true;
  };

  // Set up activity listeners - track any button click to reset timer
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      // Reset timer on any button click
      resetInactivityTimer();
    };

    document.addEventListener('click', handleClick, true);

    // Initial timer setup
    resetInactivityTimer();

    return () => {
      document.removeEventListener('click', handleClick, true);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [anchorElement, appPhase]);

  // Monitor for modal changes and hide popup if modal opens
  useEffect(() => {
    const checkModals = () => {
      if (isModalOpen() && isVisible) {
        setIsVisible(false);
      }
    };

    // Check immediately
    checkModals();

    // Set up observer to watch for DOM changes
    const observer = new MutationObserver(checkModals);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    return () => {
      observer.disconnect();
    };
  }, [isVisible]);

  // Hide popup when conditions change
  useEffect(() => {
    const bookCount = getBookCount();
    if (bookCount > 0 || appPhase !== 'LIBRARY') {
      setIsVisible(false);
    }
  }, [getBookCount, appPhase]);

  const closePopup = () => {
    setIsVisible(false);
  };

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-component-name="OnboardingPopup"]')) {
        closePopup();
      }
    };

    if (isVisible) {
      document.addEventListener('click', handleClickOutside, true);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed z-50 bg-purple-100 border-2 border-black rounded-2xl p-1 shadow-lg animate-fade-in"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: '240px',
        maxWidth: '90vw',
      }}
      data-component-name="OnboardingPopup"
    >
      {/* Close button */}
      <button
        onClick={closePopup}
        className="absolute top-1 right-1 p-1 hover:bg-purple-200 rounded-full transition-colors"
        aria-label="Close popup"
      >
        <X className="w-3 h-3 text-gray-600" />
      </button>
      
      <div className="flex items-center gap-3">
        {/* Text content */}
        <div className="flex-1 flex items-center justify-center p-2">
          <p className="text-sm font-medium text-gray-800 leading-tight text-center">
            Click here to create your first project!
          </p>
        </div>
        
        {/* Character image */}
        <div className="flex-shrink-0">
          <img
            src={kaosSmokeSrc}
            alt="Helper Character"
            className="w-16 h-16 object-contain"
          />
        </div>
      </div>
      
      {/* Small arrow pointing to button */}
      <div className="absolute -bottom-2 left-0 w-4 h-4 bg-purple-100 border-l-2 border-b-2 border-black transform rotate-45"></div>
    </div>
  );
};

export default OnboardingPopup;
