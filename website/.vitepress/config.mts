import { defineConfig } from 'vitepress';

const GITHUB = 'https://github.com/lizhiyao/sentry-miniapp';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: 'sentry-miniapp',
  description:
    '基于 @sentry/core 的跨端小程序与小游戏监控 SDK，支持异常、性能、日志、离线缓存、链路追踪，以及 Taro / uni-app。',
  base: '/', // Cloudflare Pages 部署在根域，无子路径
  lastUpdated: true,
  cleanUrls: true,
  srcExclude: ['README.md'], // 站点说明文档，不作为页面构建
  head: [['link', { rel: 'icon', href: '/logo.png' }]],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: '快速接入', link: '/guide/getting-started' },
      {
        text: '能力指南',
        items: [
          { text: '异常、日志与上下文', link: '/guide/errors-and-context' },
          { text: '性能与链路追踪', link: '/guide/performance-and-tracing' },
          { text: '可靠上报与隐私同意', link: '/guide/reliability-and-privacy' },
        ],
      },
      {
        text: 'API 与配置',
        items: [
          { text: '常用 API', link: '/guide/api' },
          { text: '配置项参考', link: '/guide/configuration' },
          { text: '支持范围', link: '/guide/platforms' },
          { text: 'npm 包', link: 'https://www.npmjs.com/package/sentry-miniapp' },
        ],
      },
      { text: 'Source Map', link: '/guide/sourcemap' },
      { text: '排障', link: '/guide/faq' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '开始使用',
          items: [
            { text: '它适合我吗？', link: '/guide/when-to-use' },
            { text: '快速接入（原生小程序）', link: '/guide/getting-started' },
            { text: 'Taro（React）', link: '/guide/taro' },
            { text: 'uni-app（Vue）', link: '/guide/uniapp' },
            { text: '小游戏接入与性能', link: '/guide/minigame' },
            { text: '示例工程', link: '/guide/examples' },
          ],
        },
        {
          text: '能力指南',
          items: [
            { text: '异常、日志与上下文', link: '/guide/errors-and-context' },
            { text: '性能与链路追踪', link: '/guide/performance-and-tracing' },
            { text: '可靠上报与隐私同意', link: '/guide/reliability-and-privacy' },
          ],
        },
        {
          text: '生产上线',
          items: [
            { text: '配置项参考', link: '/guide/configuration' },
            { text: 'Source Map 上线指南', link: '/guide/sourcemap' },
            { text: 'Source Map 进阶与排障', link: '/guide/sourcemap-advanced' },
            { text: '主包体积优化', link: '/guide/bundle-size' },
          ],
        },
        {
          text: '参考与排障',
          items: [
            { text: '常用 API', link: '/guide/api' },
            { text: '支持范围', link: '/guide/platforms' },
            { text: '跨平台差异与降级', link: '/guide/platform-compatibility' },
            { text: '常见问题 (FAQ)', link: '/guide/faq' },
            { text: '工作原理', link: '/guide/how-it-works' },
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
      message: '基于 @sentry/core 的跨端小程序与小游戏 SDK · MIT Licensed',
      copyright: `Copyright © 2019-present <a href="${GITHUB}">sentry-miniapp</a>`,
    },
  },
});
