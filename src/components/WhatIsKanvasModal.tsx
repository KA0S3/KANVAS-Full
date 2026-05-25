import { X } from 'lucide-react';
import { openHashRouteUrl } from '@/utils/appUrls';

interface WhatIsKanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WhatIsKanvasModal = ({ isOpen, onClose }: WhatIsKanvasModalProps) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleLinkClick = (e: React.MouseEvent, href: string) => {
    e.stopPropagation();
    openHashRouteUrl(href);
  };

  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      {/* Modal Content */}
      <div 
        className="relative w-full max-w-2xl bg-gray-900/95 border border-gray-700 rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 
            className="text-2xl font-bold text-white"
            style={{
              fontFamily: '"MedievalSharp", "Almendra", cursive',
              textShadow: '0 0 20px rgba(255, 255, 255, 0.5)'
            }}
          >
            What is KANVAS?
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Visual Diagram */}
          <div className="flex flex-col items-center space-y-4">
            <div className="text-center">
              <div className="inline-block px-4 py-2 bg-blue-600/30 border border-blue-500/50 rounded-lg mb-3">
                <span className="text-blue-300 font-semibold">Project</span>
              </div>
            </div>
            
            <div className="w-px h-6 bg-gray-600"></div>
            
            <div className="flex gap-4 items-center">
              <div className="text-center">
                <div className="inline-block px-4 py-2 bg-purple-600/30 border border-purple-500/50 rounded-lg">
                  <span className="text-purple-300 font-semibold">Viewport</span>
                </div>
              </div>
              
              <div className="text-gray-400 text-sm">→</div>
              
              <div className="text-center">
                <div className="inline-block px-4 py-2 bg-purple-600/30 border border-purple-500/50 rounded-lg">
                  <span className="text-purple-300 font-semibold">More Viewports</span>
                </div>
              </div>
            </div>
            
            <div className="w-px h-6 bg-gray-600"></div>
            
            <div className="flex gap-2 items-center">
              <div className="text-center">
                <div className="inline-block px-3 py-1 bg-green-600/30 border border-green-500/50 rounded">
                  <span className="text-green-300 text-sm">Asset</span>
                </div>
              </div>
              <div className="text-center">
                <div className="inline-block px-3 py-1 bg-green-600/30 border border-green-500/50 rounded">
                  <span className="text-green-300 text-sm">Asset</span>
                </div>
              </div>
              <div className="text-center">
                <div className="inline-block px-3 py-1 bg-green-600/30 border border-green-500/50 rounded">
                  <span className="text-green-300 text-sm">Asset</span>
                </div>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="text-center space-y-3">
            <p className="text-gray-200 text-lg leading-relaxed">
              KANVAS helps you organize large amounts of information visually.
            </p>
            <p className="text-gray-300 leading-relaxed">
              <span className="text-blue-300 font-semibold">Projects</span> hold workspaces; 
              <span className="text-purple-300 font-semibold"> Viewports</span> organize information; 
              <span className="text-green-300 font-semibold"> Assets</span> are items inside viewports that each become their own viewport.
            </p>
          </div>
        </div>

        {/* Footer with Policy Links */}
        <div className="p-6 border-t border-gray-700 space-y-4">
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={(e) => handleLinkClick(e, '/terms-of-service')}
              className="text-sm text-gray-400 hover:text-white transition-colors underline"
            >
              Terms & Conditions
            </button>
            <button
              onClick={(e) => handleLinkClick(e, '/privacy-policy')}
              className="text-sm text-gray-400 hover:text-white transition-colors underline"
            >
              Privacy Policy
            </button>
            <button
              onClick={(e) => handleLinkClick(e, '/refund-policy')}
              className="text-sm text-gray-400 hover:text-white transition-colors underline"
            >
              Refund Policy
            </button>
            <button
              onClick={(e) => handleLinkClick(e, '/plans')}
              className="text-sm text-gray-400 hover:text-white transition-colors underline"
            >
              Plans
            </button>
          </div>
          
          <div className="flex justify-center">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatIsKanvasModal;
