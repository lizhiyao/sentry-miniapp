/** Taro 公共插件入口；解析器仅在 Node 的编译阶段加载。 */
module.exports = function wechatReplayTaroPlugin(ctx, options = {}) {
  ctx.modifyRunnerOpts(({ opts }) => {
    if (process.env.TARO_ENV === 'weapp') (opts.runtime ||= {}).enableMutationObserver = true;
  });
  ctx.modifyWebpackChain(({ chain }) => {
    if (process.env.TARO_ENV !== 'weapp') return;
    // 从业务项目解析同一份 Taro，避免严格依赖布局下引入另一份运行时。
    chain.resolve.alias.set(
      'sentry-miniapp-taro-host',
      require('node:path').dirname(
        require.resolve('@tarojs/runtime/package.json', { paths: [ctx.paths.appPath] }),
      ),
    );
    chain.plugin('sentry-miniapp-wechat-replay').use(
      class {
        apply(compiler) {
          new compiler.webpack.EntryPlugin(
            ctx.paths.appPath,
            require.resolve('./replay-taro-runtime.cjs'),
            { name: 'app' },
          ).apply(compiler);
          const name = 'sentry-miniapp-wechat-replay';
          const previous = new Map();
          compiler.hooks.thisCompilation.tap(name, (compilation) => {
            compilation.hooks.processAssets.tapPromise(
              {
                name,
                stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT + 1,
              },
              async () => {
                const { instrumentWechatAssets } =
                  await import('../dist/sentry-miniapp-replay-tools.mjs');
                const clean = { ...compilation.assets };
                for (const [file, cached] of previous) {
                  if (clean[file]?.source().toString() === cached.output)
                    clean[file] = new compiler.webpack.sources.RawSource(cached.input);
                }
                const changed = await instrumentWechatAssets(clean, options);
                for (const [file] of previous)
                  if (clean[file] && !changed.has(file)) compilation.updateAsset(file, clean[file]);
                previous.clear();
                for (const [file, content] of changed) {
                  previous.set(file, { input: clean[file].source().toString(), output: content });
                  compilation.updateAsset(file, new compiler.webpack.sources.RawSource(content));
                }
              },
            );
          });
        }
      },
    );
  });
};
