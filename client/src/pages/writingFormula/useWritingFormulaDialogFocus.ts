import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

export type WritingFormulaDialogFocusIntent = null | "editor" | "detection";

interface UseWritingFormulaDialogFocusParams {
  dialogRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  focusIntent: WritingFormulaDialogFocusIntent;
  focusKey: string;
  setFocusIntent: Dispatch<SetStateAction<WritingFormulaDialogFocusIntent>>;
}

export function useWritingFormulaDialogFocus(params: UseWritingFormulaDialogFocusParams) {
  const {
    dialogRef,
    open,
    focusIntent,
    focusKey,
    setFocusIntent,
  } = params;

  useEffect(() => {
    if (!open || !focusIntent) {
      return;
    }

    let timeoutId: number | null = null;
    const rafId = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) {
        setFocusIntent(null);
        return;
      }

      if (focusIntent === "editor") {
        timeoutId = window.setTimeout(() => {
          const editorInput = dialog.querySelector<HTMLInputElement>("[data-writing-formula-primary-input]");
          if (editorInput) {
            editorInput.focus({ preventScroll: true });
            editorInput.select();
            setFocusIntent(null);
            return;
          }

          const editorPanel = dialog.querySelector<HTMLElement>("[data-writing-formula-editor-panel]");
          editorPanel?.focus({ preventScroll: true });
          setFocusIntent(null);
        }, 220);
        return;
      }

      timeoutId = window.setTimeout(() => {
        const detectInput = dialog.querySelector<HTMLTextAreaElement>("[data-writing-formula-detect-input]");
        detectInput?.focus({ preventScroll: true });
        detectInput?.select();
        setFocusIntent(null);
      }, 220);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [dialogRef, focusIntent, focusKey, open, setFocusIntent]);
}
