import { describe, it, expect } from '@jest/globals';
import { SDK_VERSION, SDK_NAME } from '../src/version';

describe('Version', () => {
  describe('SDK_VERSION', () => {
    it('should export a valid version string', () => {
      expect(typeof SDK_VERSION).toBe('string');
      expect(SDK_VERSION).toBeTruthy();
    });

    it('should follow semantic versioning format', () => {
      // Check if version follows semver pattern (x.y.z or x.y.z-prerelease)
      const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
      expect(SDK_VERSION).toMatch(semverPattern);
    });

    it('should match expected version', () => {
      expect(SDK_VERSION).toBe('1.0.0-beta.1');
    });
  });

  describe('SDK_NAME', () => {
    it('should export a valid SDK name string', () => {
      expect(typeof SDK_NAME).toBe('string');
      expect(SDK_NAME).toBeTruthy();
    });

    it('should follow Sentry SDK naming convention', () => {
      expect(SDK_NAME).toMatch(/^sentry\./); // Should start with 'sentry.'
      expect(SDK_NAME).toContain('javascript'); // Should contain 'javascript'
      expect(SDK_NAME).toContain('miniapp'); // Should contain 'miniapp'
    });

    it('should match expected SDK name', () => {
      expect(SDK_NAME).toBe('sentry.javascript.miniapp');
    });
  });

  describe('Version consistency', () => {
    it('should have consistent naming and versioning', () => {
      // Ensure both constants are defined and non-empty
      expect(SDK_VERSION.length).toBeGreaterThan(0);
      expect(SDK_NAME.length).toBeGreaterThan(0);
    });

    it('should not contain invalid characters', () => {
      // Version should not contain spaces or special characters except dots, hyphens, and alphanumeric
      expect(SDK_VERSION).toMatch(/^[a-zA-Z0-9.-]+$/);
      
      // SDK name should not contain spaces or invalid characters
      expect(SDK_NAME).toMatch(/^[a-zA-Z0-9.]+$/);
    });
  });
});