import { directorProductionPlan } from "../../../modules/director";
/** The default production plan remains untouched. Every new preparation result has an assisted confirmation path. */
export const outlineOpeningPlan = {...directorProductionPlan, version: "outline-open-book-v1",
  steps: directorProductionPlan.steps.map(step => ({...step, gateable: true}))};
