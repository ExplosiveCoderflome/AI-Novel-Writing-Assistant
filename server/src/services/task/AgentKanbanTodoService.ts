/**
 * Module 3: Durable Agent Executable Todos Kanban Service
 * Provides atomic task claiming, progress marking, evidence attachment,
 * and crash-resilient deadlock recovery for long-running Agent teams.
 */

export interface AgentExecutableTodoRecord {
  id: string;
  novelId: string;
  directorTaskId: string;
  agentRole: string;
  title: string;
  stageId: string;
  chapterIndex?: number;
  orderIndex: number;
  status: 'PENDING' | 'CLAIMED' | 'COMPLETED' | 'FAILED';
  claimedByWorker?: string;
  claimedAtMs?: number;
  evidencePayload?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClaimTodoResponse {
  claimed: boolean;
  todo?: AgentExecutableTodoRecord;
  remainingPendingCount: number;
}

export class AgentKanbanTodoService {
  private todoStore: Map<string, AgentExecutableTodoRecord> = new Map();

  /**
   * Initializes the durable task Kanban board with an array of atomic todos.
   */
  public initializeKanbanBoard(
    novelId: string,
    directorTaskId: string,
    todos: Array<{ title: string; agentRole: string; stageId: string; chapterIndex?: number }>
  ): AgentExecutableTodoRecord[] {
    const records: AgentExecutableTodoRecord[] = [];
    const now = Date.now();

    todos.forEach((item, idx) => {
      const id = `todo-${novelId}-${idx + 1}-${now}`;
      const record: AgentExecutableTodoRecord = {
        id,
        novelId,
        directorTaskId,
        agentRole: item.agentRole,
        title: item.title,
        stageId: item.stageId,
        chapterIndex: item.chapterIndex,
        orderIndex: idx + 1,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      this.todoStore.set(id, record);
      records.push(record);
    });

    return records;
  }

  /**
   * Atomically claims the next PENDING todo for a specialized agent role.
   * Ensures no two agents process the same item simultaneously.
   */
  public claimNextTodo(
    novelId: string,
    agentRole: string,
    workerId: string
  ): ClaimTodoResponse {
    const novelTodos = Array.from(this.todoStore.values())
      .filter((t) => t.novelId === novelId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const pendingForRole = novelTodos.filter(
      (t) => t.status === 'PENDING' && (t.agentRole === agentRole || t.agentRole === 'any')
    );

    const remainingPendingCount = novelTodos.filter((t) => t.status === 'PENDING').length;

    if (pendingForRole.length === 0) {
      return { claimed: false, remainingPendingCount };
    }

    const nextTodo = pendingForRole[0];
    const now = Date.now();

    nextTodo.status = 'CLAIMED';
    nextTodo.claimedByWorker = workerId;
    nextTodo.claimedAtMs = now;
    nextTodo.updatedAt = now;

    return {
      claimed: true,
      todo: nextTodo,
      remainingPendingCount: remainingPendingCount - 1,
    };
  }

  /**
   * Completes a todo and stores Module 1 VerifiedHandoffCertificate as evidence.
   */
  public completeTodo(
    todoId: string,
    evidencePayload?: Record<string, unknown>
  ): boolean {
    const todo = this.todoStore.get(todoId);
    if (!todo) return false;

    const now = Date.now();
    todo.status = 'COMPLETED';
    todo.updatedAt = now;
    if (evidencePayload) {
      todo.evidencePayload = JSON.stringify(evidencePayload);
    }

    return true;
  }

  /**
   * Marks a todo as failed.
   */
  public failTodo(todoId: string, reason?: string): boolean {
    const todo = this.todoStore.get(todoId);
    if (!todo) return false;

    todo.status = 'FAILED';
    todo.updatedAt = Date.now();
    if (reason) {
      todo.evidencePayload = JSON.stringify({ error: reason });
    }

    return true;
  }

  /**
   * Deadlock Recovery: Resets stale CLAIMED todos (e.g. claimed > 5 mins ago with worker crash) back to PENDING.
   */
  public recoverStaleClaimedTodos(staleTimeoutMs: number = 300000): number {
    const now = Date.now();
    let recoveredCount = 0;

    for (const todo of this.todoStore.values()) {
      if (
        todo.status === 'CLAIMED' &&
        todo.claimedAtMs &&
        now - todo.claimedAtMs >= staleTimeoutMs
      ) {
        todo.status = 'PENDING';
        todo.claimedByWorker = undefined;
        todo.claimedAtMs = undefined;
        todo.updatedAt = now;
        recoveredCount++;
      }
    }

    return recoveredCount;
  }

  /**
   * Returns current board progress matrix for a novel.
   */
  public getBoardSummary(novelId: string): {
    total: number;
    pending: number;
    claimed: number;
    completed: number;
    failed: number;
    todos: AgentExecutableTodoRecord[];
  } {
    const todos = Array.from(this.todoStore.values())
      .filter((t) => t.novelId === novelId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return {
      total: todos.length,
      pending: todos.filter((t) => t.status === 'PENDING').length,
      claimed: todos.filter((t) => t.status === 'CLAIMED').length,
      completed: todos.filter((t) => t.status === 'COMPLETED').length,
      failed: todos.filter((t) => t.status === 'FAILED').length,
      todos,
    };
  }

  /**
   * Clears board memory (mainly for tests).
   */
  public clearBoard(novelId?: string): void {
    if (novelId) {
      for (const [id, todo] of this.todoStore.entries()) {
        if (todo.novelId === novelId) {
          this.todoStore.delete(id);
        }
      }
    } else {
      this.todoStore.clear();
    }
  }
}

export const agentKanbanTodoService = new AgentKanbanTodoService();
