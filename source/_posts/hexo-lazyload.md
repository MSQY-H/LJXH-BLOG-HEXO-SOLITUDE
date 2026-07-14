---
title: Hexo Solitude 博客懒加载的问题与解决
date: 2026-07-12 17:47:00
description: Hexo Solitude 主题懒加载功能的问题与解决方案
tags:
  - Hexo
  - Solitude
categories:
  - 技术
cover: cover.webp
comments: true
ai_text: Hexo Solitude 主题懒加载配置为 site 时导致页面崩溃，根源是主题用正则处理 HTML 易出错。解决方案：安装 cheerio 库，重写 lazyload.js，改用 cheerio 操作 DOM 实现图片懒加载，并分别注册全站和文章过滤器，问题解决。
---
## 写在前面

配置过 Solitude 主题的都知道， Solitude 主题有图片懒加载功能。配置如下：

``` Yaml
lazyload:
  enable: true
  field: site
  placeholder: ""
  errorimg: /img/error_load.webp
```

在我的环境下：

- Node.js 版本：24.17.0
- Yarn 版本：4.17.0
- Hexo 版本：7.3.0
- Solitude 版本：3.0.21
- 预览方式：`hexo g && npx serve public`

`field` 配置为 `post` 时，图片懒加载完全没问题，只是文章以外的其它页面就没有懒加载。

`field` 配置为 `site` 时，网站就会崩溃，就跟我的单页网站缺少了 js 一样，什么都点不了。

我们想要完整的图片懒加载，怎么办？

## 解决方案

### 1. 使用 `post` 模式

懒得改主题源码，就用 `post` 模式吧。

但是，愿意折腾的我们，怎么能安于现状？

### 2. 修改主题源码

打开 `博客根目录/themes/solitude/scripts/filter/lazyload.js`

源代码直接使用正则表达式操作 html 实现懒加载：

``` JavaScript
const lazyload = (content, img) => {
    return content.replace(/(<img(?!.*?class[\t]*=[\t]*['"].*?nolazyload.*?['"]).*? src=)/gi, `$1 "${img}" data-lazy-src=`)
}
```

html 千变万化，正则可能破坏掉 html 标签导致页面出现错误，可能波及 `<scripts>` 标签。{% spoiler 'blur' '祖传代码发力了（' %}

至于 `post` 模式能用，应该是因为 `post` 模式处理的文章界面相对简单，正则刚好可以处理

所以要换种处理方式，用 `cheerio` 这种成熟的处理 html 的库。

{% note 'warning modern' 'fas fa-warning' %}
以下代码针对我的开发环境编写，不一定通用，并非官方方案，此脚本仅作参考。
{% endnote %}

先安装 `cheerio` 库。

{% tabs 安装插件 %}

<!-- tab npm -->

``` Shell
npm install cheerio --save
```

<!-- endtab -->

<!-- tab pnpm -->

``` Shell
pnpm add cheerio
```

<!-- endtab -->

<!-- tab yarn -->

``` Shell
yarn add cheerio
```

<!-- endtab -->

{% endtabs %}

然后将 `博客根目录/themes/solitude/scripts/filter/lazyload.js` 全部替换为以下代码：

``` JavaScript
'use strict'

const cheerio = require('cheerio');

const lazyload = (content, imgUrl) => {
  const $ = cheerio.load(content, { decodeEntities: false });
  // 选取所有 img，排除带有 nolazyload 类的图片
  $('img:not(.nolazyload)').each((i, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    // 跳过 base64、svg 或已经带 data-lazy-src 的图片
    if (src && !src.startsWith('data:') && !$el.attr('data-lazy-src')) {
      $el.attr('data-lazy-src', src); // 存真实地址
      $el.attr('src', imgUrl);        // 替换为占位图
    }
  });
  return $.html();
}

// 注册全站过滤器 (site)
hexo.extend.filter.register('after_render:html', function (data) {
  const { enable, placeholder, field } = hexo.theme.config.lazyload;
  if (!enable || field !== 'site') return;
  return lazyload(data, placeholder);
});

// 保留 post 过滤器（以防你切换）
hexo.extend.filter.register('after_post_render', data => {
  const { enable, placeholder, field } = hexo.theme.config.lazyload;
  if (!enable || field !== 'post') return;
  data.content = lazyload(data.content, placeholder);
  return data;
});
```

然后预览：

``` Shell
hexo cl
hexo g
npx serve public
```

现在懒加载正常了！🎉🎉🎉

## 总结

经过我们的不懈努力，Hexo Solitude 主题的懒加载终于正常了！

这个问题根源在于正则不适合处理 html，而主题刚好采用了这种方式。也许在别人那刚好能用，到我这里刚好用不了吧。

✨