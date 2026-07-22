import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { ExternalToast, ToasterProps } from "sonner";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

function Toaster(props: ToasterProps) {
  const { toastOptions, mobileOffset, offset, ...restProps } = props;
  return (
    <SonnerToaster
      richColors
      position="top-right"
      offset={offset ?? 20}
      mobileOffset={mobileOffset ?? 12}
      toastOptions={{
        ...toastOptions,
        closeButtonAriaLabel: toastOptions?.closeButtonAriaLabel ?? t("gen.components.ui.toast.gen_c335e973"),
        classNames: {
          ...toastOptions?.classNames,
          toast: `max-w-[calc(100vw-1.5rem)] overflow-visible ${toastOptions?.classNames?.toast ?? ""}`.trim(),
          content: `min-w-0 break-words [overflow-wrap:anywhere] ${toastOptions?.classNames?.content ?? ""}`.trim(),
          title: `break-words [overflow-wrap:anywhere] ${toastOptions?.classNames?.title ?? ""}`.trim(),
          description: `break-words [overflow-wrap:anywhere] ${toastOptions?.classNames?.description ?? ""}`.trim(),
          closeButton: `shadow-sm ${toastOptions?.classNames?.closeButton ?? ""}`.trim(),
        },
      }}
      {...restProps}
    />
  );
}

const ERROR_TOAST_DEFAULTS: ExternalToast = {
  duration: Number.POSITIVE_INFINITY,
  closeButton: true,
  dismissible: true,
};

const toast = Object.assign(
  (
    message: Parameters<typeof sonnerToast>[0],
    data?: Parameters<typeof sonnerToast>[1],
  ) => sonnerToast(message, data),
  sonnerToast,
  {
    error: (
      message: Parameters<typeof sonnerToast.error>[0],
      data?: Parameters<typeof sonnerToast.error>[1],
    ) => sonnerToast.error(message, {
      ...ERROR_TOAST_DEFAULTS,
      ...data,
    }),
  },
);

export { Toaster, toast };
