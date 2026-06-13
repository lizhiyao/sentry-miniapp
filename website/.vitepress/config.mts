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
      { text: 'npm', link: 'https://www.npmjs.com/package/sentry-miniapp' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '接入',
          items: [
            { text: '快速接入（原生小程序）', link: '/guide/getting-started' },
            { text: 'Taro（React）', link: '/guide/taro' },
            { text: 'uni-app（Vue）', link: '/guide/uniapp' },
            { text: '示例工程', link: '/guide/examples' },
          ],
        },
        {
          text: '配置指南',
          items: [
            { text: '配置项参考', link: '/guide/configuration' },
            { text: 'Source Map 配置', link: '/guide/sourcemap' },
            { text: '主包体积优化', link: '/guide/bundle-size' },
          ],
        },
        {
          text: '参考',
          items: [
            { text: '它适合我吗？（选型与限制）', link: '/guide/when-to-use' },
            { text: '工作原理', link: '/guide/how-it-works' },
            { text: '支持平台与能力', link: '/guide/platforms' },
            { text: '常见问题 (FAQ)', link: '/guide/faq' },
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
      copyright: `Copyright © 2019-present <a href="${GITHUB}">sentry-miniapp</a>`,
    },
  },
});
