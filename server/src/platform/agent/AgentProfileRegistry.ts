/**
 * Digital Employee Profile Registry
 * Manages standardized Agent Profiles (Identity, Domain, Scope) across Daydream Engine.
 */
import { DigitalEmployeeProfile, AgentRoleType } from '@ai-novel/shared';

class AgentProfileRegistry {
  private profiles = new Map<AgentRoleType, DigitalEmployeeProfile>();

  constructor() {
    this.registerStandardProfiles();
  }

  private registerStandardProfiles() {
    // 1. Novel Director (AI 创作总监)
    this.registerProfile({
      id: 'novel-director-v1',
      identity: {
        role: 'novel-director',
        displayName: 'AI 创作总监',
        systemPersonaPrompt:
          '你是白日做梦引擎白日做梦总监 (Auto-Director)。你负责领衔全书从灵感、世界观、角色矩阵到卷拆章的全局创作规划与调度。',
        communicationTone: 'professional',
      },
      domain: {
        primaryCapability: '全书架构规划、导演推进、卷战略拆解与生产交接',
        allowedToolIds: ['generate_candidates', 'build_story_macro', 'build_structured_outline'],
        ragCollectionIds: ['world-blueprints', 'character-ledgers'],
      },
      scope: {
        riskTier: 'MEDIUM',
        maxTokenBudgetPerTurn: 4090,
        requiresHumanApproval: false,
        allowedRoutePrefixes: ['/api/novel/director'],
      },
      createdVersion: 'v0.5.1',
    });

    // 2. Style Auditor (文风与叙事审校官)
    this.registerProfile({
      id: 'style-auditor-v1',
      identity: {
        role: 'style-auditor',
        displayName: '文风叙事审校官',
        systemPersonaPrompt:
          '你是负责作品叙事质量与 AI 味消除的资深文风审校官。你依据 Anti-AI 规则库与作者创作画像（TELOS）进行微观修辞与节奏审核。',
        communicationTone: 'strict',
      },
      domain: {
        primaryCapability: '文风指标提取、AI 味风险检测、语句修辞打磨与质量债务记录',
        allowedToolIds: ['audit_style', 'detect_ai_tropes', 'patch_prose'],
        ragCollectionIds: ['style-rules'],
      },
      scope: {
        riskTier: 'LOW',
        maxTokenBudgetPerTurn: 2000,
        requiresHumanApproval: false,
        allowedRoutePrefixes: ['/api/novel/audit'],
      },
      createdVersion: 'v0.5.1',
    });

    // 3. Crossover Operator (演化算子专家)
    this.registerProfile({
      id: 'crossover-operator-v1',
      identity: {
        role: 'crossover-operator',
        displayName: 'OpenRSI 演化算子专家',
        systemPersonaPrompt:
          '你是 OpenRSI 基因交叉重组算子 (Crossover Operator)。你擅长将母本 A 的情节节奏与母本 B 的气氛文风解构并优生重组。',
        communicationTone: 'creative',
      },
      domain: {
        primaryCapability: '候选段落解构、基因片段杂交、淘劣与最佳特征重组',
        allowedToolIds: ['trigger_crossover', 'mutate_prose'],
        ragCollectionIds: [],
      },
      scope: {
        riskTier: 'MEDIUM',
        maxTokenBudgetPerTurn: 3000,
        requiresHumanApproval: false,
        allowedRoutePrefixes: ['/api/novel/operators'],
      },
      createdVersion: 'v0.5.1',
    });
  }

  public registerProfile(profile: DigitalEmployeeProfile): void {
    this.profiles.set(profile.identity.role, profile);
  }

  public getProfile(role: AgentRoleType): DigitalEmployeeProfile {
    const profile = this.profiles.get(role);
    if (!profile) {
      throw new Error(`[AgentProfileRegistry] Profile not found for role: ${role}`);
    }
    return profile;
  }

  public listProfiles(): DigitalEmployeeProfile[] {
    return Array.from(this.profiles.values());
  }
}

export const agentProfileRegistry = new AgentProfileRegistry();
