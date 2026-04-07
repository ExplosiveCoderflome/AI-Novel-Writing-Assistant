import type { ReactNode } from "react";
import AiActionLabel from "@/components/common/AiActionLabel";
import { Button, type ButtonProps } from "@/components/ui/button";

interface AiButtonProps extends ButtonProps {
  children: ReactNode;
  contentClassName?: string;
  badgeClassName?: string;
}

export default function AiButton(props: AiButtonProps) {
  const { children, contentClassName, badgeClassName, ...buttonProps } = props;

  return (
    <Button {...buttonProps}>
      <AiActionLabel className={contentClassName} badgeClassName={badgeClassName}>
        {children}
      </AiActionLabel>
    </Button>
  );
}
