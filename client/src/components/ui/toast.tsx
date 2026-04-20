import type { ExternalToast, ToasterProps } from "sonner";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

function Toaster(props: ToasterProps) {
  return <SonnerToaster richColors position="top-right" {...props} />;
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
