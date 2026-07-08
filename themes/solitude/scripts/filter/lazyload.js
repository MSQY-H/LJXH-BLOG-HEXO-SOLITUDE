//修改(-)
/*
'use strict'

const lazyload = (content, img) => {
    return content.replace(/(<img(?!.*?class[\t]*=[\t]*['"].*?nolazyload.*?['"]).*? src=)/gi, `$1 "${img}" data-lazy-src=`)
}

hexo.extend.filter.register('after_render:html', function (data) {
    const { enable, placeholder ,field } = hexo.theme.config.lazyload
    if (!enable || field !== 'site') return;
    return lazyload(data, placeholder)
})

hexo.extend.filter.register('after_post_render', data => {
    const { enable, placeholder, field } = hexo.theme.config.lazyload
    if (!enable || field !== 'post') return
    data.content = lazyload(data.content, placeholder)
    return data
})
*/
//(+)
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
//结束