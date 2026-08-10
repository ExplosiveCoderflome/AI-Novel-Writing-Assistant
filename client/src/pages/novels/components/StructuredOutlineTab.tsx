import { useTranslation } from "react-i18next";
import StructuredOutlineWorkspace from "./StructuredOutlineWorkspace";
import type { StructuredTabViewProps } from "./NovelEditView.types";

export default function StructuredOutlineTab(props: StructuredTabViewProps) {
  const { t } = useTranslation();
  return <StructuredOutlineWorkspace {...props} />;
}
