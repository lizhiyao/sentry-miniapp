import { defineConfig } from 'vitepress';

const GITHUB = 'https://github.com/lizhiyao/sentry-miniapp';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: 'sentry-miniapp',
  description:
    '跨端小程序 Sentry SDK — 微信 / 支付宝 / 字节跳动 / 钉钉 / QQ / 百度 / 快手 + Taro / uni-app，异常、性能与网络监控开箱即用。',
  base: '/', // Cloudflare Pages 部署在根域，无子路径
  lastUpdated: true,
  cleanUrls: true,
  srcExclude: ['README.md'], // 站点说明文档，不作为页面构建
  head: [['link', { rel: 'icon', href: '/logo.png' }]],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: '指南', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: '常见问题', link: '/guide/faq' },
      { text: '示例', link: '/guide/examples' },
      { text: 'npm', link: 'https://www.npmjs.com/package/sentry-miniapp' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '快速接入', link: '/guide/getting-started' },
            { text: '支持平台与能力', link: '/guide/platforms' },
          ],
        },
        {
          text: '框架接入',
          items: [
            { text: 'Taro（React）', link: '/guide/taro' },
            { text: 'uni-app（Vue）', link: '/guide/uniapp' },
          ],
        },
        {
          text: '进阶',
          items: [
            { text: '常见问题 (FAQ)', link: '/guide/faq' },
            { text: 'Source Map 配置', link: '/guide/sourcemap' },
            { text: '示例工程', link: '/guide/examples' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: GITHUB }],

    search: { provider: 'local' },

    outline: { label: '本页目录', level: [2, 3] },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdatedText: '最后更新',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',

    editLink: {
      pattern: `${GITHUB}/edit/master/website/:path`,
      text: '在 GitHub 上编辑此页',
    },

    footer: {
      message: '基于 @sentry/core 的跨端小程序 SDK · MIT Licensed',
      copyright: `Copyright © 2020-present <a href="${GITHUB}">sentry-miniapp</a>`,
    },
  },
});
