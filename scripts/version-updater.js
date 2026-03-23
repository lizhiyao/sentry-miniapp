/**
 * commit-and-tag-version 自定义版本更新器
 * 用于自动同步 src/version.ts 中的 SDK_VERSION
 */
module.exports.readVersion = function (contents) {
  const match = contents.match(/SDK_VERSION\s*=\s*'([^']+)'/);
  return match ? match[1] : undefined;
};

module.exports.writeVersion = function (contents, version) {
  return contents.replace(
    /SDK_VERSION\s*=\s*'[^']+'/,
    `SDK_VERSION = '${version}'`,
  );
};
