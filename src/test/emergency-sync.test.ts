import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the dependencies
vi.mock('@/stores/bookStoreSimple', () => ({
  useBookStore: {
    getState: vi.fn(() => ({
      currentBookId: 'test-project-id'
    }))
  }
}))

vi.mock('@/stores/assetStore', () => ({
  useAssetStore: {
    getState: vi.fn(() => ({
      getCurrentBookAssets: vi.fn(() => ({ asset1: 'data1', asset2: 'data2' }))
    }))
  }
}))

vi.mock('@/stores/backgroundStore', () => ({
  useBackgroundStore: {
    getState: vi.fn(() => ({
      configs: { bg1: 'config1', bg2: 'config2' }
    }))
  }
}))

vi.mock('@/services/DocumentMutationService', () => ({
  documentMutationService: {
    syncNow: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('@/services/connectivityService', () => ({
  connectivityService: {
    isOnline: vi.fn(() => true)
  }
}))

vi.mock('@/utils/logger', () => ({
  logEmergency: vi.fn(),
  reportError: vi.fn()
}))

// Mock navigator.sendBeacon
const mockSendBeacon = vi.fn()
Object.defineProperty(navigator, 'sendBeacon', {
  value: mockSendBeacon,
  writable: true
})

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
})

describe('Emergency Sync Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the emergency save service instance for each test
    vi.resetModules()
  })

  it('should construct correct Supabase function URL', async () => {
    // Set up environment variable
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    
    const { emergencySaveService } = await import('@/services/emergencySaveService')
    
    // Initialize the service
    emergencySaveService.initialize()
    
    // Trigger a beforeunload event to test emergency save
    const beforeUnloadEvent = new Event('beforeunload')
    window.dispatchEvent(beforeUnloadEvent)
    
    // Wait a bit for async operations
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Verify sendBeacon was called with correct URL and data
    expect(mockSendBeacon).toHaveBeenCalled()
    const [url, data] = mockSendBeacon.mock.calls[0]
    
    // Check that URL contains the correct Supabase function endpoint
    expect(url).toBe('https://test.supabase.co/functions/v1/emergency-sync')
    
    // Check that data contains required fields
    const parsedData = JSON.parse(data)
    expect(parsedData).toHaveProperty('projectId', 'test-project-id')
    expect(parsedData).toHaveProperty('timestamp')
    expect(parsedData).toHaveProperty('type', 'emergency-sync')
  })

  it('should save to localStorage during emergency save', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    
    const { emergencySaveService } = await import('@/services/emergencySaveService')
    
    emergencySaveService.initialize()
    
    // Trigger a beforeunload event
    const beforeUnloadEvent = new Event('beforeunload')
    window.dispatchEvent(beforeUnloadEvent)
    
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Verify localStorage was called
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'kanvas-emergency-backup',
      expect.stringContaining('test-project-id')
    )
  })

  it('should skip beacon sync when no project ID', async () => {
    // Mock book store with no project ID
    vi.doMock('@/stores/bookStoreSimple', () => ({
      useBookStore: {
        getState: vi.fn(() => ({
          currentBookId: null
        }))
      }
    }))

    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')

    const { emergencySaveService } = await import('@/services/emergencySaveService')
    
    emergencySaveService.initialize()
    
    // Trigger a beforeunload event
    const beforeUnloadEvent = new Event('beforeunload')
    window.dispatchEvent(beforeUnloadEvent)
    
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Verify sendBeacon was NOT called
    expect(mockSendBeacon).not.toHaveBeenCalled()
    
    // But localStorage should still be called
    expect(mockLocalStorage.setItem).toHaveBeenCalled()
  })

  it('should handle emergency backup loading and clearing', async () => {
    const { emergencySaveService } = await import('@/services/emergencySaveService')
    
    // Test loading backup when none exists
    mockLocalStorage.getItem.mockReturnValue(null)
    const backup = emergencySaveService.loadEmergencyBackup()
    expect(backup).toBeNull()
    
    // Test loading backup with old data
    const oldBackup = {
      assets: { asset1: 'data1' },
      backgrounds: { bg1: 'config1' },
      projectId: 'test-project',
      timestamp: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
    }
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(oldBackup))
    const oldBackupResult = emergencySaveService.loadEmergencyBackup()
    expect(oldBackupResult).toBeNull()
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('kanvas-emergency-backup')
    
    // Test loading valid backup
    const validBackup = {
      assets: { asset1: 'data1' },
      backgrounds: { bg1: 'config1' },
      projectId: 'test-project',
      timestamp: Date.now() - (2 * 60 * 60 * 1000) // 2 hours ago
    }
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(validBackup))
    const validBackupResult = emergencySaveService.loadEmergencyBackup()
    expect(validBackupResult).toEqual(validBackup)
    
    // Test clearing backup
    emergencySaveService.clearEmergencyBackup()
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('kanvas-emergency-backup')
    
    // Test checking if backup exists
    mockLocalStorage.getItem.mockReturnValue('some-data')
    expect(emergencySaveService.hasEmergencyBackup()).toBe(true)
    
    mockLocalStorage.getItem.mockReturnValue(null)
    expect(emergencySaveService.hasEmergencyBackup()).toBe(false)
  })
})
