import { defineConfig } from 'vitepress';

const GITHUB = 'https://github.com/lizhiyao/sentry-miniapp';
const SITE_URL = 'https://sentry-miniapp.pages.dev';

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
  head: [
    ['link', { rel: 'icon', href: '/logo.png' }],
    // Search Console 持续通过此标签确认站点所有权。
    [
      'meta',
      { name: 'google-site-verification', content: 'XUylOdAYB-kXIXINMs7motMiKikZjlztkeZXf99uW_g' },
    ],
  ],
  sitemap: { hostname: SITE_URL },
  transformHead({ pageData }) {
    if (pageData.relativePath === '404.md') return [];
    const pagePath = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    return [['link', { rel: 'canonical', href: new URL(pagePath, `${SITE_URL}/`).href }]];
  },

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
          { text: '微信页面回放（实验性）', link: '/guide/page-replay' },
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
            { text: '微信页面回放（实验性）', link: '/guide/page-replay' },
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
          text: '升级与迁移',
          collapsed: true,
          items: [
            { text: '升级到 2.0', link: '/guide/migration-2.0' },
            { text: '从 1.18 及更早版本升级', link: '/guide/migration-1.19' },
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

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            displayDetails: '显示详细列表',
            resetButtonTitle: '清空搜索',
            backButtonTitle: '关闭搜索',
            noResultsText: '未找到相关结果',
            footer: {
              selectText: '选择',
              selectKeyAriaLabel: '回车键',
              navigateText: '切换',
              navigateUpKeyAriaLabel: '向上键',
              navigateDownKeyAriaLabel: '向下键',
              closeText: '关闭',
              closeKeyAriaLabel: 'Esc 键',
            },
          },
        },
      },
    },

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
