---
title: 第一篇文章
date: 2026-06-12 10:00:00
updated: 2026-07-05 16:45:00
description: 第一篇文章。
tags:
  - Hexo
  - Solitude
categories:
  - 博客
cover: /img/d1.webp
comments: true
ai_text: 咕咕嘎嘎！AI测试！
---
## 欢迎来到第一篇文章！

> 本文旨在逐一测试 `solitude` 主题文档中列出的所有外挂标签，同时兼顾 Hexo 原生 Markdown 语法。文章内容基于真实生活片段，每个标签都配有实际示例，助你快速上手。

---

## 一、早起，先来点基础 Markdown 热身 🌅

早上 7:00，被闹钟叫醒。我习惯用 **Markdown** 记录待办事项：

- [ ] 晨跑 5 公里（**已完成**）
- [x] 写一篇全标签测试文章（*正在做*）
- [ ] 整理上周的读书笔记

> 今日格言：`代码` 是理性的诗，生活是感性的画。

接着，我用一个表格规划今天的三餐：

| 时段 | 菜单 | 热量(千卡) |
|------|------|------------|
| 早餐 | 燕麦粥+鸡蛋 | 350 |
| 午餐 | 鸡胸肉沙拉 | 420 |
| 晚餐 | 清蒸鱼+蔬菜 | 480 |

以下是今天要用的代码片段（展示 Hexo 代码块）：
```yaml
# _config.yml 片段
theme: solitude
language: zh-CN
```

---

## 二、内置标签初体验（无需插件）

1. Charts – 展示我的运动数据



2. Gallery – 随手拍的早餐照片

用图片列表展示早餐美图（占位图示例）。

{% gallery %}
https://picsum.photos/200/150?random=1
https://picsum.photos/200/150?random=2
https://picsum.photos/200/150?random=3
{% endgallery %}

3. GalleryGroup – 周末出游相册

将一次近郊游的照片归组。

{% galleryGroup '春日山行' '2026.05.16 摄于西山' 'https://solitude.js.org' 'https://picsum.photos/400/300?random=4' %}

4. Mermaid – 绘制今日流程图

需要开启 mermaid。我用它画一个简单的晨间决策图。



5. Typeit – 一句早安问候

需要开启 typeit。它会像打字机一样逐字出现。


6. Tabs – 今日书影音推荐

用标签页切换不同类别的推荐内容。

{% tabs 今日推荐 %}

<!-- tab 书籍 -->

《百年孤独》—— 马尔克斯的魔幻世界。

<!-- endtab -->

<!-- tab 电影 -->

《星际穿越》—— 诺兰的时空史诗。

<!-- endtab -->

<!-- tab 音乐 -->

《Lofi Girl》直播 —— 专注学习伴侣。

<!-- endtab -->

{% endtabs %}

---

## 三、插件标签大集合（需安装对应插件）

7. Bubble – 给文字加注小提示

给关键词添加浮动解释。

这是一段关于
{% bubble '心流' '🌟' 'blue' %}
的文字描述，当你悬浮时能看到提示。

8. Button – 一个带链接的按钮

点击跳转到我的 GitHub。

{% button 'fab fa-github' '访问我的GitHub' 'https://github.com/MSQY-H' %}

9. Card – 展示一本我爱读的书

用卡片形式展示书籍信息。

{% card '钢铁是怎样炼成的','https://book.qidian.com/info/1023889158/','https://bookcover.yuewen.com/qdbimg/349573/1023889158/300','4.5','《钢铁是怎样炼成的》是苏联作家尼古拉·奥斯特洛夫斯基创作的自传体长篇小说。','fa-solid fa-book-open','小说' %}

10. Checkbox – 今日任务清单

用复选框标记已完成和待办。

{% checkbox 'circle' checked '完成所有标签测试' %}

{% checkbox 'circle' '' '备份博客源码' %}

{% checkbox 'square' '' '写一篇周记' %}

11. Fold – 折叠一段深夜碎碎念

默认收起的情绪记录。

{% fold '点击展开我的小情绪' %}
今天测试标签的时候，发现 Mermaid 图表真的很方便，但配置时要注意缩进。生活也是这样，细节决定质感。
{% endfold %}

12. Img – 带样式的图片

