import type { ReactNode } from "react";
import AiActionLabel from "@/components/common/AiActionLabel";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useCreationSetup } from "@/components/onboarding/CreationSetupContext";

interface AiButtonProps extends ButtonProps {
  children: ReactNode;
  contentClassName?: string;
  badgeClassName?: string;
}

export default function AiButton(props: AiButtonProps) {
  const { requireCreationSetup } = useCreationSetup();
  const { children, contentClassName, badgeClassName, onClick, ...buttonProps } = props;

  return (
    <Button
      {...buttonProps}
      onClick={(event) => {
        if (!requireCreationSetup()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
    >
      <AiActionLabel className={contentClassName} badgeClassName={badgeClassName}>
        {children}
      </AiActionLabel>
    </Button>
  );
}
