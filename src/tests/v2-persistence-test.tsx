/**
 * V2 PERSISTENCE SYSTEM TEST
 * 
 * Comprehensive test to verify the new kanvasStore and V2 persistence system
 * is working correctly according to the plan requirements.
 * 
 * 🔒 CRITICAL: Must verify canonical asset structure and V2 compliance
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useSyncStore } from '@/stores/syncStore';
import { db } from '@/storage/indexeddb';
import type { Asset } from '@/types/Asset';
import { validateAssetStrict } from '@/types/Safeguards';

export function V2PersistenceTest() {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  
  const { createAsset, updateAsset, deleteAsset, getProjectAssets, loadProject, clearProject } = useKanvasStore();
  const { syncQueue, syncStatus } = useSyncStore();

  const addTestResult = (test: string, passed: boolean, details?: string) => {
    const result = `${passed ? '✅' : '❌'} ${test}${details ? ` - ${details}` : ''}`;
    setTestResults(prev => [...prev, result]);
    console.log(result);
  };

  const runTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    try {
      // Test 1: Canonical Asset Structure Validation
      console.log('🧪 Testing canonical asset structure...');
      try {
        const testAsset: Omit<Asset, 'id' | 'metadata'> = {
          projectId: 'test-project',
          layout: { x: 100, y: 100, width: 200, height: 150, scale: 1, rotation: 0, zIndex: 1 },
          content: { title: 'Test Asset', description: 'Test Description' },
          style: { background: '#ffffff', tagColor: '#000000' },
          behavior: { renderMode: 'default' },
        };
        
        validateAssetStrict(testAsset as Asset);
        addTestResult('Canonical Asset Structure Validation', true, 'Asset passes strict validation');
      } catch (error) {
        addTestResult('Canonical Asset Structure Validation', false, `Validation failed: ${error}`);
      }

      // Test 2: Asset Creation
      console.log('🧪 Testing asset creation...');
      try {
        const assetId = await createAsset({
          projectId: 'test-project',
          layout: { x: 50, y: 50, width: 100, height: 100 },
          content: { title: 'Created Test Asset' },
          style: { background: '#ff0000' },
          behavior: { renderMode: 'default' },
        });
        
        addTestResult('Asset Creation', true, `Created asset with ID: ${assetId}`);
        
        // Test 3: Asset Retrieval
        console.log('🧪 Testing asset retrieval...');
        const createdAsset = getProjectAssets('test-project').find(a => a.id === assetId);
        if (createdAsset) {
          addTestResult('Asset Retrieval', true, `Retrieved asset: ${createdAsset.content.title}`);
          
          // Test 4: Asset Update
          console.log('🧪 Testing asset update...');
          await updateAsset(assetId, {
            content: { title: 'Updated Test Asset' },
            layout: { x: 75, y: 75 }
          });
          
          const updatedAsset = getProjectAssets('test-project').find(a => a.id === assetId);
          if (updatedAsset && updatedAsset.content.title === 'Updated Test Asset') {
            addTestResult('Asset Update', true, 'Asset updated successfully');
            
            // Test 5: IndexedDB Persistence
            console.log('🧪 Testing IndexedDB persistence...');
            const dbAssets = await db.getProjectAssets('test-project');
            const persistedAsset = dbAssets.find(a => a.id === assetId);
            if (persistedAsset) {
              addTestResult('IndexedDB Persistence', true, 'Asset persisted to IndexedDB');
              
              // Test 6: Sync Queue Integration
              console.log('🧪 Testing sync queue integration...');
              const syncEntry = syncQueue.get(assetId);
              if (syncEntry) {
                addTestResult('Sync Queue Integration', true, 'Asset marked for sync');
                
                // Test 7: Asset Deletion
                console.log('🧪 Testing asset deletion...');
                await deleteAsset(assetId);
                
                const deletedAsset = getProjectAssets('test-project').find(a => a.id === assetId);
                if (!deletedAsset) {
                  addTestResult('Asset Deletion', true, 'Asset deleted successfully');
                  
                  // Test 8: Forbidden Pattern Detection
                  console.log('🧪 Testing forbidden pattern detection...');
                  try {
                    const invalidAsset = {
                      ...createdAsset,
                      sync_status: 'dirty' as any, // Forbidden field
                    };
                    validateAssetStrict(invalidAsset);
                    addTestResult('Forbidden Pattern Detection', false, 'Should have caught forbidden sync_status field');
                  } catch (error) {
                    addTestResult('Forbidden Pattern Detection', true, 'Correctly detected forbidden pattern');
                  }
                  
                } else {
                  addTestResult('Asset Deletion', false, 'Asset still exists after deletion');
                }
              } else {
                addTestResult('Sync Queue Integration', false, 'Asset not marked for sync');
              }
            } else {
              addTestResult('IndexedDB Persistence', false, 'Asset not found in IndexedDB');
            }
          } else {
            addTestResult('Asset Update', false, 'Asset not updated correctly');
          }
        } else {
          addTestResult('Asset Retrieval', false, 'Created asset not found');
        }
      } catch (error) {
        addTestResult('Asset Creation', false, `Creation failed: ${error}`);
      }

      // Test 9: V2 Architecture Compliance
      console.log('🧪 Testing V2 architecture compliance...');
      const projectAssets = getProjectAssets('test-project');
      const hasCanonicalStructure = projectAssets.every(asset => {
        return asset.layout && asset.content && asset.style && asset.behavior && asset.metadata;
      });
      
      if (hasCanonicalStructure) {
        addTestResult('V2 Architecture Compliance', true, 'All assets use canonical structure');
      } else {
        addTestResult('V2 Architecture Compliance', false, 'Some assets missing canonical structure');
      }

      // Test 10: Memory Store vs Persistence Separation
      console.log('🧪 Testing memory/persistence separation...');
      const memoryAssets = getProjectAssets('test-project');
      const persistedAssets = await db.getProjectAssets('test-project');
      
      if (memoryAssets.length === persistedAssets.length) {
        addTestResult('Memory/Persistence Separation', true, 'Memory and persistence in sync');
      } else {
        addTestResult('Memory/Persistence Separation', false, `Memory: ${memoryAssets.length}, Persistence: ${persistedAssets.length}`);
      }

      // Cleanup test data
      await clearProject();
      console.log('🧪 Test completed - cleaning up test data');
      
    } catch (error) {
      addTestResult('Test Suite Error', false, `Unexpected error: ${error}`);
    }
    
    setIsRunning(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>V2 Persistence System Test</CardTitle>
          <CardDescription>
            Comprehensive test suite for the new kanvasStore and V2 persistence architecture
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={runTests} 
              disabled={isRunning}
              className="min-w-[200px]"
            >
              {isRunning ? 'Running Tests...' : 'Run V2 Tests'}
            </Button>
            
            {syncStatus && (
              <div className="text-sm text-muted-foreground">
                Sync Status: <span className="font-mono">{syncStatus}</span>
              </div>
            )}
          </div>
          
          {testResults.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Test Results:</h3>
              <div className="bg-muted/50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {testResults.join('\n')}
                </pre>
              </div>
            </div>
          )}
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Tests:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Canonical Asset Structure Validation</li>
              <li>Asset Creation</li>
              <li>Asset Retrieval</li>
              <li>Asset Update</li>
              <li>IndexedDB Persistence</li>
              <li>Sync Queue Integration</li>
              <li>Asset Deletion</li>
              <li>Forbidden Pattern Detection</li>
              <li>V2 Architecture Compliance</li>
              <li>Memory/Persistence Separation</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
