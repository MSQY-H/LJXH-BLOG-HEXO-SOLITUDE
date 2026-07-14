'use strict';
const cheerio = require('cheerio');

hexo.extend.filter.register('after_render:html', function (data) {
  const $ = cheerio.load(data, { decodeEntities: false });
  $('img:not([alt])').each((i, el) => {
    const $el = $(el);
    const title = $el.attr('title');
    $el.attr('alt', title || '图片');
  });
  return $.html();
});