/** Taro 4 / webpack5 插件，微信构建自动生成回放标记；其它目标跳过。 */
declare function wechatReplayTaroPlugin(
  ctx: {
    paths: { appPath: string };
    modifyRunnerOpts(
      callback: (args: { opts: { runtime?: { enableMutationObserver?: boolean } } }) => void,
    ): void;
    modifyWebpackChain(
      callback: (args: {
        chain: {
          resolve: { alias: { set(name: string, path: string): unknown } };
          plugin(name: string): { use(plugin: unknown): unknown };
        };
      }) => void,
    ): void;
  },
  options?: { pages?: string[] },
): void;
export = wechatReplayTaroPlugin;
