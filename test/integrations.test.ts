import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TryCatch } from '../src/integrations/trycatch';
import { System } from '../src/integrations/system';
import {
  HttpContext,
  httpContextIntegration,
  LinkedErrors,
  linkedErrorsIntegration,
} from '../src/integrations/index';

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

  describe('System', () => {
    let integration: System;

    beforeEach(() => {
      integration = new System();
    });

    it('should have correct name', () => {
      expect(integration.name).toBe('System');
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

  describe('LinkedErrors', () => {
    let integration: LinkedErrors;

    beforeEach(() => {
      integration = new LinkedErrors();
    });

    it('should create the functional integration with options', () => {
      const created = linkedErrorsIntegration({ key: 'reason', limit: 2 });

      expect(created.name).toBe('LinkedErrors');
      expect(created.preprocessEvent).toEqual(expect.any(Function));
    });

    it('should have correct name', () => {
      expect(integration.name).toBe('LinkedErrors');
    });

    it('should complete setup without throwing', () => {
      expect(() => integration.setupOnce()).not.toThrow();
    });
  });
});
