// Simple debug script to test rate limiting
import { rateLimitService } from './src/services/rateLimitService.js';

console.log('Testing rate limit service...');

// Reset first
rateLimitService.resetUserLimits('test-user-id');

// Test single request
const result1 = rateLimitService.checkApiRequest('test-user-id');
console.log('First request result:', result1);

// Test second request  
const result2 = rateLimitService.checkApiRequest('test-user-id');
console.log('Second request result:', result2);

// Get status
const status = rateLimitService.getCurrentStatus('test-user-id');
console.log('Current status:', status);
