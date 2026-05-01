import { useState } from "react";
import { useThemeStore } from "@/stores/themeStore";
import { useBookStore } from "@/stores/bookStoreSimple";

const IndexDebug = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bookLibraryOpen, setBookLibraryOpen] = useState(true);
  
  // Test stores
  const { theme } = useThemeStore();
  const { getAllBooks } = useBookStore();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">KANVAS - Index Debug</h1>
          <p className="text-xl">Index component is working!</p>
          <p className="text-sm mt-4">Book Library Open: {bookLibraryOpen ? 'Yes' : 'No'}</p>
          <p className="text-sm mt-2">Theme: {theme}</p>
          <p className="text-sm mt-2">Books count: {getAllBooks().length}</p>
          <button 
            onClick={() => setBookLibraryOpen(!bookLibraryOpen)}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
          >
            Toggle Book Library
          </button>
        </div>
      </div>
    </div>
  );
};

export default IndexDebug;
