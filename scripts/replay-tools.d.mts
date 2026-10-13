/** Node 构建工具；在微信项目编译之后、上传之前处理独立项目副本。 */
export function instrumentWechatProject(options: {
  input: string;
  output: string;
  pages: string[];
}): Promise<{ output: string; pages: string[]; files: string[] }>;
