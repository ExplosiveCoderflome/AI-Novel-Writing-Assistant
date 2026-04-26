import type { ExternalToast, ToasterProps } from "sonner";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

function Toaster(props: ToasterProps) {
  const { toastOptions, mobileOffset, ...restProps } = props;
  return (
    <SonnerToaster
      richColors
      position="top-right"
      mobileOffset={mobileOffset ?? 0}
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: `max-w-[100vw] overflow-hidden ${toastOptions?.classNames?.toast ?? ""}`.trim(),
          content: `min-w-0 break-words [overflow-wrap:anywhere] ${toastOptions?.classNames?.content ?? ""}`.trim(),
          title: `break-words [overflow-wrap:anywhere] ${toastOptions?.classNames?.title ?? ""}`.trim(),
          description: `break-words [overflow-wrap:anywhere] ${toastOptions?.classNames?.description ?? ""}`.trim(),
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
