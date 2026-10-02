import { VersionConflictError, type RunContract, type RunControl, type RunLaunchInput } from "../domain";
import type {
  CommandExecutionInput,
  CommandRepository,
  CommandTransitionInput,
  DirectorRuntime,
  RunRepository,
} from "./ports";

export type DirectorCommand =
  | { type: "open_run"; novelId: string; driver: RunContract["driver"]; stepIdsInScope: string[] | null; launchInput?: RunLaunchInput; idempotencyKey: string }
  | { type: "resolve_gate"; runId: string; decision: "confirm" | "confirm_after_edit" | "regenerate"; expectedVersion: number; idempotencyKey: string }
  | { type: "resume"; runId: string; expectedVersion: number; idempotencyKey: string }
  | { type: "handoff"; runId: string; toDriver: RunContract["driver"]; expectedVersion: number; idempotencyKey: string }
  | { type: "cancel"; runId: string; expectedVersion: number; idempotencyKey: string };

export interface DirectorCommandResult {
  runId: string;
  controlVersion: number;
  commandId: string;
  replayed: boolean;
}

export class InvalidDirectorCommandError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "InvalidDirectorCommandError";
  }
}

export class ActiveRunConflictError extends Error {
  readonly statusCode = 409;

  constructor(readonly activeRunId: string) {
    super("这本书已有进行中的创作，请先继续或取消当前创作。");
    this.name = "ActiveRunConflictError";
  }
}

export class CommandVersionConflictError extends Error {
  readonly statusCode = 409;

  constructor(readonly cause: VersionConflictError) {
    super("状态已变化，请刷新后再操作");
    this.name = "CommandVersionConflictError";
  }
}

export interface CommandServiceDeps {
  runRepository: Pick<RunRepository, "findActiveRunIdByNovel" | "open" | "getControl" | "getContract" | "transition">;
  commandRepository: CommandRepository;
  runtime: DirectorRuntime;
  contractFactory: (input: {
    runId: string;
    novelId: string;
    driver: RunContract["driver"];
    stepIdsInScope: string[] | null;
    launchInput?: RunLaunchInput;
  }) => RunContract;
}

function isDirectorCommand(value: unknown): value is DirectorCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as Partial<DirectorCommand>;
  return typeof command.type === "string"
    && typeof command.idempotencyKey === "string"
    && command.idempotencyKey.trim().length > 0;
}

function replayResult(record: { result: unknown }): DirectorCommandResult {
  const result = record.result as Omit<DirectorCommandResult, "replayed">;
  return { ...result, replayed: true };
}

export class CommandService {
  constructor(private readonly deps: CommandServiceDeps) {}

  async execute(input: unknown): Promise<DirectorCommandResult> {
    if (!isDirectorCommand(input)) {
      throw new InvalidDirectorCommandError("命令格式不正确。");
    }
    const existing = await this.deps.commandRepository.find(input.idempotencyKey);
    if (existing) return replayResult(existing);

    try {
      return await this.executeFresh(input);
    } catch (error) {
      if (error instanceof VersionConflictError || (error instanceof Error && error.name === "VersionConflictError")) {
        const conflict = error instanceof VersionConflictError ? error : new VersionConflictError(-1, -1);
        throw new CommandVersionConflictError(conflict);
      }
      throw error;
    }
  }

  private async executeFresh(command: DirectorCommand): Promise<DirectorCommandResult> {
    switch (command.type) {
      case "open_run":
        return this.openRun(command);
      case "resolve_gate":
        return this.resolveGate(command);
      case "resume":
        return this.resume(command);
      case "cancel":
        return this.transition(command, { type: "cancel" });
      case "handoff":
        return this.handoff(command);
      default:
        throw new InvalidDirectorCommandError("不支持的导演命令。");
    }
  }

  private async openRun(command: Extract<DirectorCommand, { type: "open_run" }>): Promise<DirectorCommandResult> {
    const activeRunId = await this.deps.runRepository.findActiveRunIdByNovel(command.novelId);
    if (activeRunId) throw new ActiveRunConflictError(activeRunId);
    const runId = this.deps.runtime.nextId();
    const commandId = this.deps.runtime.nextId();
    const result = await this.deps.commandRepository.openRun({
      id: commandId,
      idempotencyKey: command.idempotencyKey,
      type: command.type,
      payload: command,
      runId,
      contract: this.deps.contractFactory({ runId, novelId: command.novelId, driver: command.driver, stepIdsInScope: command.stepIdsInScope, launchInput: command.launchInput }),
    });
    return { runId: result.runId, controlVersion: result.control.version, commandId: result.commandId, replayed: result.replayed };
  }

  private async resume(command: Extract<DirectorCommand, { type: "resume" }>): Promise<DirectorCommandResult> {
    const control = await this.requireControl(command.runId);
    if (control.status !== "paused") {
      throw new InvalidDirectorCommandError("只有暂停中的创作可以继续。");
    }
    return this.transition(command, { type: "resume" });
  }

  private async resolveGate(command: Extract<DirectorCommand, { type: "resolve_gate" }>): Promise<DirectorCommandResult> {
    const control = await this.requireControl(command.runId);
    if (control.status !== "waiting_gate") {
      throw new InvalidDirectorCommandError("只有等待确认的创作可以处理门控。");
    }
    return this.transition(command, { type: "resolve_gate" });
  }

  private async transition(
    command: Extract<DirectorCommand, { runId: string; expectedVersion: number }>,
    event: Parameters<RunRepository["transition"]>[1],
  ): Promise<DirectorCommandResult> {
    const commandId = this.deps.runtime.nextId();
    const result = await this.deps.commandRepository.transition({
      id: commandId,
      idempotencyKey: command.idempotencyKey,
      type: command.type,
      payload: command,
      runId: command.runId,
      event,
      expectedVersion: command.expectedVersion,
    });
    return {
      runId: result.runId,
      controlVersion: result.control.version,
      commandId: result.commandId,
      replayed: result.replayed,
    };
  }

  private async handoff(command: Extract<DirectorCommand, { type: "handoff" }>): Promise<DirectorCommandResult> {
    const [control, contract] = await Promise.all([
      this.requireControl(command.runId),
      this.deps.runRepository.getContract(command.runId),
    ]);
    if (!contract) throw new InvalidDirectorCommandError("找不到要切换的创作。");
    if (control.status === "cancelled" || control.status === "completed" || control.status === "failed") {
      throw new InvalidDirectorCommandError("只有未结束的创作可以切换方式。");
    }
    const runId = this.deps.runtime.nextId();
    const commandId = this.deps.runtime.nextId();
    const result = await this.deps.commandRepository.handoff({
      id: commandId,
      idempotencyKey: command.idempotencyKey,
      type: command.type,
      payload: command,
      oldRunId: command.runId,
      oldExpectedVersion: command.expectedVersion,
      newRunId: runId,
      newContract: {...contract, runId, driver: command.toDriver},
    });
    return { runId: result.runId, controlVersion: result.control.version, commandId: result.commandId, replayed: result.replayed };
  }

  private async requireControl(runId: string): Promise<RunControl> {
    const control = await this.deps.runRepository.getControl(runId);
    if (!control) throw new InvalidDirectorCommandError("找不到要操作的创作。");
    return control;
  }
}
