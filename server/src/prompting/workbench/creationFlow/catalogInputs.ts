import { novelExamples } from "./examples/novel";
import { toolsExamples } from "./examples/tools";
import { planningExamples } from "./examples/planning";

export const catalogInputs: Record<string, unknown> = {
  ...novelExamples,
  ...toolsExamples,
  ...planningExamples,
};
