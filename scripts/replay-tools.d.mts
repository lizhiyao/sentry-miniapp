/** Node 构建工具；在微信项目编译之后、上传之前处理独立项目副本。 */
export function instrumentWechatProject(options: {
  input: string;
  output: string;
  pages: string[];
  framework?: 'taro';
}): Promise<{ output: string; pages: string[]; files: string[] }>;

/** uni-app Vue 3 / Vite：微信构建自动生成标记，默认处理全部页面；其它目标跳过。 */
export function wechatReplayVitePlugin(options?: { pages?: string[] }): {
  name: string;
  apply: 'build';
  enforce: 'post';
  configResolved(config: { root: string; build: { outDir: string } }): void;
  writeBundle: { order: 'post'; sequential: true; handler(): Promise<void> };
};

/** Taro 插件使用的 Webpack 资产转换；返回修改后的 WXML。 */
export function instrumentWechatAssets(
  assets: Record<string, { source(): string | Uint8Array }>,
  options?: { pages?: string[] },
): Promise<Map<string, string>>;
