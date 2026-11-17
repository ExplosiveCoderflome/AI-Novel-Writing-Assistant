import { z } from "zod";
import { kernelModelWindowsSchema, createKernelModelWindowReader } from "../prompts/modelWindows";
import { MissingTaskOutputBudgetError } from "../../../../platform/llm/execution";

export const KERNEL_MODEL_TASKS = ["planner","writer","review","repair","fact_extraction","summary"] as const;
const text = z.string().trim().min(1);
export const kernelModelPolicySchema = z.object({version:z.literal(1),provider:text,model:text,
  structuredThinking:z.literal("default_off").optional(),
  windows:kernelModelWindowsSchema,
  fallback:z.object({enabled:z.boolean(),provider:text,model:text,temperature:z.number().min(0).max(2),
    maxTokens:z.number().int().positive().nullable(),retryCount:z.number().int().min(0).max(3)}).strict(),
  targets:z.array(z.object({provider:text,model:text,taskType:z.enum(KERNEL_MODEL_TASKS),configurationHash:z.string().regex(/^[a-f0-9]{64}$/),
    maxTokens:z.number().int().positive().optional()}).strict()),
}).strict();
export type KernelModelPolicy = z.infer<typeof kernelModelPolicySchema>;
export function validateKernelModelPolicy(value: unknown): KernelModelPolicy {
  const policy=kernelModelPolicySchema.parse(value),keys=new Set<string>();
  createKernelModelWindowReader(policy.windows);
  const models=[{provider:policy.provider,model:policy.model},...(policy.fallback.enabled ? [policy.fallback] : [])]
    .filter((row,index,rows)=>rows.findIndex(other=>other.provider===row.provider&&other.model===row.model)===index);
  for(const target of policy.targets){
    const key=JSON.stringify([target.provider,target.model,target.taskType]);
    if(keys.has(key)||!models.some(row=>row.provider===target.provider&&row.model===target.model))throw new Error("Invalid kernel model configuration targets");
    if(policy.structuredThinking && target.maxTokens == null)
      throw new MissingTaskOutputBudgetError(target.provider,target.model,target.taskType);
    keys.add(key);
  }
  for(const model of models) for(const taskType of KERNEL_MODEL_TASKS) {
    if(!keys.has(JSON.stringify([model.provider,model.model,taskType])))
      throw new MissingTaskOutputBudgetError(model.provider,model.model,taskType);
  }
  if(models.some(model=>!policy.windows.some(row=>row.provider===model.provider&&row.model===model.model))) {
    throw new Error("Kernel model policy is missing an explicit configuration or context window");
  }
  return policy;
}
