import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TryCatch } from '../src/integrations/trycatch';
import { HttpContext, httpContextIntegration } from '../src/integrations/httpcontext';

describe('Integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TryCatch', () => {
    let integration: TryCatch;

    beforeEach(() => {
      integration = new TryCatch();
    });

    it('should have correct name', () => {
      expect(integration.name).toBe('TryCatch');
    });

    it('should wrap functions with error handling', () => {
      expect(() => integration.setupOnce()).not.toThrow();
    });
  });

  describe('HttpContext', () => {
    let integration: HttpContext;

    beforeEach(() => {
      integration = new HttpContext();
    });

    it('should create the functional integration', () => {
      expect(httpContextIntegration()).toBeInstanceOf(HttpContext);
    });

    it('should have correct name', () => {
      expect(integration.name).toBe('HttpContext');
    });

    it('should setup HTTP request tracking', () => {
      expect(() => integration.setupOnce()).not.toThrow();
    });
  });
});
