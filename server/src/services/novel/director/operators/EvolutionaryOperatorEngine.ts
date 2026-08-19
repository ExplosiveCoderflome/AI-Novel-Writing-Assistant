import type { CandidatePayload, CrossoverGeneStrategy, OperatorInput, OperatorResult, OperatorType } from './operatorTypes';
import { draftOperator } from './DraftOperator';
import { improveOperator } from './ImproveOperator';
import { debugOperator } from './DebugOperator';
import { crossoverOperator } from './CrossoverOperator';

export class EvolutionaryOperatorEngine {
  /**
   * 统一算子执行入口
   */
  async executeOperator<T = CandidatePayload>(
    input: OperatorInput<T>
  ): Promise<OperatorResult<T>> {
    switch (input.operatorType) {
      case 'draft':
        return draftOperator.execute(input);
      case 'improve':
        return improveOperator.execute(input);
      case 'debug':
        return debugOperator.execute(input);
      case 'crossover':
        return crossoverOperator.execute(input);
      default:
        throw new Error(`不支持的演化算子类型: ${(input as any).operatorType}`);
    }
  }

  /**
   * 快捷方法：初稿生成 (Draft)
   */
  async draft<T = CandidatePayload>(
    inputOptions: Omit<OperatorInput<T>, 'operatorType'>
  ): Promise<OperatorResult<T>> {
    return this.executeOperator<T>({
      ...inputOptions,
      operatorType: 'draft',
    });
  }

  /**
   * 快捷方法：质量润色 (Improve)
   */
  async improve<T = CandidatePayload>(
    candidate: T,
    auditDiagnostics: OperatorInput<T>['auditDiagnostics'],
    inputOptions?: Partial<OperatorInput<T>>
  ): Promise<OperatorResult<T>> {
    return this.executeOperator<T>({
      novelId: inputOptions?.novelId ?? 'default_novel',
      chapterId: inputOptions?.chapterId,
      ...inputOptions,
      operatorType: 'improve',
      primaryCandidate: candidate,
      auditDiagnostics,
    });
  }

  /**
   * 快捷方法：缺陷修复 (Debug)
   */
  async debug<T = CandidatePayload>(
    candidate: T,
    violations: OperatorInput<T>['auditDiagnostics'],
    inputOptions?: Partial<OperatorInput<T>>
  ): Promise<OperatorResult<T>> {
    return this.executeOperator<T>({
      novelId: inputOptions?.novelId ?? 'default_novel',
      chapterId: inputOptions?.chapterId,
      ...inputOptions,
      operatorType: 'debug',
      primaryCandidate: candidate,
      auditDiagnostics: violations,
    });
  }

  /**
   * 快捷方法：双分支基因交叉 (Crossover)
   */
  async crossover<T = CandidatePayload>(
    parentA: T,
    parentB: T,
    strategy?: CrossoverGeneStrategy,
    inputOptions?: Partial<OperatorInput<T>>
  ): Promise<OperatorResult<T>> {
    return this.executeOperator<T>({
      novelId: inputOptions?.novelId ?? 'default_novel',
      chapterId: inputOptions?.chapterId,
      ...inputOptions,
      operatorType: 'crossover',
      primaryCandidate: parentA,
      secondaryCandidate: parentB,
      crossoverStrategy: strategy,
    });
  }
}

export const evolutionaryOperatorEngine = new EvolutionaryOperatorEngine();
