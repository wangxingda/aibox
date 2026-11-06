# 灵感页参考记录

参考 `https://x2v.light-ai.top/explore`，本地路由 `/explore`，页面组件 `src/components/sites/aibox/inspiration.tsx`，接入现有 `Workspace` 导航。参考站桌面结构：双栏推荐横幅、六个创作快捷入口、横向分类与搜索、五列瀑布流；移动端保留单个横幅、横向滚动快捷入口及两列卡片。点击作品可进入详情；本地使用弹窗展示预览及站内创作入口。

`assets.json` 记录原始素材 URL 到 `public/sites/light-explore/` 的映射。15 张作品封面及顶部配图为浏览器中实际加载的图片；作品采用本地静态样本，搜索和分类作用于这些样本，不连接参考站社区 API。参考站视频预览、作者信息及动态作品未接入。

桌面截图 `source-desktop.png`、`local-desktop.png`；移动端截图 `source-mobile.png`、`local-mobile.png`。本地适配原有侧边栏与顶部导航，因此尺寸和外壳与参考站有区别。
