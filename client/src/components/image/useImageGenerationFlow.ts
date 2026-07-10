/**
 * 生图确认弹窗触发 hook
 *
 * 使用方式：
 *   const flow = useImageGenerationFlow();
 *   <button onClick={() => flow.start({
 *     prepare: () => prepareCharacterAssetImage(asset.id, provider),
 *     generate: (overrides) => generateCharacterAssetImage(asset.id, provider, overrides),
 *     onSuccess: () => refresh(),
 *   })}>AI 生图</button>
 *   <ImageGenerationConfirmDialog {...flow.dialogProps} />
 *
 * 流程：start → prepare 拿预览 → 弹窗 → 用户 confirm/取消 → 取消时 generate
 */
import { useState } from "react";

import { toast } from "@/components/ui/toast";
import type { ImageGenerationOverrides, ImageGenerationPreview } from "@/api/comic";

interface StartOptions<TResult = unknown> {
  prepare: () => Promise<ImageGenerationPreview>;
  generate: (overrides: ImageGenerationOverrides) => Promise<TResult>;
  onSuccess?: (result: TResult) => void;
  onError?: (err: unknown) => void;
}

export function useImageGenerationFlow() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ImageGenerationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 当前活跃的 generate 闭包（弹窗 confirm 时调用）
  const [activeGenerate, setActiveGenerate] = useState<((o: ImageGenerationOverrides) => Promise<void>) | null>(null);

  const start = async <TResult>({ prepare, generate, onSuccess, onError }: StartOptions<TResult>) => {
    setOpen(true);
    setLoading(true);
    setPreview(null);
    try {
      const p = await prepare();
      setPreview(p);
      setLoading(false);
      // 闭包绑定本次 generate
      setActiveGenerate(() => async (overrides: ImageGenerationOverrides) => {
        setSubmitting(true);
        try {
          const result = await generate(overrides);
          setOpen(false);
          setPreview(null);
          setActiveGenerate(null);
          onSuccess?.(result);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : String(err));
          onError?.(err);
        } finally {
          setSubmitting(false);
        }
      });
    } catch (err) {
      setLoading(false);
      setOpen(false);
      toast.error(err instanceof Error ? err.message : String(err));
      onError?.(err);
    }
  };

  const cancel = () => {
    setOpen(false);
    setPreview(null);
    setActiveGenerate(null);
  };

  return {
    start,
    dialogProps: {
      open,
      preview,
      loading,
      submitting,
      onCancel: cancel,
      onConfirm: (overrides: ImageGenerationOverrides) => {
        activeGenerate?.(overrides);
      },
    },
  };
}
