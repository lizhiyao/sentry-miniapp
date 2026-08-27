import { defineConfig } from 'vite';
import { resolve } from 'path';
import { transformAsync } from '@babel/core';
import transformRegenerator from '@babel/plugin-transform-regenerator';
import dts from 'vite-plugin-dts';

function isolateUmdHelpers({ types }) {
  return {
    name: 'sentry-miniapp-isolate-umd-helpers',
    visitor: {
      Program: {
        exit(path) {
          const body = types.functionExpression(null, [], types.blockStatement(path.node.body));
          const call = types.callExpression(
            types.memberExpression(body, types.identifier('call')),
            [types.thisExpression()]
          );

          path.node.body = [types.expressionStatement(call)];
        }
      },
    }
  };
}

function transformGenerators() {
  return {
    name: 'sentry-miniapp-transform-generators',
    enforce: 'post',
    renderChunk: {
      order: 'post',
      async handler(code, chunk, outputOptions) {
        const plugins = [transformRegenerator];

        if (outputOptions.format === 'umd') {
          plugins.push(isolateUmdHelpers);
        }

        const result = await transformAsync(code, {
          filename: chunk.fileName,
          babelrc: false,
          configFile: false,
          comments: true,
          compact: true,
          sourceMaps: true,
          sourceType: 'unambiguous',
          plugins
        });

        if (!result?.code) {
          return null;
        }

        return {
          code: result.code,
          map: result.map ?? null
        };
      },
    }
  };
}

// 通用构建配置
const baseConfig = {
  build: {
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2015',
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
      },
      plugins: [transformGenerators()],
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
      },
      outDir: 'dist',
      rollupOptions: {
        external: [],
        output: [
          {
            format: 'es',
            entryFileNames: 'sentry-miniapp.mjs',
            exports: 'named'
          },
          {
            format: 'cjs',
            entryFileNames: 'sentry-miniapp.cjs',
            exports: 'auto'
          },
          {
            format: 'umd',
            entryFileNames: 'sentry-miniapp.umd.js',
            name: 'SentryMiniapp',
            exports: 'auto',
            globals: {}
          },
        ]
      }
    },
    plugins: [
      transformGenerators(),
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
