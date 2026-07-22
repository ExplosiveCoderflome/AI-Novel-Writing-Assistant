export interface AgentTensionState {
  id: string;
  stress: number; // Internal anxiety/stress (0 ~ 10)
}

export interface AgentRelationTension {
  agentAId: string;
  agentBId: string;
  tension: number; // Relational friction/tension (0 ~ 10)
}

export interface LocationTensionParams {
  id: string;
  hazardLevel: number; // Environmental danger index (0 ~ 10)
  securityModifier: number; // Positive values decrease safety, negative values increase safety (-30 ~ 30)
}

export interface CharacterIntention {
  characterId: string;
  locationId: string;
  actionGoal: string; // e.g. "assassinate", "confront", "cooperate", "trade"
  isAggressive: boolean;
}

export interface EncounterEvent {
  locationId: string;
  characterIds: string[];
  localTension: number;
  triggerArbitration: boolean;
  reason: string;
}

export class TensionAndConflictEngine {
  /**
   * Calculate local node dramatic tension index based on presence of agents, their relationship friction,
   * local hazard levels, and security modifiers.
   */
  public calculateLocalTension(
    location: LocationTensionParams,
    agents: AgentTensionState[],
    relations: AgentRelationTension[]
  ): number {
    if (agents.length < 2) {
      // Just hazard and security if lone agent
      const base = location.hazardLevel * 4 + location.securityModifier;
      return Math.max(0, Math.min(100, base));
    }

    let relationalSum = 0;

    // Sum tension factor for all unique pairs (i, j)
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const agentA = agents[i];
        const agentB = agents[j];
        
        // Find relation tension between i and j (default to 1.0 if not specified)
        const rel = relations.find(
          r => (r.agentAId === agentA.id && r.agentBId === agentB.id) ||
               (r.agentAId === agentB.id && r.agentBId === agentA.id)
        );
        const relTension = rel ? rel.tension : 1.0;
        
        // Equation: (Stress_i * Stress_j) * RelTension_ij * 0.01
        relationalSum += (agentA.stress * agentB.stress) * relTension * 0.01;
      }
    }

    const localTension = relationalSum + (location.hazardLevel * 4) + location.securityModifier;
    return Math.max(0, Math.min(100, Number(localTension.toFixed(2))));
  }

  /**
   * Calculate the global story tension index using local tensions and pacing weights.
   */
  public calculateGlobalTension(localTensions: number[], pacingModifier: number = 0): number {
    if (localTensions.length === 0) return 0;
    
    // Average of top 3 highest tension nodes to reflect focal story intensity
    const sorted = [...localTensions].sort((a, b) => b - a);
    const topTensions = sorted.slice(0, 3);
    const average = topTensions.reduce((sum, val) => sum + val, 0) / topTensions.length;
    
    return Math.max(0, Math.min(100, Number((average + pacingModifier).toFixed(2))));
  }

  /**
   * Evaluates spatial encounters and flags high-risk crossings for conflict arbitration.
   */
  public detectEncounters(
    intentions: CharacterIntention[],
    localTensions: Record<string, number>
  ): EncounterEvent[] {
    const locationGroups: Record<string, CharacterIntention[]> = {};
    
    // Group characters by current location
    intentions.forEach(intent => {
      if (!locationGroups[intent.locationId]) {
        locationGroups[intent.locationId] = [];
      }
      locationGroups[intent.locationId].push(intent);
    });

    const encounters: EncounterEvent[] = [];

    Object.entries(locationGroups).forEach(([locationId, group]) => {
      if (group.length < 2) return; // Need at least two characters to clash
      
      const characterIds = group.map(i => i.characterId);
      const localTension = localTensions[locationId] || 0;
      
      let triggerArbitration = false;
      let reason = "Routine encounter.";

      // 1. Trigger if local tension is critical (>= 75)
      if (localTension >= 75) {
        triggerArbitration = true;
        reason = `Node tension is critical (${localTension}).`;
      }

      // 2. Trigger if any agent in the group has aggressive intentions
      const aggressiveIntent = group.find(i => i.isAggressive);
      if (aggressiveIntent) {
        triggerArbitration = true;
        reason = `Aggressive action: Character ${aggressiveIntent.characterId} aims to '${aggressiveIntent.actionGoal}'.`;
      }

      encounters.push({
        locationId,
        characterIds,
        localTension,
        triggerArbitration,
        reason
      });
    });

    return encounters;
  }

  /**
   * Adjust sandbox tick time step size (pacing scale) based on local/global tension levels.
   * If tension is high (>= 75), shift down to MICRO mode (pacingScale = 1 tick/step) to capture detail.
   * If tension is low (< 40), shift up to MACRO mode (pacingScale = 24 ticks/step) for fast forward.
   */
  public determinePacingScale(globalTension: number, localTensions: number[]): "micro" | "macro" | "normal" {
    const hasCriticalNode = localTensions.some(t => t >= 75);
    if (globalTension >= 70 || hasCriticalNode) {
      return "micro"; // Pacing speed slows down to highlight direct conflicts
    }
    if (globalTension <= 35) {
      return "macro"; // Fast forward
    }
    return "normal";
  }

  /**
   * Arbitrates a conflict between two agents based on custom conflict rules.
   * Returns a description of the result, winner, stress/sanity changes, and bond level impact.
   */
  public arbitrateConflict(
    conflictType: string,
    agentA: { id: string; name: string; combatPower: number; status: Record<string, any> },
    agentB: { id: string; name: string; combatPower: number; status: Record<string, any> },
    arbitrationRule: string
  ): { winnerId: string; loserId: string; narrativeResult: string; stressChangeA: number; stressChangeB: number } {
    let scoreA = agentA.combatPower;
    let scoreB = agentB.combatPower;

    if (conflictType === "court_debate" || arbitrationRule.includes("intelligence")) {
      const intA = agentA.status.intelligence || 10;
      const intB = agentB.status.intelligence || 10;
      scoreA = intA + Math.random() * 5;
      scoreB = intB + Math.random() * 5;
    } else {
      scoreA += Math.random() * 10;
      scoreB += Math.random() * 10;
    }

    const winner = scoreA >= scoreB ? agentA : agentB;
    const loser = scoreA >= scoreB ? agentB : agentA;

    let narrativeResult = "";
    if (conflictType === "court_debate") {
      narrativeResult = `在公堂辩论中，${winner.name} 词锋犀利，依据『${arbitrationRule}』成功驳倒 ${loser.name}，并揭示了部分秘密。`;
    } else {
      narrativeResult = `${winner.name} 在冲突中击败了 ${loser.name}，判定符合规则：『${arbitrationRule}』。`;
    }

    return {
      winnerId: winner.id,
      loserId: loser.id,
      narrativeResult,
      stressChangeA: winner.id === agentA.id ? -2 : 4,
      stressChangeB: winner.id === agentB.id ? -2 : 4
    };
  }

  /**
   * Sorts declared actions in a turn based on action type priority and character agility/stats.
   */
  public sortActionsByInitiative(
    actions: Array<{
      characterId: string;
      actionType: string;
      intentionSpeed?: number;
      targetId?: string;
      targetLocationId?: string;
      narrativeAction?: string;
    }>,
    charactersState: Array<{
      id: string;
      name: string;
      stress?: number;
      hunger?: number;
      energy?: number;
      sanity?: number;
      realm?: string;
      customProperties?: Record<string, any>;
    }>
  ): any[] {
    const actionPriorityMap: Record<string, number> = {
      DEFEND: 50,
      FLEE: 40,
      ATTACK: 30,
      MOVE: 20,
      SOCIALIZE: 10,
      REST: 10
    };

    return [...actions].map(action => {
      const char = charactersState.find(c => c.id === action.characterId);
      const actionWeight = actionPriorityMap[action.actionType.toUpperCase()] ?? 10;
      
      // Resolve character speed modifiers
      const agility = char?.customProperties?.agility ?? char?.customProperties?.speed ?? 10;
      const speedModifier = Number(agility) * 0.1;
      
      const intentionSpeed = action.intentionSpeed ?? 50;

      // Absolute Initiative = Action Weight + speed modifier + (intention speed * 0.2) + random variance
      const absoluteInitiative = actionWeight + speedModifier + (intentionSpeed * 0.2) + Math.random() * 5;

      return {
        ...action,
        absoluteInitiative: Number(absoluteInitiative.toFixed(2))
      };
    }).sort((a, b) => b.absoluteInitiative - a.absoluteInitiative);
  }

  /**
   * Resolves sorted action intentions sequentially to preserve causality.
   * Modifies character states in-place and returns narrative results.
   */
  public resolveInitiativeChain(
    sortedActions: any[],
    charactersState: any[],
    customConflictSchemas: any[]
  ): { narrativeLogs: string[] } {
    const narrativeLogs: string[] = [];

    // Dynamically identify conflict actions from registered schemas
    const conflictSchemaMap = new Map<string, any>();
    for (const schema of customConflictSchemas) {
      conflictSchemaMap.set(schema.conflictType.toUpperCase(), schema);
    }

    // A helper to resolve character combat power based on conflict arbitration rule text
    const getConflictPower = (char: any, rule: string): number => {
      const props = char.customProperties || {};
      const ruleLower = rule.toLowerCase();
      
      // Look for custom property matching words in the rule
      for (const key of Object.keys(props)) {
        if (ruleLower.includes(key.toLowerCase())) {
          const val = Number(props[key]);
          if (!isNaN(val)) return val;
        }
      }
      
      // Generic fallbacks
      const defaultPower = props.martialPower ?? props.combatPower ?? props.intelligence ?? props.power ?? props.strength ?? 20;
      return Number(defaultPower);
    };

    for (const action of sortedActions) {
      const actor = charactersState.find(c => c.id === action.characterId);
      if (!actor) continue;

      // Check if actor is disabled (stunned or health <= 0) from prior actions in this tick
      if (actor.energy <= 0 || actor.sanity <= 20) {
        narrativeLogs.push(`[因果中断] ${actor.name} 试图执行 ${action.actionType}，但由于已精疲力竭或受重创，行动被迫中断。`);
        continue;
      }

      const actionUpper = action.actionType.toUpperCase();

      if (actionUpper === "FLEE") {
        const prevLocation = actor.locationId;
        const targetLocation = action.targetLocationId ?? action.targetId;
        if (targetLocation && targetLocation !== prevLocation) {
          actor.locationId = targetLocation;
          actor.stress = Math.max(0, (actor.stress ?? 2) + 1); // Fleeing increases stress
          actor.energy = Math.max(0, actor.energy - 10);
          narrativeLogs.push(`[FLEE] ${actor.name} 见势不妙，率先抽身避开，转移至新的区域。`);
        }
      } 
      else if (actionUpper === "MOVE") {
        const prevLocation = actor.locationId;
        const targetLocation = action.targetLocationId ?? action.targetId;
        if (targetLocation && targetLocation !== prevLocation) {
          actor.locationId = targetLocation;
          actor.energy = Math.max(0, actor.energy - 15);
          narrativeLogs.push(`[MOVE] ${actor.name} 移动至新的地标。`);
        }
      } 
      else if (actionUpper === "DEFEND") {
        actor.stress = Math.max(0, (actor.stress ?? 2) - 1);
        actor.energy = Math.max(0, actor.energy - 5);
        narrativeLogs.push(`[DEFEND] ${actor.name} 摆出守势，防范潜在冲突。`);
      }
      else if (actionUpper === "ATTACK" || conflictSchemaMap.has(actionUpper)) {
        const target = charactersState.find(c => c.id === (action.targetId ?? action.targetLocationId));
        if (!target) continue;

        // Check if target has fled first in this tick!
        if (target.locationId !== actor.locationId) {
          narrativeLogs.push(`[冲突落空] ${actor.name} 试图对 ${target.name} 发起 [${actionUpper}] 冲突，但 ${target.name} 已提前离开，行动落空！`);
          continue;
        }

        // Get matching conflict schema details
        const schema = conflictSchemaMap.get(actionUpper) || conflictSchemaMap.get("ATTACK") || {
          conflictType: "conflict",
          arbitrationRule: "力量与境界比拼"
        };
        const rule = schema.arbitrationRule;

        // Perform arbitration
        const combatPowerA = getConflictPower(actor, rule) + (actor.energy * 0.1);
        const combatPowerB = getConflictPower(target, rule) + (target.energy * 0.1);

        const result = this.arbitrateConflict(
          schema.conflictType,
          { id: actor.id, name: actor.name, combatPower: combatPowerA, status: { intelligence: 10 } },
          { id: target.id, name: target.name, combatPower: combatPowerB, status: { intelligence: 10 } },
          rule
        );

        // Mutate target and actor state
        if (result.winnerId === actor.id) {
          target.stress = Math.min(10, (target.stress ?? 2) + 3);
          target.energy = Math.max(0, target.energy - 25);
          target.sanity = Math.max(0, target.sanity - 20);
        } else {
          actor.stress = Math.min(10, (actor.stress ?? 2) + 3);
          actor.energy = Math.max(0, actor.energy - 20);
          actor.sanity = Math.max(0, actor.sanity - 15);
        }

        narrativeLogs.push(`[冲突结算] ${result.narrativeResult}`);
      }
      else {
        // SOCIALIZE / REST / other
        actor.energy = Math.min(100, actor.energy + (actionUpper === "REST" ? 20 : -5));
        actor.sanity = Math.min(100, actor.sanity + 10);
        narrativeLogs.push(`[${actionUpper}] ${actor.name} 进行了日常修整或交际行动。`);
      }
    }

    return { narrativeLogs };
  }
}
