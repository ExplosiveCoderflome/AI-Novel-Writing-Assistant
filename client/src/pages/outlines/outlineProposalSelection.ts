import type { OutlineProposalOperation } from "@/api/outlines";

export interface MissingOperationDependency {
  operationId: string;
  dependencyIds: string[];
}

export function findMissingOperationDependencies(
  operations: readonly Pick<OutlineProposalOperation, "operationId" | "dependsOn">[],
  selectedIds: readonly string[],
): MissingOperationDependency[] {
  const availableIds = new Set(operations.map(operation => operation.operationId));
  const selected = new Set(selectedIds);
  return operations
    .filter(operation => selected.has(operation.operationId))
    .map(operation => ({
      operationId: operation.operationId,
      dependencyIds: operation.dependsOn.filter(dependencyId => !availableIds.has(dependencyId) || !selected.has(dependencyId)),
    }))
    .filter(result => result.dependencyIds.length > 0);
}

export function canApplyOperationSelection(
  operations: readonly Pick<OutlineProposalOperation, "operationId" | "dependsOn">[],
  selectedIds: readonly string[],
): boolean {
  return selectedIds.length > 0 && findMissingOperationDependencies(operations, selectedIds).length === 0;
}
