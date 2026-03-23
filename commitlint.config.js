module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 强制使用中文描述 (通过正则检查 subject 是否包含中文字符)
    // 0: disable, 1: warning, 2: error
    'subject-is-chinese': [2, 'always']
  },
  plugins: [
    {
      rules: {
        'subject-is-chinese': ({ subject }) => {
          // 如果没有 subject（比如还没写完），直接放行交给其他规则校验
          if (!subject) return [true];
          // 匹配是否包含至少一个汉字串
          const hasChinese = /[\u4e00-\u9fa5]/.test(subject);
          return [
            hasChinese,
            `提交信息(subject)必须包含中文描述，以保证 CHANGELOG 自动生成的纯净度。\n你的提交: ${subject}\n正确示例: feat: 新增网络请求抓取功能`
          ];
        }
      }
    }
  ]
};