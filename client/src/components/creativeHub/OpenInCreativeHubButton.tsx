import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { ComponentProps } from "react";
import type { CreativeHubResourceBinding } from "@ai-novel/shared/types/creativeHub";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { buildCreativeHubPath } from "@/lib/creativeHubLinks";

interface OpenInCreativeHubButtonProps {
  bindings: CreativeHubResourceBinding;
  label?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}

export default function OpenInCreativeHubButton({
  bindings,
  label = t("gen.components.creativeHub.OpenInCreativeHubButton.gen_d69e4819"),
  variant = "outline",
  size = "sm",
  className,
}: OpenInCreativeHubButtonProps) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link to={buildCreativeHubPath(bindings)}>{label}</Link>
    </Button>
  );
}
