import type { WorkflowStepModuleDescriptor } from "./WorkflowStepModule";

export class WorkflowStepModuleRegistry {
  private readonly modules = new Map<string, WorkflowStepModuleDescriptor>();

  constructor(modules: readonly WorkflowStepModuleDescriptor[] = []) {
    for (const module of modules) {
      this.register(module);
    }
  }

  register(module: WorkflowStepModuleDescriptor): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Duplicate workflow step module id: ${module.id}`);
    }
    this.modules.set(module.id, module);
  }

  get(id: string): WorkflowStepModuleDescriptor {
    const module = this.modules.get(id);
    if (!module) {
      throw new Error(`Unknown workflow step module id: ${id}`);
    }
    return module;
  }

  maybeGet(id: string): WorkflowStepModuleDescriptor | null {
    return this.modules.get(id) ?? null;
  }

  list(): WorkflowStepModuleDescriptor[] {
    return Array.from(this.modules.values());
  }
}
