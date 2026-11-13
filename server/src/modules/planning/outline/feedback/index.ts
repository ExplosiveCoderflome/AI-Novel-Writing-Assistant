import { prisma } from "../../../../db/prisma";
import { OutlineFeedbackService } from "./application/OutlineFeedbackService";
export { OutlineFeedbackService } from "./application/OutlineFeedbackService";
export { feedbackDue } from "./domain/feedbackPolicy";
export const outlineFeedbackService = new OutlineFeedbackService(prisma);
