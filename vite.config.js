import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

// 通用构建配置
const baseConfig = {
  build: {
    sourcemap: true,
    minify: false, // 保持代码可读性，便于调试
    target: 'es2015',
    rollupOptions: {
      external: [
        // 标记外部依赖，不打包进最终文件
        '@sentry/core',
        '@sentry/utils',
        '@sentry/types'
      ],
      output: {
        globals: {
          '@sentry/core': 'SentryCore',
          '@sentry/utils': 'SentryUtils',
          '@sentry/types': 'SentryTypes'
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
};

export default defineConfig(({ mode }) => {
  if (mode === 'miniapp') {
    // 小程序构建配置 - 内联所有依赖
    return {
      ...baseConfig,
      build: {
        ...baseConfig.build,
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'SentryMiniapp',
          fileName: 'sentry-miniapp',
          formats: ['cjs'] // 小程序只需要 CommonJS 格式
        },
        outDir: 'examples/wxapp/lib',
        rollupOptions: {
          // 小程序版本内联所有依赖
          external: [],
          output: {
            format: 'cjs',
            exports: 'auto'
          }
        }
      },
      define: {
        __DEV__: mode === 'development'
      }
    };
  }
  
  // 标准 npm 包构建配置
  return {
    ...baseConfig,
    build: {
      ...baseConfig.build,
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'SentryMiniapp',
        fileName: (format) => `sentry-miniapp.${format}.js`,
        formats: ['es', 'cjs', 'umd']
      },
      outDir: 'dist',
      rollupOptions: {
        ...baseConfig.build.rollupOptions,
        output: [
          {
            format: 'es',
            entryFileNames: 'sentry-miniapp.esm.js',
            exports: 'named'
          },
          {
            format: 'cjs',
            entryFileNames: 'sentry-miniapp.cjs.js',
            exports: 'auto'
          },
          {
            format: 'umd',
            entryFileNames: 'sentry-miniapp.umd.js',
            name: 'SentryMiniapp',
            exports: 'auto',
            globals: baseConfig.build.rollupOptions.output.globals
          }
        ]
      }
    },
    plugins: [
      // 生成 TypeScript 类型定义文件
      dts({
        include: ['src/**/*'],
        exclude: ['src/**/*.test.ts', 'test/**/*'],
        outDir: 'dist/types'
      })
    ],
    define: {
      __DEV__: mode === 'development'
    }
  };
});