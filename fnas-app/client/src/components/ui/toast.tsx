import type { ToasterProps } from "sonner";
import { Toaster as SonnerToaster, toast } from "sonner";

function Toaster(props: ToasterProps) {
  return <SonnerToaster richColors position="top-right" {...props} />;
}

export { Toaster, toast };
