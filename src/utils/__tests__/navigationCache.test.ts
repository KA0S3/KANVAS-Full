import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { navigationCache, type NavigationState } from '../navigationCache';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: vi.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
    get length() {
      return Object.keys(store).length;
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
});

describe('navigationCache', () => {
  beforeEach(() => {
    // Clear localStorage mock before each test
    localStorageMock.clear();
    vi.clearAllMocks();
    // Clear cache before each test
    navigationCache.clearState();
  });

  afterEach(() => {
    // Clean up after each test
    navigationCache.clearState();
  });

  it('should save and retrieve navigation state', () => {
    const testState: NavigationState = {
      appPhase: 'BOOK_VIEW',
      currentBookId: 'test-book-id',
      currentViewportId: 'test-viewport-id',
      currentActiveId: 'test-active-id',
      bookLibraryOpen: false,
      sidebarOpen: true,
      isEditingBackground: false,
      viewportAsset: {
        id: 'test-viewport-id',
        x: 100,
        y: 200,
        width: 300,
        height: 400,
        viewportConfig: {
          zoom: 1.5,
          panX: 50,
          panY: 25,
        },
      },
    };

    navigationCache.saveState(testState);
    const retrievedState = navigationCache.getState();

    expect(retrievedState).toEqual(testState);
  });

  it('should return null for non-existent state', () => {
    const state = navigationCache.getState();
    expect(state).toBeNull();
  });

  it('should clear state', () => {
    const testState: NavigationState = {
      appPhase: 'LIBRARY',
      currentBookId: 'test-book-id',
      currentViewportId: null,
      currentActiveId: null,
      bookLibraryOpen: true,
      sidebarOpen: false,
      isEditingBackground: false,
    };

    navigationCache.saveState(testState);
    expect(navigationCache.getState()).toEqual(testState);

    navigationCache.clearState();
    expect(navigationCache.getState()).toBeNull();
  });

  it('should correctly identify valid state', () => {
    expect(navigationCache.hasValidState()).toBe(false);

    const testState: NavigationState = {
      appPhase: 'LIBRARY',
      currentBookId: 'test-book-id',
      currentViewportId: null,
      currentActiveId: null,
      bookLibraryOpen: true,
      sidebarOpen: false,
      isEditingBackground: false,
    };

    navigationCache.saveState(testState);
    expect(navigationCache.hasValidState()).toBe(true);
  });

  it('should handle errors gracefully', () => {
    // Test that methods don't throw errors
    expect(() => {
      navigationCache.saveState({
        appPhase: 'LIBRARY',
        currentBookId: null,
        currentViewportId: null,
        currentActiveId: null,
        bookLibraryOpen: true,
        sidebarOpen: false,
        isEditingBackground: false,
      });
    }).not.toThrow();

    expect(() => {
      navigationCache.getState();
    }).not.toThrow();

    expect(() => {
      navigationCache.clearState();
    }).not.toThrow();

    expect(() => {
      navigationCache.hasValidState();
    }).not.toThrow();
  });
});