控制图片显示大小和样式。

{% img 'https://picsum.photos/600/400?random=5' '随机风景' 'width:80%;border-radius:10px;' %}

13. Inline Img – 行内小图标

在段落中插入一个小图标，比如表示“重要”。

这是一段文字，里面有个重要标记 {% inline_img 'https://picsum.photos/20/20?random=6' 'important' 'display:inline;width:20px;vertical-align:middle;' %} 请注意这里。

14. Keyboard – 快捷键提示

写作时常用的保存快捷键。

按下 {% keyboard 'Ctrl+S' %} 即可快速保存文章。

15. Link – 显示链接卡片

展示一个带标题和描述的链接。

{% link 'Solitude主题文档' '官方使用指南' 'https://blog.starsharbor.com/solitude/' %}

16. Media 系列 – 影音娱乐

Audio – 一首背景音乐

{% audio 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' %}

Bilibili – 我喜欢的UP主视频

{% bvideo 'BV1Ek4y1r7Rg' %}

Video – 本地视频示例

{% video 'https://www.w3schools.com/html/mov_bbb.mp4' %}

Videos – 视频列表（两列）

{% videos 2 %}
{% video 'https://www.w3schools.com/html/mov_bbb.mp4' %}
{% video 'https://www.w3schools.com/html/mov_bbb.mp4' %}
{% endvideos %}

17. Note – 各种提示框

展示不同风格的提示。

{% note 'primary' 'fa-solid fa-circle-info' %}
主要提示：本文章所有标签均基于 solitude 主题文档编写。
{% endnote %}

{% note 'success' 'fa-solid fa-circle-check' %}
成功：已测试完成大部分标签。
{% endnote %}

{% note 'warning' 'fa-solid fa-triangle-exclamation' %}
警告：部分标签需要先在配置中开启。
{% endnote %}

{% note 'danger' 'fa-solid fa-circle-xmark' %}
危险：别忘记备份你的文章！
{% endnote %}

18. Repo 仓库展示 – 我的代码库

Github

{% github 'hexojs/hexo' %}

Gitea（假设自建服务）

{% gitea 'https://git.example.com' 'user/repo' %}

Gitee

{% gitee 'oschina/git-osc' %}

Gitlab

{% gitlab '12345678' %}

---

## 四、文字样式与特殊排版

19. P – 独立成行的特殊文本

使用不同类名展示样式。

{% p 'center' '居中对齐的段落' %}
{% p 'red' '红色强调文字' %}
{% p 'huge' '巨大字号标题' %}

20. Span – 行内样式

在一句话中局部改变样式。

这是一句普通文字，{% span 'yellow' '其中这段被标黄' %}，还有{% span 'blue' '蓝色片段' %}。

21. Spoiler – 剧透内容

两种风格：模糊和方块。

以下内容涉及剧透，请谨慎观看：

· 模糊风格：{% spoiler 'blur' '凶手是管家' %}
· 方块遮盖：{% spoiler 'block' '结局是开放式' %}

22. Timeline – 记录今天的时间轴

完整回顾我的一天。

{% timeline '今日时间轴' %}

<!-- timeline 07:00 -->

起床，查看天气，决定去跑步。

<!-- endtimeline -->

<!-- timeline 08:30 -->

跑完步，冲澡，吃早餐（燕麦粥+鸡蛋）。

<!-- endtimeline -->

<!-- timeline 10:00 -->

开始写这篇测试文章，逐一试用标签。

<!-- endtimeline -->

<!-- timeline 15:00 -->

午休后，继续测试Media和Repo标签。

<!-- endtimeline -->

<!-- timeline 20:00 -->

完成所有测试，准备发布文章！

<!-- endtimeline -->

{% endtimeline %}

---

## 五、收尾与检查 ✅

至此，我完成了文档中列出的所有外挂标签的测试，同时也覆盖了标题、列表、引用、代码块、表格、粗体斜体、图片、链接、分割线等 Hexo 原生 Markdown 语法。

小贴士：如果某些标签未正常显示，请确认 _config.yml 中对应的开关（如 charts、mermaid、typeit）已开启，并已安装所需的插件。

最后，用一条分割线结束这篇全功能测试文。

---

感谢阅读！祝你博客之旅愉快。 🚀

