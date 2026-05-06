/**
 * Performance Testing for Scalable Asset Management
 * Tests the app with hundreds of assets to verify low-IO performance
 */

import { assetCacheService } from '@/services/AssetCacheService';
import { useAssetStore } from '@/stores/assetStoreSimple';
import { supabase } from '@/lib/supabase';

interface TestResults {
  testName: string;
  assetCount: number;
  loadTime: number;
  memoryUsage: number;
  cacheSize: number;
  passed: boolean;
  details: string;
}

class AssetPerformanceTest {
  private results: TestResults[] = [];
  private bookId: string | null = null;

  // Generate test assets
  generateTestAssets(count: number): any[] {
    const assets = [];
    const types = ['character', 'location', 'item', 'note', 'image'];
    
    for (let i = 0; i < count; i++) {
      assets.push({
        id: `test-asset-${i}`,
        name: `Test Asset ${i}`,
        type: types[i % types.length],
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        width: 100 + Math.random() * 200,
        height: 80 + Math.random() * 120,
        content: i % 10 === 0 ? { description: `Detailed content for asset ${i}`.repeat(10) } : null,
        createdAt: Date.now() - Math.random() * 86400000, // Random time in last day
        updatedAt: Date.now()
      });
    }
    
    return assets;
  }

  // Measure memory usage
  getMemoryUsage(): number {
    if (performance.memory) {
      return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024); // MB
    }
    return 0;
  }

  // Run single test
  async runTest(assetCount: number): Promise<TestResults> {
    const testName = `Load ${assetCount} assets`;
    console.log(`🧪 Running test: ${testName}`);
    
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();
    
    try {
      // Clear cache before test
      assetCacheService.clearCache();
      
      // Generate test assets
      const assets = this.generateTestAssets(assetCount);
      
      // Add assets to cache service
      for (const asset of assets) {
        assetCacheService.updateAsset(asset);
      }
      
      // Simulate viewport loading (load visible assets)
      const viewportBounds = { x: 0, y: 0, width: 800, height: 600 };
      const visibleAssets = await assetCacheService.getVisibleAssets(this.bookId || 'test-book', viewportBounds);
      
      const endTime = performance.now();
      const endMemory = this.getMemoryUsage();
      const loadTime = Math.round(endTime - startTime);
      const memoryIncrease = endMemory - startMemory;
      const cacheStats = assetCacheService.getCacheStats();
      
      // Performance thresholds
      const maxLoadTime = assetCount <= 50 ? 500 : assetCount <= 200 ? 1000 : 2000; // ms
      const maxMemoryIncrease = assetCount <= 50 ? 10 : assetCount <= 200 ? 50 : 100; // MB
      const maxCacheSize = 50; // Should never exceed cache limit
      
      const passed = loadTime <= maxLoadTime && 
                    memoryIncrease <= maxMemoryIncrease && 
                    cacheStats.cacheSize <= maxCacheSize;
      
      const result: TestResults = {
        testName,
        assetCount,
        loadTime,
        memoryUsage: memoryIncrease,
        cacheSize: cacheStats.cacheSize,
        passed,
        details: `Load time: ${loadTime}ms (max: ${maxLoadTime}ms), Memory: +${memoryIncrease}MB (max: +${maxMemoryIncrease}MB), Cache: ${cacheStats.cacheSize} (max: ${maxCacheSize})`
      };
      
      this.results.push(result);
      
      console.log(`✅ Test completed: ${result.details}`);
      return result;
      
    } catch (error) {
      const endTime = performance.now();
      const loadTime = Math.round(endTime - startTime);
      
      const result: TestResults = {
        testName,
        assetCount,
        loadTime,
        memoryUsage: 0,
        cacheSize: 0,
        passed: false,
        details: `Error: ${error.message}`
      };
      
      this.results.push(result);
      console.error(`❌ Test failed:`, error);
      return result;
    }
  }

  // Run full test suite
  async runFullTestSuite(): Promise<TestResults[]> {
    console.log('🚀 Starting Asset Performance Test Suite');
    console.log('This will test the scalable architecture with increasing asset counts');
    
    this.results = [];
    
    // Initialize with test book ID
    this.bookId = 'test-book-' + Date.now();
    assetCacheService.initialize(supabase, this.bookId);
    
    // Test with different asset counts
    const testSizes = [10, 50, 100, 200, 500];
    
    for (const size of testSizes) {
      await this.runTest(size);
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.printResults();
    return this.results;
  }

  // Print test results
  printResults(): void {
    console.log('\n📊 Asset Performance Test Results');
    console.log('=====================================');
    
    this.results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.testName}`);
      console.log(`   ${result.details}`);
      console.log('');
    });
    
    const passedTests = this.results.filter(r => r.passed).length;
    const totalTests = this.results.length;
    
    console.log(`Summary: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All performance tests passed! The scalable architecture is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Performance may need optimization.');
    }
  }

  // Test virtual viewport performance
  async testVirtualViewport(): Promise<void> {
    console.log('🖥️  Testing Virtual Viewport Performance');
    
    // Create many assets spread across large area
    const largeAssets = [];
    for (let i = 0; i < 1000; i++) {
      largeAssets.push({
        id: `viewport-test-${i}`,
        name: `Viewport Asset ${i}`,
        type: 'test',
        x: Math.random() * 10000, // 10k x 10k canvas
        y: Math.random() * 10000,
        width: 50 + Math.random() * 150,
        height: 50 + Math.random() * 150,
        updatedAt: Date.now()
      });
    }
    
    // Add to cache
    largeAssets.forEach(asset => assetCacheService.updateAsset(asset));
    
    // Test viewport loading at different positions
    const viewports = [
      { x: 0, y: 0, width: 800, height: 600 },
      { x: 5000, y: 5000, width: 800, height: 600 },
      { x: 9000, y: 9000, width: 800, height: 600 }
    ];
    
    for (const viewport of viewports) {
      const startTime = performance.now();
      const assets = await assetCacheService.getVisibleAssets(this.bookId || 'test', viewport);
      const loadTime = performance.now() - startTime;
      
      console.log(`Viewport at (${viewport.x}, ${viewport.y}): ${assets.length} assets loaded in ${loadTime.toFixed(2)}ms`);
    }
  }

  // Test cache eviction
  async testCacheEviction(): Promise<void> {
    console.log('🗑️  Testing Cache Eviction');
    
    // Fill cache beyond limit
    for (let i = 0; i < 100; i++) {
      assetCacheService.updateAsset({
        id: `eviction-test-${i}`,
        name: `Eviction Test ${i}`,
        type: 'test',
        x: i * 10,
        y: i * 10,
        width: 100,
        height: 100,
        updatedAt: Date.now()
      });
    }
    
    const stats = assetCacheService.getCacheStats();
    console.log(`Cache size after adding 100 assets: ${stats.cacheSize} (should be ≤ 50)`);
    
    // Access some assets to make them recently used
    for (let i = 90; i < 100; i++) {
      await assetCacheService.getFullAsset(`eviction-test-${i}`);
    }
    
    // Add more assets to trigger eviction
    for (let i = 100; i < 120; i++) {
      assetCacheService.updateAsset({
        id: `eviction-test-${i}`,
        name: `Eviction Test ${i}`,
        type: 'test',
        x: i * 10,
        y: i * 10,
        width: 100,
        height: 100,
        updatedAt: Date.now()
      });
    }
    
    const finalStats = assetCacheService.getCacheStats();
    console.log(`Final cache size: ${finalStats.cacheSize} (should be ≤ 50)`);
    console.log(`Queue size: ${Object.values(finalStats.queueSize).reduce((a, b) => a + b, 0)}`);
  }
}

// Export for use in browser console
export const performanceTest = new AssetPerformanceTest();

// Auto-run if in development mode
if (import.meta.env.DEV) {
  // Make available globally for testing
  (window as any).assetPerformanceTest = performanceTest;
  
  console.log('🧪 Asset Performance Test available at: window.assetPerformanceTest');
  console.log('Run: window.assetPerformanceTest.runFullTestSuite()');
}
