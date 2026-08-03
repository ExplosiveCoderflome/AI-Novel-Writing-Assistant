/**
 * Long-Lived Thread Service with Prompt Cache Optimization & Working Memory Compaction.
 * Preserves Agent "seniority" and implicit user preferences across invocations.
 */
import { AgentRoleType, DigitalEmployeeProfile } from '@ai-novel/shared';
import { agentProfileRegistry } from './AgentProfileRegistry';

export interface ThreadTurnMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokensEstimate?: number;
}

export interface LongLivedThreadState {
  threadId: string;
  workspaceId: string;
  agentRole: AgentRoleType;
  profileId: string;
  staticPromptHead: string;         // System Persona + Domain Rules (Guarantees Prompt Cache Hits)
  workingMemoryDigest: string;       // Compacted past preference & correction rules
  turnMessages: ThreadTurnMessage[]; // Active turns
  lastActiveAt: number;
}

export class LongLivedThreadService {
  private threads = new Map<string, LongLivedThreadState>(); // Key: workspaceId:agentRole

  private getThreadKey(workspaceId: string, role: AgentRoleType): string {
    return `${workspaceId}:${role}`;
  }

  /**
   * Get or initialize a permanent thread for an Agent Profile in a given workspace.
   */
  public getOrCreateThread(workspaceId: string, role: AgentRoleType): LongLivedThreadState {
    const key = this.getThreadKey(workspaceId, role);
    let thread = this.threads.get(key);

    if (!thread) {
      const profile: DigitalEmployeeProfile = agentProfileRegistry.getProfile(role);
      const staticPromptHead = this.buildStaticPromptHead(profile);

      thread = {
        threadId: `thread-${role}-${Date.now()}`,
        workspaceId,
        agentRole: role,
        profileId: profile.id,
        staticPromptHead,
        workingMemoryDigest: '',
        turnMessages: [],
        lastActiveAt: Date.now(),
      };

      this.threads.set(key, thread);
    }

    return thread;
  }

  /**
   * Builds the deterministic, static header to maximize Prompt Cache hits.
   */
  private buildStaticPromptHead(profile: DigitalEmployeeProfile): string {
    return [
      `=== [DIGITAL EMPLOYEE: ${profile.identity.displayName}] ===`,
      `ROLE: ${profile.identity.role}`,
      `SYSTEM PERSONA: ${profile.identity.systemPersonaPrompt}`,
      `PRIMARY CAPABILITY: ${profile.domain.primaryCapability}`,
      `RISK TIER: ${profile.scope.riskTier}`,
      `COMMUNICATION TONE: ${profile.identity.communicationTone}`,
    ].join('\n');
  }

  /**
   * Assembles the optimized execution context messages array for LLM calls.
   */
  public assembleThreadContext(workspaceId: string, role: AgentRoleType, userPrompt: string): Array<{ role: string; content: string }> {
    const thread = this.getOrCreateThread(workspaceId, role);
    thread.lastActiveAt = Date.now();

    // Perform compaction check if turn messages exceed threshold
    this.compactIfNeeded(thread);

    // 1. Static System Head (Triggers Prompt Cache)
    let systemContent = thread.staticPromptHead;
    if (thread.workingMemoryDigest) {
      systemContent += `\n\n=== [WORKING MEMORY DIGEST & USER PREFERENCES] ===\n${thread.workingMemoryDigest}`;
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemContent },
    ];

    // 2. Active turns in Thread
    for (const turn of thread.turnMessages) {
      messages.push({ role: turn.role, content: turn.content });
    }

    // 3. Current User Input
    messages.push({ role: 'user', content: userPrompt });

    // Perform background compaction check if turn messages exceed threshold
    this.compactIfNeeded(thread);

    return messages;
  }

  /**
   * Record completion response back into the thread.
   */
  public appendResponse(workspaceId: string, role: AgentRoleType, userPrompt: string, assistantResponse: string): void {
    const thread = this.getOrCreateThread(workspaceId, role);
    const now = Date.now();

    thread.turnMessages.push({ role: 'user', content: userPrompt, timestamp: now });
    thread.turnMessages.push({ role: 'assistant', content: assistantResponse, timestamp: now });
    thread.lastActiveAt = now;
  }

  /**
   * Dynamic Warm Memory Compactor: Compresses turns into a digest when context grows large.
   */
  private compactIfNeeded(thread: LongLivedThreadState): void {
    if (thread.turnMessages.length > 8) {
      const turnsToCompress = thread.turnMessages.slice(0, 4);
      thread.turnMessages = thread.turnMessages.slice(4);

      // Extract key user preferences or corrections
      const preferenceNotes = turnsToCompress
        .filter((t) => t.role === 'user' && (t.content.includes('偏好') || t.content.includes('修正') || t.content.includes('风格')))
        .map((t) => `- User Feedback: ${t.content}`)
        .join('\n');

      if (preferenceNotes) {
        thread.workingMemoryDigest += (thread.workingMemoryDigest ? '\n' : '') + preferenceNotes;
      }
    }
  }

  public getThreadState(workspaceId: string, role: AgentRoleType): LongLivedThreadState {
    return this.getOrCreateThread(workspaceId, role);
  }
}

export const longLivedThreadService = new LongLivedThreadService();
