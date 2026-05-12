/**
 * ESLint ANTI-PATTERNS PLUGIN TESTS
 * 
 * Tests for the custom ESLint rules that enforce architectural safeguards.
 * These tests ensure the linting rules catch forbidden patterns correctly.
 * 
 * 🔒 CRITICAL: These tests protect against architectural drift
 */

import { describe, it, expect } from 'vitest';
import plugin from '../../eslint-plugins/kanvas-anti-patterns.js';

describe('ESLint Anti-Patterns Plugin', () => {
  describe('Plugin Structure', () => {
    it('should have all required rules defined', () => {
      const requiredRules = [
        'no-forbidden-fields',
        'no-direct-localstorage',
        'no-embedded-files',
        'no-sync-state-pollution',
        'no-ui-state-pollution',
        'no-behavior-branching',
        'no-full-project-reload',
        'no-conditional-schema',
        'require-zone-separation',
        'no-asset-type-branching',
        'no-sync-state-in-assets',
        'require-canonical-structure'
      ];

      requiredRules.forEach(ruleName => {
        expect(plugin.rules).toHaveProperty(ruleName);
        const rule = plugin.rules[ruleName] as any;
        expect(rule).toHaveProperty('meta');
        expect(rule).toHaveProperty('create');
      });
    });

    it('should have proper rule metadata', () => {
      Object.values(plugin.rules).forEach(rule => {
        const ruleObj = rule as any;
        expect(ruleObj.meta).toHaveProperty('type');
        expect(ruleObj.meta).toHaveProperty('docs');
        expect(ruleObj.meta.docs).toHaveProperty('description');
        expect(ruleObj.meta.docs).toHaveProperty('category');
        expect(['problem', 'suggestion', 'layout']).toContain(ruleObj.meta.type);
      });
    });
  });

  describe('Rule Implementation Validation', () => {
    it('should have create functions that return rule visitors', () => {
      Object.values(plugin.rules).forEach(rule => {
        const ruleObj = rule as any;
        const createFn = ruleObj.create;
        expect(typeof createFn).toBe('function');
        
        // Test that create function returns an object with visitor methods
        const visitors = createFn({
          report: () => {},
          getSourceCode: () => ({ slice: () => '' })
        });
        
        expect(typeof visitors).toBe('object');
        expect(visitors).not.toBeNull();
      });
    });

    it('should have meaningful error messages', () => {
      const rulesWithMessages = [
        'no-forbidden-fields',
        'no-direct-localstorage',
        'no-embedded-files',
        'no-sync-state-pollution',
        'no-ui-state-pollution',
        'no-behavior-branching',
        'no-full-project-reload',
        'no-conditional-schema',
        'require-zone-separation',
        'no-asset-type-branching',
        'no-sync-state-in-assets',
        'require-canonical-structure'
      ];

      rulesWithMessages.forEach(ruleName => {
        const rule = plugin.rules[ruleName] as any;
        expect(rule.meta.docs.description).toBeTruthy();
        expect(rule.meta.docs.description.length).toBeGreaterThan(10);
      });
    });
  });

  describe('Rule Behavior Simulation', () => {
    it('should detect forbidden patterns in code snippets', () => {
      // Test the lintingRules helper function from Safeguards
      const { lintingRules } = require('../../types/Safeguards');
      
      // Test forbidden field detection
      const codeWithForbiddenFields = `
        const asset = {
          id: 'test',
          sync_status: 'dirty',
          upload_progress: 0.5,
          selected: true
        };
        console.log(asset.sync_status);
      `;
      
      const issues = lintingRules.checkForForbiddenPatterns(codeWithForbiddenFields);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.includes('sync_status'))).toBe(true);
      expect(issues.some(issue => issue.includes('upload_progress'))).toBe(true);
    });

    it('should detect behavior-based branching', () => {
      const { lintingRules } = require('../../types/Safeguards');
      
      const codeWithBranching = `
        if (asset.type === 'image') {
          renderImage();
        }
        
        switch (asset.behavior.renderMode) {
          case 'card':
            renderCard();
            break;
        }
      `;
      
      const issues = lintingRules.checkForBehaviorBranching(codeWithBranching);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.includes('behavior-based branching'))).toBe(true);
    });

    it('should detect localStorage usage', () => {
      const { lintingRules } = require('../../types/Safeguards');
      
      const codeWithLocalStorage = `
        localStorage.setItem('key', 'value');
        const data = localStorage.getItem('key');
      `;
      
      const issues = lintingRules.checkForForbiddenPatterns(codeWithLocalStorage);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.includes('localStorage'))).toBe(true);
    });
  });

  describe('Rule Configuration', () => {
    it('should have problem severity for critical rules', () => {
      const criticalRules = [
        'no-forbidden-fields',
        'no-direct-localstorage',
        'no-embedded-files',
        'no-sync-state-pollution',
        'no-ui-state-pollution',
        'no-full-project-reload',
        'no-conditional-schema',
        'require-zone-separation',
        'no-asset-type-branching',
        'no-sync-state-in-assets',
        'require-canonical-structure'
      ];

      criticalRules.forEach(ruleName => {
        const rule = plugin.rules[ruleName] as any;
        expect(rule.meta.type).toBe('problem');
      });
    });

    it('should have suggestion severity for behavior warnings', () => {
      const warningRule = plugin.rules['no-behavior-branching'] as any;
      expect(warningRule.meta.type).toBe('suggestion');
    });
  });
});
