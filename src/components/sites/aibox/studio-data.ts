export type StudioTool = { slug: string; title: string; description: string; image: string; mode?: string; prompt?: string; note?: string; fresh?: boolean; group?: 'marketing' | 'avatar' };
const image = (name: string) => `/sites/aibox/studio/${name}`;
export const studioTools: StudioTool[] = [
 {slug:'ai-genjutsu-video-edit',title:'AI Genjutsu视频魔改',description:'随心改变视频人物与场景，让创意突破现实。',image:image('f820e01a3ff3.webp'),note:'视频整体重绘与多参考图编辑需要专用视频编辑工作流。'},
 {slug:'ai-ad-generator',title:'AI广告生成器',description:'为您的网店制作吸引人的产品视频和促销海报。',image:image('2e9d33b0a0ef.webp'),mode:'image-to-video',prompt:'围绕参考商品制作精致的商业广告视频，突出商品细节，镜头运动自然，灯光明亮，画面具有高级商业摄影质感。',note:'目前可通过参考图生成广告视频；自动编排商品广告和精确商品一致性尚未接入。',group:'marketing'},
 {slug:'ai-product-poster',title:'AI 产品海报',description:'将商品图片变成吸睛海报，用于电商营销活动。',image:image('7cbe0cc2e569.jpg'),mode:'image-edit',prompt:'以参考商品为主体，设计一张精致的商业产品海报，保留商品外观与标识，调整背景、灯光和构图，留出广告文案空间。',note:'使用图片编辑工作流生成海报，商品细节与文字准确性取决于模型。',group:'marketing'},
 {slug:'ai-video-clone',title:'AI广告视频复刻',description:'看中哪个视频，就用自己的商品演绎同款创意广告。',image:image('10430ee330da.webp'),note:'根据参考视频替换商品并复刻镜头需要专用工作流。',group:'marketing'},
 {slug:'ai-avatar',title:'AI数字人',description:'让任意角色自然开口并动起来，快速生成各类视频。',image:image('1d4d9c15a1ed.jpg'),mode:'image-to-video',prompt:'让参考图中的人物自然地面对镜头说话，表情和身体动作自然，画面稳定。',note:'当前可生成参考人物的视频，无法保证指定台词、音色或精确口型同步。',group:'avatar'},
 {slug:'ai-product-avatar',title:'AI商品数字人',description:'商品图直接生成出镜展示视频，省去真人拍摄。',image:image('3613c2624096.webp'),mode:'image-to-video',prompt:'围绕参考商品生成一段自然的真人出镜产品展示视频，人物展示商品，构图清晰，商业广告质感。',note:'当前使用图生视频近似生成，不能保证商品细节、指定台词及口型。',fresh:true,group:'avatar'},
 {slug:'ai-motion-control',title:'AI动作迁移',description:'用AI捕捉视频的运动信息，让不同角色复用同一套动作。',image:image('1a85e04a1509.png'),mode:'motion-transfer',note:'上传参考人物和驱动视频，使用现有动作迁移工作流。',group:'avatar'},
 {slug:'florida-meme',title:'AI佛罗里达梗',description:'一键随机生成佛罗里达梗视频，解锁各种脑洞大开的奇葩名场面。',image:image('d360e7ed9a92.webp'),mode:'text-to-video',prompt:'一段充满荒诞喜剧气氛的佛罗里达新闻现场视频，意想不到的滑稽事件，生动自然的动作和纪实镜头。',note:'当前提供文生视频创作入口，专用随机梗模板尚未接入。'},
 {slug:'ai-virtual-try-on',title:'AI试穿',description:'在不同人物上虚拟试穿各种服装，打造任意造型。',image:image('c20c9802a905.png'),mode:'image-edit',prompt:'将第二张参考图中的服装自然穿在第一张人物照片中，保留人物面部特征和姿态，保持服装款式、颜色与细节，服装贴合身体并保留真实光影。',note:'上传人物图和服装图，通过通用图片编辑实现近似试穿；服装细节与尺码效果不保证精确。'},
 {slug:'infinite-camera-angles',title:'无限机位视角',description:'普通视频秒变多机位大片，镜头切换更丰富，画面更有电影感。',image:image('7b8cf932b78c.jpeg'),note:'视频多机位重建和镜头生成需要专用工作流。',fresh:true},
 {slug:'ai-lip-sync',title:'AI 口型同步',description:'告别声音与画面各说各话，让角色的每句台词、每段演唱都像亲自演绎。',image:image('83535cfd733f.jpg'),note:'音频驱动的精确口型同步需要专用音视频输入及工作流。',group:'avatar'},
 {slug:'ai-video-extender',title:'AI视频延长',description:'一键续接视频后续画面，快速延长视频时长。',image:image('09a00c9903a3.png'),note:'基于已有视频续写画面需要专用视频延长工作流。'},
 {slug:'ai-video-enhancer',title:'AI视频画质增强',description:'在线提升视频清晰度与分辨率，最高支持4K输出。',image:image('f331270fcbae.jpg'),note:'视频超分辨率与画质修复需要专用工作流。'},
 {slug:'ai-beauty-filter',title:'AI美颜',description:'AI智能美化人像，改善肤质、气色和面部细节。',image:image('474dd617dce9.png'),mode:'image-edit',prompt:'自然美化参考人像，轻柔改善肤质、气色和面部光线，保留人物身份、五官特征、表情及真实皮肤纹理。',note:'当前使用通用图片编辑工作流，不支持视频逐帧美颜。'},
 {slug:'ai-interior-design',title:'AI室内设计',description:'AI重新设计房间布局，轻松尝试不同装修风格。',image:image('1ad5e7f314b3.jpg'),mode:'image-edit',prompt:'重新设计参考图片中的室内空间，保留房间基本结构与视角，使用协调的家具、材质和自然光线，呈现真实的室内设计效果。',note:'使用通用图片编辑工作流，结构和尺寸不作为施工依据。',fresh:true},
];
export const studios = [
 {slug:'marketing-studio',title:'营销工作室',description:'创建能带来销售并可规模化的 AI 视觉内容',image:image('621751aebbe1.webp'),group:'marketing'},
 {slug:'ai-avatar-studio',title:'Avatar Studio',description:'创建富有表现力的 AI 虚拟形象，让它们开口说话、灵活动作、精准对口型，并展示您的产品。',image:image('a72ac47251ec.webp'),group:'avatar'},
] as const;
export const findStudioTool = (slug: string) => studioTools.find(tool => tool.slug === slug);
