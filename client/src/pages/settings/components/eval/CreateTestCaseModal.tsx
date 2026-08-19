import i18next from "i18next";
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
      alert(i18next.t("settings.createTestCaseModal.jpus57", { val1: err.message || err }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />{i18next.t("settings.createTestCaseModal.f8k4sk")}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">{i18next.t("settings.createTestCaseModal.ed96qy")}</label>
            <select
              value={capability}
              onChange={(e) => setCapability(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            >
              <option value="text-gen">{i18next.t("settings.createTestCaseModal.2257ja")}</option>
              <option value="embedding">{i18next.t("settings.createTestCaseModal.4pqzpk")}</option>
              <option value="sparse">{i18next.t("settings.createTestCaseModal.opffpa")}</option>
              <option value="image-gen">{i18next.t("settings.createTestCaseModal.2hf0s5")}</option>
              <option value="tts">{i18next.t("settings.createTestCaseModal.4tehsk")}</option>
              <option value="asr">{i18next.t("settings.createTestCaseModal.slcylg")}</option>
              <option value="ocr">{i18next.t("settings.createTestCaseModal.1vx88o")}</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">{i18next.t("settings.createTestCaseModal.t6ksfy")}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={i18next.t("settings.createTestCaseModal.c9dqua")}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">{i18next.t("settings.createTestCaseModal.gefbiu")}</label>
            <textarea
              required
              rows={3}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={i18next.t("settings.createTestCaseModal.62lnbp")}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">{i18next.t("settings.createTestCaseModal.4eq0lc")}</label>
            <textarea
              rows={2}
              value={expectedOutput}
              onChange={(e) => setExpectedOutput(e.target.value)}
              placeholder={i18next.t("settings.createTestCaseModal.p0jypj")}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
            >{i18next.t("common.cancel")}</button>
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
