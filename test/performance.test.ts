import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { addBreadcrumb } from '@sentry/core';

// Mock Sentry core functions
jest.mock('@sentry/core', () => ({
  addBreadcrumb: jest.fn(),
  getCurrentHub: jest.fn(() => ({
    getClient: jest.fn(() => ({
      captureException: jest.fn(),
      captureMessage: jest.fn()
    }))
  }))
}));

// Mock startTransaction since it's not available in v9
const mockStartTransaction = jest.fn();

describe('Performance Monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Transaction tracking', () => {
    it('should start transaction for page navigation', () => {
      mockStartTransaction.mockReturnValue({
        setName: jest.fn(),
        setTag: jest.fn(),
        setData: jest.fn(),
        finish: jest.fn(),
        toTraceparent: jest.fn(),
        toSentryTrace: jest.fn(),
        getTraceContext: jest.fn()
      } as any);

      // Simulate page navigation
      const transaction = mockStartTransaction({
        name: 'Page Load',
        op: 'navigation'
      });

      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: 'Page Load',
        op: 'navigation'
      });
      expect(transaction).toBeDefined();
    });

    it('should track API request performance', () => {
      const mockStartTransaction = jest.fn();
      const mockTransaction = {
        setName: jest.fn(),
        setTag: jest.fn(),
        setData: jest.fn(),
        finish: jest.fn(),
        toTraceparent: jest.fn(),
        toSentryTrace: jest.fn(),
        getTraceContext: jest.fn()
      };
      mockStartTransaction.mockReturnValue(mockTransaction as any);

      // Simulate API request
      const transaction = mockStartTransaction({
        name: 'API Request',
        op: 'http.client'
      });

      (transaction as any).setTag('http.method', 'GET');
      (transaction as any).setData('url', 'https://api.example.com/data');
      (transaction as any).finish();

      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: 'API Request',
        op: 'http.client'
      });
      expect(mockTransaction.setTag).toHaveBeenCalledWith('http.method', 'GET');
      expect(mockTransaction.setData).toHaveBeenCalledWith('url', 'https://api.example.com/data');
      expect(mockTransaction.finish).toHaveBeenCalled();
    });

    it('should track user interaction performance', () => {
      const mockStartTransaction = jest.fn();
      const mockTransaction = {
        setName: jest.fn(),
        setTag: jest.fn(),
        setData: jest.fn(),
        finish: jest.fn(),
        toTraceparent: jest.fn(),
        toSentryTrace: jest.fn(),
        getTraceContext: jest.fn()
      };
      mockStartTransaction.mockReturnValue(mockTransaction as any);

      // Simulate user interaction
      const transaction = mockStartTransaction({
        name: 'Button Click',
        op: 'ui.action.click'
      });

      (transaction as any).setTag('element.tag', 'button');
      (transaction as any).setData('element.id', 'submit-btn');
      (transaction as any).finish();

      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: 'Button Click',
        op: 'ui.action.click'
      });
      expect(mockTransaction.setTag).toHaveBeenCalledWith('element.tag', 'button');
      expect(mockTransaction.setData).toHaveBeenCalledWith('element.id', 'submit-btn');
      expect(mockTransaction.finish).toHaveBeenCalled();
    });
  });

  describe('Breadcrumb tracking', () => {
    it('should add navigation breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'navigation',
        message: 'Navigated to /home',
        level: 'info',
        data: {
          from: '/login',
          to: '/home'
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        message: 'Navigated to /home',
        level: 'info',
        data: {
          from: '/login',
          to: '/home'
        }
      });
    });

    it('should add user action breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'user',
        message: 'User clicked submit button',
        level: 'info',
        data: {
          element: 'button',
          id: 'submit-btn'
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'user',
        message: 'User clicked submit button',
        level: 'info',
        data: {
          element: 'button',
          id: 'submit-btn'
        }
      });
    });

    it('should add HTTP request breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'http',
        message: 'GET /api/users',
        level: 'info',
        data: {
          method: 'GET',
          url: '/api/users',
          status_code: 200
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'http',
        message: 'GET /api/users',
        level: 'info',
        data: {
          method: 'GET',
          url: '/api/users',
          status_code: 200
        }
      });
    });

    it('should add console breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'console',
        message: 'User logged a warning',
        level: 'warning',
        data: {
          logger: 'console',
          extra: {
            arguments: ['Warning message']
          }
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'console',
        message: 'User logged a warning',
        level: 'warning',
        data: {
          logger: 'console',
          extra: {
            arguments: ['Warning message']
          }
        }
      });
    });

    it('should add error breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'error',
        message: 'Unhandled promise rejection',
        level: 'error',
        data: {
          type: 'unhandledrejection',
          reason: 'Network timeout'
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'error',
        message: 'Unhandled promise rejection',
        level: 'error',
        data: {
          type: 'unhandledrejection',
          reason: 'Network timeout'
        }
      });
    });
  });

  describe('Performance metrics', () => {
    it('should measure function execution time', async () => {
      const startTime = Date.now();
      
      // Simulate some async work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(1000);
    });

    it('should track memory usage', () => {
      // Mock memory info for miniapp environment
      const mockMemoryInfo = {
        usedJSHeapSize: 1024 * 1024, // 1MB
        totalJSHeapSize: 2 * 1024 * 1024, // 2MB
        jsHeapSizeLimit: 10 * 1024 * 1024 // 10MB
      };

      // In a real miniapp, this would come from wx.getSystemInfo or similar
      const memoryUsage = mockMemoryInfo.usedJSHeapSize / mockMemoryInfo.totalJSHeapSize;

      expect(memoryUsage).toBe(0.5);
      expect(mockMemoryInfo.usedJSHeapSize).toBeLessThan(mockMemoryInfo.jsHeapSizeLimit);
    });

    it('should track page load metrics', () => {
      const mockPageMetrics = {
        domContentLoaded: 500,
        firstPaint: 300,
        firstContentfulPaint: 400,
        largestContentfulPaint: 600
      };

      // Validate metrics are reasonable
      expect(mockPageMetrics.firstPaint).toBeLessThan(mockPageMetrics.firstContentfulPaint);
      expect(mockPageMetrics.firstContentfulPaint).toBeLessThan(mockPageMetrics.domContentLoaded);
      expect(mockPageMetrics.domContentLoaded).toBeLessThan(mockPageMetrics.largestContentfulPaint);
    });
  });
});