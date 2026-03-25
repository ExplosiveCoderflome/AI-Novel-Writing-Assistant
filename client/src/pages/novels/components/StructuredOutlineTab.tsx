import StructuredOutlineWorkspace from "./StructuredOutlineWorkspace";
import type { StructuredTabViewProps } from "./NovelEditView.types";

export default function StructuredOutlineTab(props: StructuredTabViewProps) {
  return <StructuredOutlineWorkspace {...props} />;
}
