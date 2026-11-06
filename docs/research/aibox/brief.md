# AIReel 中文首页

Source: https://www.aireel.net/zh → local `/zh` (also available at `/`). Implementation: `src/components/sites/aibox/home.tsx`, `src/app/globals.css`. Assets: `public/sites/aibox/`.

Observed desktop at 1188 × 691: announcement bar, transparent navigation, 656px video hero with 64px italic heading, horizontal model list, animated template strip, six alternating feature rows, use cases, metrics, testimonials, FAQ, final CTA and footer. Primary links lead to the original service. Feature images originate from `https://res.aireel.net/aireel-webapp/static/feature-story/`; template WebP files originate from `https://res.aireel.net/prod/resource/`; hero video and poster originate from `https://res.aireel.net/aireel-webapp/static/`.

The source has animated and lazy-loaded content. The captured full-page source image was taken before all scroll reveals completed, so empty areas in that image do not represent intentional page spacing. The local implementation approximates the model icons, testimonial portraits and footer rather than reproducing all original artwork and motion.

## 创作工作台（2026-11-05）

通过 Edge 检查了 `/zh/create`、`/zh/image-to-video`、`/zh/image-edit`、`/zh/ai-tools`、`/zh/effects` 和 `/zh/my` 的桌面首屏。共享导航为首页、视频、图片、工作室、玩法模板和资产。视频及图片页面采用左侧表单和右侧参考示例；资产未登录时展示登录提示。实现位于 `src/components/sites/aibox/workspace.tsx` 和 `workspace.css`，路由位于 `src/app/zh/[section]/page.tsx`。

模板图片使用首页已提取的原站 WebP；工作室和参考示例暂借用这些图片，未提取对应页面的原始媒体。登录、生成和账户数据未接入原站服务，设置选项与分类展示为界面近似实现。
