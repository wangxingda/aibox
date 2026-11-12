import { BookOpen, CheckCircle2, Lightbulb } from "lucide-react";
import "./creation-guide.css";

type Guide = { title: string; description: string; steps: [string, string][]; tips: string[]; note?: string };
const guides: Record<string, Guide> = {
 "text-to-image": {title:"文生图创作指南",description:"从文字出发，生成符合你想法的图片。",steps:[["描述画面","写清主体、场景和希望呈现的风格，例如：雨后街道上的橘猫，暖色电影摄影。"],["设置画面","根据可用选项选择画幅和其他生成参数。"],["生成与调整","点击生成，在我的作品中查看结果；可修改提示词再次尝试。"]],tips:["先写主体和场景，再补充光线、构图与风格。","希望画面出现的内容尽量描述清楚，避免互相矛盾的要求。"]},
 "image-edit": {title:"图片编辑创作指南",description:"以参考图片为基础，描述希望修改的内容。",steps:[["添加参考图片","上传图片或从资产中导入，选择主体清晰的素材。"],["描述修改","说明要改变的对象及目标效果，也可以写明需要保留的部分。"],["生成并检查","提交后在我的作品中查看，必要时调整描述并重新生成。"]],tips:["尽量指出具体位置，例如“移除桌子左侧的杯子”。","使用清晰的原图，修改目标越明确越容易检查结果。"]},
 "text-to-video": {title:"文生音视频创作指南",description:"用文字描述画面和动作，生成动态内容。",steps:[["描述场景","写明主体、环境、动作和镜头，例如：小狗在草地奔跑，镜头缓慢跟随。"],["选择设置","根据页面提供的选项选择画幅和时长。"],["提交生成","确认所需积分后提交，在我的作品中查看进度和结果。"]],tips:["一次突出一个主要动作，描述动作方向与镜头运动。","提示词可补充光线、氛围和声音要求，效果以模型输出为准。"]},
 "image-to-video": {title:"图生音视频创作指南",description:"以图片为画面起点，描述你希望出现的动态。",steps:[["添加参考图片","上传或从资产中选择清晰的图片；支持的输入以当前模型为准。"],["描述动态","写明主体如何运动、镜头如何移动，以及希望保持的画面特点。"],["设置并生成","确认时长和积分后提交，在我的作品中查看生成结果。"]],tips:["让动作与原图构图相符，避免要求主体突然改变位置。","参考图决定初始视觉，提示词主要描述接下来的变化。"]},
 "character-replacement": {title:"角色替换创作指南",description:"使用人物图片替换驱动视频中的角色。",steps:[["上传人物图片","选择人物清晰、无遮挡的参考图片。"],["上传驱动视频","选择包含清晰人物动作的视频，视频决定动作和时长。"],["补充描述并生成","提示词选填，可描述角色外观与画面效果；确认积分后提交。"]],tips:["参考图片和视频中的人物姿态尽量清晰。","视频较长时处理时间和积分消耗会增加。"]},
 "motion-transfer": {title:"动作迁移创作指南",description:"让参考图片中的角色跟随视频动作运动。",steps:[["添加角色图片","选择主体完整、姿态清晰的人物或角色图片。"],["添加驱动视频","上传包含所需动作的视频，画面中主体尽量清晰。"],["补充画面要求","提示词选填，可说明动作表现；确认积分后提交生成。"]],tips:["参考人物和驱动人物尽量保持相近的画面比例。","动作遮挡过多或主体离开画面可能影响结果。"]},
 "voice": {title:"声音克隆创作指南",description:"选择一个声音样本，让文字用该音色表达。",steps:[["选择声音样本","选择系统音色，或上传、录制、从资产导入清晰人声。录音最长 10 秒。"],["输入朗读文字","确认当前音色，输入希望朗读的文字，最多 2000 字。"],["生成与试听","点击生成后在我的作品中试听、下载或删除。"]],tips:["优先选择安静环境中录制、没有背景音乐的人声。","录音可只用于本次创作，也可命名保存到资产库。"],note:"请仅使用你拥有使用权或已获授权的声音。"},
 "digital-audio": {title:"数字人 · 音频驱动指南",description:"用人物图片和已有音频生成口型同步的视频。",steps:[["选择人物图片","上传或从资产导入单人照片，确保面部清晰可见。"],["选择驱动音频","上传或导入 WAV、MP3 或 WebM，最大 3 MB、最长 150 秒。"],["确认并生成","画面描述选填；确认显示的积分后提交，在我的作品中查看。"]],tips:["音频中的人声用于驱动口型，成片保留原始音轨。","使用正面、遮挡较少的人物图片和清晰的语音。"],note:"请仅使用你拥有使用权或已获授权的人物和声音素材。"},
 "digital-text": {title:"数字人 · 文本驱动指南",description:"填写口播内容和音色描述，为人物生成语音与口型。",steps:[["选择人物图片","上传清晰的人物图片。"],["填写口播与音色","输入要说的话，并描述声音的音色、语速和语气。"],["补充画面描述","可填写人物表情、动作和光线要求。"]],tips:["口播文案与画面描述分别填写。","音色描述可包含音高、语速和情绪等信息。"],note:"该模式的工作流尚未配置，暂不能提交生成。"},
 "digital-clone": {title:"数字人 · 声音克隆指南",description:"用参考声音和口播文案驱动人物说话。",steps:[["选择人物和参考音频","准备清晰的人物图片，以及建议 10–20 秒的干净单人录音。"],["填写参考音频原文","逐字填写参考录音中的内容，帮助工作流识别音色和语调。"],["填写口播文案","输入希望数字人说出的新内容，并按需补充画面描述。"]],tips:["参考录音尽量避免背景音乐、回声和多人说话。","参考原文应与录音一致；口播文案是要生成的新内容。"],note:"该模式的工作流尚未配置，暂不能提交生成；请仅使用已获授权的素材。"},
};
export function CreationGuide({kind}: {kind:string}) {
 const guide=guides[kind] || guides["image-to-video"];
 return <section className="creation-guide"><div className="creation-guide-heading"><div><span><BookOpen size={15}/> CREATION GUIDE</span><h2>{guide.title}</h2><p>{guide.description}</p></div><BookOpen size={23} aria-hidden="true"/></div><div className="creation-guide-body"><div><h3>开始创作</h3><ol>{guide.steps.map(([title,detail],index)=><li key={title}><span>{String(index+1).padStart(2,"0")}</span><div><h4>{title}</h4><p>{detail}</p></div></li>)}</ol></div><aside><div className="creation-guide-tips"><h3><Lightbulb size={17}/> 创作小贴士</h3>{guide.tips.map(tip=><p key={tip}><CheckCircle2 size={15}/><span>{tip}</span></p>)}</div>{guide.note && <p className="creation-guide-note">{guide.note}</p>}</aside></div></section>;
}
