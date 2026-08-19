/**
 * Digital Employee Profile & Agent Contract Definitions
 * Defines Identity, Domain, and Scope for specialized agents in Daydream Engine.
 */

export type AgentRoleType =
  | 'novel-director'
  | 'style-auditor'
  | 'crossover-operator'
  | 'world-keeper'
  | 'character-architect';

export interface AgentIdentity {
  role: AgentRoleType;
  displayName: string;
  avatarUrl?: string;
  systemPersonaPrompt: string;
  communicationTone: 'professional' | 'creative' | 'strict' | 'supportive';
}

export interface AgentDomain {
  primaryCapability: string;
  allowedToolIds: string[];
  ragCollectionIds: string[];
  outputFormatSchema?: string;
}

export interface AgentScope {
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  maxTokenBudgetPerTurn: number;
  requiresHumanApproval: boolean;
  allowedRoutePrefixes: string[];
}

export interface DigitalEmployeeProfile {
  id: string;
  identity: AgentIdentity;
  domain: AgentDomain;
  scope: AgentScope;
  createdVersion: string;
}
