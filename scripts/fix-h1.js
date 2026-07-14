// 使用 Hexo 官方的 Injector 功能，只在首页注入隐藏的 H1
hexo.extend.injector.register(
  'body_begin',  // 注入位置：<body> 标签之后[reference:1]
  '<h1 style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;margin:0;padding:0;">MSQY - 技术博客与生活分享</h1>',
  'home'         // 只有首页 (is_home() 为 true) 才会注入[reference:2]
);