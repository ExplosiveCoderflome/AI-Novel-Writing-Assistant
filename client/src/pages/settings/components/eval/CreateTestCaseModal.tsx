import React, { useState } from "react";
import { X, Plus, Sparkles } from "lucide-react";
import { createEvalBenchmark } from "@/api/eval";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateTestCaseModal({ isOpen, onClose, onSuccess }: Props) {
  const [capability, setCapability] = useState("text-gen");
  const [category, setCategory] = useState("custom");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !promptText) return;

    setIsSubmitting(true);
    try {
      const res = await createEvalBenchmark({
        capability,
        category,
        title,
        description,
        promptText,
        expectedOutput,
      });
      if (res.success) {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      alert(`保存失败: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            新增自定义基准测试用例
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">测试模态</label>
            <select
              value={capability}
              onChange={(e) => setCapability(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            >
              <option value="text-gen">文本生成 (LLM)</option>
              <option value="embedding">文本嵌入 (Embedding)</option>
              <option value="sparse">稀疏检索 (BM25)</option>
              <option value="image-gen">图像生成 (ComfyUI)</option>
              <option value="tts">语音合成 (TTS)</option>
              <option value="asr">语音识别 (ASR)</option>
              <option value="ocr">文字识别 (OCR)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">测试用例标题</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 小说动作描写文采测试"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">测试 Prompt 正文</label>
            <textarea
              required
              rows={3}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="输入完整的 Prompt 指令..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">期望输出或 Ground Truth (选填)</label>
            <textarea
              rows={2}
              value={expectedOutput}
              onChange={(e) => setExpectedOutput(e.target.value)}
              placeholder="期望包含的绝密暗号、关键语句或标准 JSON Schema..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50"
            >
              {isSubmitting ? "保存中..." : "确认保存并提交入库"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
