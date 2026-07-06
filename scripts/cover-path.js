hexo.extend.filter.register('before_post_render', function(data) {
  if (data.cover && !data.cover.startsWith('http') && !data.cover.startsWith('/')) {
    // data.path 例如 "2026/07/05/2fa/index.html"
    let dir = data.path.replace(/\/index\.html$/, '').replace(/\.html$/, '');
    if (!dir.endsWith('/')) dir += '/';
    data.cover = '/' + dir + data.cover;
    console.log(`[转换] ${data.title} -> ${data.cover}`);
  }
  return data;
});