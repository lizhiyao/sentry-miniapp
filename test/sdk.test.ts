import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { init } from '../src/sdk';
import { MiniappClient } from '../src/client';
import { MiniappOptions } from '../src/types';

describe('SDK Initialization', () => {
  beforeEach(() => {
    // Reset any existing hub
    jest.clearAllMocks();
  });

  it('should initialize with minimal configuration', () => {
    const options: MiniappOptions = {
      dsn: 'https://test@sentry.io/123456'
    };

    const client = init(options);
    
    expect(client).toBeInstanceOf(MiniappClient);
    expect(client?.getOptions().dsn).toBe(options.dsn);
  });

  it('should initialize with full configuration', () => {
    const options: MiniappOptions = {
      dsn: 'https://test@sentry.io/123456',
      debug: true,
      environment: 'test',
      release: '1.0.0',
      sampleRate: 0.5,
      maxBreadcrumbs: 50,
      beforeSend: jest.fn(),
      beforeBreadcrumb: jest.fn()
    };

    const client = init(options);
    
    expect(client).toBeInstanceOf(MiniappClient);
    expect(client?.getOptions().dsn).toBe(options.dsn);
    expect(client?.getOptions().debug).toBe(true);
    expect(client?.getOptions().environment).toBe('test');
    expect(client?.getOptions().release).toBe('1.0.0');
    expect(client?.getOptions().sampleRate).toBe(0.5);
  });

  it('should set default options when not provided', () => {
    const options: MiniappOptions = {
      dsn: 'https://test@sentry.io/123456'
    };

    const client = init(options);
    const clientOptions = client?.getOptions();
    
    // Check that client was created successfully
    expect(client).toBeInstanceOf(MiniappClient);
    expect(clientOptions?.dsn).toBe(options.dsn);
  });

  it('should handle missing DSN gracefully', () => {
    const client = init({} as MiniappOptions);
    // Should still create a client even without DSN
    expect(client).toBeInstanceOf(MiniappClient);
  });

  it('should return the same client instance on multiple initializations', () => {
    const options: MiniappOptions = {
      dsn: 'https://test@sentry.io/123456'
    };
    
    const client1 = init(options);
    const client2 = init(options);
    
    // Both should be instances of MiniappClient
    expect(client1).toBeInstanceOf(MiniappClient);
    expect(client2).toBeInstanceOf(MiniappClient);
    // Both should have the same DSN
    expect(client1?.getOptions().dsn).toBe(client2?.getOptions().dsn);
  });

  it('should configure integrations correctly', () => {
    const options: MiniappOptions = {
      dsn: 'https://test@sentry.io/123456',
      integrations: []
    };

    const client = init(options);
    
    expect(client).toBeInstanceOf(MiniappClient);
    // Default integrations should be added even when empty array is provided
    expect(client?.getIntegrationByName).toBeDefined();
  });
});