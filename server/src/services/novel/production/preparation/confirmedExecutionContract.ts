import { verifyConfirmedExecutionContract } from "../../../../modules/director";
import { matchesStoryPlanProjection } from "../../../planner/plannerPersistence";

export const hasConfirmedExecutionContract = verifyConfirmedExecutionContract.bind(null, matchesStoryPlanProjection);
