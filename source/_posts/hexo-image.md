---
title: Hexo图片引用相关问题
date: 2026-07-06 20:38:46
description: 关于Hexo的图片引用
tags:
  - Hexo
  - Solitude
categories:
  - 技术
cover: cover.webp
comments: true
ai_text: Hexo引用图片时默认指向主题目录，文章资源文件夹默认配置也不完美。本文介绍了三种方案：图床、标签插件和Markdown嵌入插件，并针对封面图路径问题提供了一个自动转换脚本，简化了资源管理流程。适合折腾Hexo图片引用的用户参考。
---
## 写在前面

这几天在搞 Hexo 的 Solitude 主题，最后写文章时遇见了个问题：就是**图片的引用**。

Hexo很神奇，如果有主题，通过`/img/1.webp`来引用图片，引用的不是根目录下的 source 文件夹中的 img 文件夹，而是主题目录下的 source 文件夹中的 img 文件夹。更直观的说：

- ❌ `博客根目录/source/img/1.webp`
- ✔️ `博客根目录/themes/solitude/source/img/1.webp`

直接把图片放在主题的 source 文件夹也不是不行，就是感觉有点怪怪的，更新主题时也有被覆盖的风险。还是放在根目录的 source 文件夹好一点。

在必应查了下，发现 Hexo 配置文件中有这么一项：

``` YML
post_asset_folder: false
```

调成`true`，Hexo CLI 会在`hexo new post 文章标题`时在根目录的`resource/_posts`下生成一个与文章标题名称一样的文件夹，用作每个文章的资源文件夹。

这下好多了，至少管理文章资源时舒服很多。

但是，

> 当你打开文章资源文件夹功能后，你把一个 example.jpg 图片放在了你的资源文件夹中，如果通过使用相对路径的常规 markdown 语法`![](example.jpg)`，它将**不会**出现在首页上。<br>——[Hexo官方文档](https://hexo.io/zh-cn/docs/asset-folders)

这就麻烦了。不过，我找到了几个解决方法。

## 文章详情页引用

### 1.使用图床

这可能是大多数人选择的方式。把图片上传到图床，直接用`[](图片链接)`引用。很方便，但是图床可能会跑路，比较不稳定，还是放在自己服务器上好。{% spoiler 'blur' '反正cloudflare带宽无限' %}

### 2. 相对路径引用的标签插件

Hexo 3 的更新带来了许多标签插件，可以用

``` Markdown
{% asset_img example.jpg This is an example image %}
{% asset_img "spaced asset.jpg" "spaced title" %}
```

来引用资源文件夹的图片。

确实是种方法，但只能在 Hexo 中使用。

### 3.使用 Markdown 嵌入图片

我选择这种方式。

先安装`hexo-renderer-marked`插件：

{% tabs 安装插件 %}

<!-- tab npm -->

``` Shell
npm install hexo-renderer-marked --save
```

<!-- endtab -->

<!-- tab pnpm -->

``` Shell
pnpm add hexo-renderer-marked
```

<!-- endtab -->

<!-- tab yarn -->

``` Shell
yarn add hexo-renderer-marked
```

<!-- endtab -->

{% endtabs %}

在`_config.yml`中写入：

``` Yml
post_asset_folder: true
marked:
  prependRoot: true
  postAsset: true
```

这样你就可以直接通过`![](example.jpg)`直接引用文章资源文件夹的图片了（`博客根目录/source/_post/文章文件名/example.jpg`）。

假设 Hexo 三连后`image.jpg`的位置为`/2026/07/05/foo/image.jpg`，这表示它是`/2026/07/05/foo/`文章的一张资源图片，`![](image.jpg)`将会被解析为 `<img src="/2020/01/02/foo/image.jpg">`。

舒服！但是，这有一个问题。

## 文章封面图与其他页面的引用

`hexo-renderer-marked`插件是不会将`frontmatter`的`cover`或类似字段解析的，这意味着，如果你在`frontmatter`写`cover: image.jpg`，那它就指的是`博客根目录/themes/solitude/source/image.jpg`。但是我们想要它指向文章的资源文件夹内的图片，这就难搞了。

### 1. 使用图床

和上面一样，不多说了。直接写图片链接。

### 2. 根据permalink计算实际路径

Permalink 是啥？

{% link '永久链接（Permalinks…' '介绍了如何在 Hexo 中配置和自定义永久链接…' 'https://hexo.io/zh-cn/docs/permalinks' %}

默认配置是`permalink: :year/:month/:day/:title/`

假设你的`foo`文章的图片`image.jpg`在三连后的位置是 /2026/07/05/foo/image.jpg ，那么在`cover`字段你应该写的路径是`/2026/07/05/foo/image.jpg`。

每次都这么算，太麻烦了，怎么办？

### 3. 使用脚本

不知道是我的问题还是必应的问题，我一直都没有搜到很合适的方法。

Vibe Coding 启动！{% spoiler 'blur' '梁圣真是大善人✋😭✋' %}

通过我与 Deepseek 10 分钟的交流，也是成功写了个脚本，放在`博客根目录/scripts/cover-path.js`。

``` JavaScript
hexo.extend.filter.register('before_post_render', function(data) {
  if (data.cover && !data.cover.startsWith('http') && !data.cover.startsWith('/')) {
    // data.path 例如 "2026/07/05/foo/index.html"
    let dir = data.path.replace(/\/index\.html$/, '').replace(/\.html$/, '');
    if (!dir.endsWith('/')) dir += '/';
    data.cover = '/' + dir + data.cover;
    console.log(`[转换] ${data.title} -> ${data.cover}`);
  }
  return data;
});
```

第一行的

``` JavaScript
hexo.extend.filter.register('before_post_render', function(data) {
```

表示向 Hexo 注册一个过滤器，在文章渲染前执行。在文章渲染前，这个脚本会读取`cover`字段和文章路径，如果`cover`字段不是`http`或`/`开头，就将你本来写的`image.jpg`转换为`/2026/07/05/foo/image.jpg`。

不用自己算了，太方便了。以后直接写封面文件名就行了。

## 写在最后

Hexo 的图片引用问题总算搞定了，现在引用文章图片更方便了。

不过 vibe coding 可能会有 bug ，对于一些情况处理不太好，建议还是自己检查一下比较好。

如果遇到脚本处理不了的问题，欢迎发邮件给我[点击发送](mailto:LJXH_H@outlook.com)

后续我打算写几个 Hexo 相关问题的记录，再说说我的博客的方案。随缘更新。