import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
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

// 独立下载 JS 时也携带内联依赖的完整声明；npm 包同时提供独立 notices 文件。
const thirdPartyNotice = `/*!\n${readFileSync(new URL('./THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8')}\n*/`;

function bundledNotices() {
  return {
    name: 'sentry-miniapp-bundled-notices',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          // 在最终压缩后追加，避免声明被删除；尾部注释不移动现有 source map 位置。
          output.code += `\n${thirdPartyNotice}\n`;
        }
      }
    },
  };
}

// 通用构建配置
const baseConfig = {
  build: {
    sourcemap: true,
    minify: 'oxc',
    target: 'es2015',
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src')
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
          entry: resolve(import.meta.dirname, 'src/index.ts'),
          name: 'SentryMiniapp',
          fileName: 'sentry-miniapp',
          formats: ['cjs'] // 小程序只需要 CommonJS 格式
        },
        outDir: 'examples/wxapp/lib',
        rolldownOptions: {
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
      plugins: [transformGenerators(), bundledNotices()],
    };
  }

  // 标准 npm 包构建配置
  return {
    ...baseConfig,
    build: {
      ...baseConfig.build,
      lib: {
        entry: resolve(import.meta.dirname, 'src/index.ts'),
        name: 'SentryMiniapp',
      },
      outDir: 'dist',
      rolldownOptions: {
        external: [],
        output: [
          {
            format: 'es',
            entryFileNames: 'sentry-miniapp.mjs',
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
            globals: {}
          },
        ]
      }
    },
    plugins: [
      transformGenerators(),
      bundledNotices(),
      // 生成 TypeScript 类型定义文件
      dts({
        include: ['src/**/*'],
        exclude: ['src/**/*.test.ts', 'test/**/*'],
        outDirs: 'dist/types'
      })
    ],
    define: {
      __DEV__: mode === 'development'
    }
  };
});
