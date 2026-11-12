/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import examples from "./image-examples-data.json";
import { ExampleMediaPreview } from "./example-media-preview";
import "./image-examples.css";

type Example = { title: string; prompt: string; image: string; inputImage?: string };

export function ImageExamples({ edit, onApply }: { edit: boolean; onApply: (example: Example) => void }) {
  const [selected, setSelected] = useState(0);
  const items: Example[] = edit ? examples.edit : examples.text;
  const item = items[Math.min(selected, items.length - 1)];
  return <div className="image-examples">
    <div className="image-examples-heading"><div><h2>参考示例</h2><p>选择灵感，快速开始创作</p></div><Sparkles size={20} aria-hidden="true" /></div>
    <div className="image-example-feature">
      <div className="image-example-picture"><img src={item.image} alt={`${item.title}生成示例`}  loading="lazy" decoding="async"/></div>
      <div className="image-example-info"><span className="image-example-type">{edit ? "图片编辑" : "文生图"}</span><h3>{item.title}</h3><span className="image-example-label">提示词</span><p>{item.prompt}</p>{edit && (item.inputImage ? <div className="image-example-input"><ExampleMediaPreview src={item.inputImage} label="示例参考图片"/></div> : <div className="image-example-input">此案例请上传自己的参考图片</div>)}<button type="button" className="image-example-apply" onClick={() => onApply(item)}><Sparkles size={16} />一键同款</button></div>
    </div>
    <div className="image-example-list" aria-label="选择参考示例">{items.map((example, index) => <button type="button" key={example.image} className={index === selected ? "selected" : ""} onClick={() => setSelected(index)} aria-label={`查看${example.title}`} aria-pressed={index === selected}><img src={example.image} alt=""  loading="lazy" decoding="async"/><span>{example.title}</span></button>)}</div>
  </div>;
}
