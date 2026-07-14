'use strict';
const cheerio = require('cheerio');

// 在生成 HTML 后执行，给所有缺少 alt 的 img 补上 alt（优先使用 title）
hexo.extend.filter.register('after_render:html', function (data) {
  const $ = cheerio.load(data, { decodeEntities: false });

  // 选择所有没有 alt 属性的 img
  $('img:not([alt])').each((i, el) => {
    const $el = $(el);
    // 如果有 title 属性则直接用，否则用默认文案
    const title = $el.attr('title');
    $el.attr('alt', title || '图片');
  });

  return $.html();
});