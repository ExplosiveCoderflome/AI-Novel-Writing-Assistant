export interface CognitiveMemory {
  id: string;
  fact: string;
  salience: number; // 0.0 ~ 1.0
  tickCreated: number;
  lastUpdatedTick: number;
}

export interface Rumor {
  id: string;
  content: string;
  originatorId: string;
  currentLocationId: string;
  intensity: number; // 0.0 ~ 5.0 (dramatic weight)
  distortionCount: number;
  facts: string[]; // key factual elements
}

export interface CharacterState {
  id: string;
  name: string;
  lod: 1 | 2; // LOD 1 (LLM/Protagonist), LOD 2 (Behavior Tree/Background)
  currentLocationId: string;
  hunger: number; // 0 ~ 100
  energy: number; // 0 ~ 100
  sanity: number; // 0 ~ 100
  customPropertiesJson: string; // EAV storage
  memories: CognitiveMemory[];
}

export interface LocationAdjacentMap {
  [locationId: string]: string[];
}

export class CharacterAgentSimulator {
  /**
   * Decay memories using the Ebbinghaus forgetting curve formula: S(t) = S(t-1) * e^(-lambda * dt)
   * Memories are erased when salience falls below 0.15.
   */
  public decayMemories(
    memories: CognitiveMemory[],
    currentTick: number,
    forgettingFactor: number = 0.05 // lambda parameter
  ): CognitiveMemory[] {
    return memories
      .map(m => {
        const dt = currentTick - m.lastUpdatedTick;
        if (dt <= 0) return m;
        const newSalience = m.salience * Math.exp(-forgettingFactor * dt);
        return {
          ...m,
          salience: Number(newSalience.toFixed(4)),
          lastUpdatedTick: currentTick
        };
      })
      .filter(m => m.salience >= 0.15);
  }

  /**
   * Diffuse rumors to adjacent locations with mutation/distortion rate.
   * Rumors gain dramatic intensity and distort their facts.
   */
  public diffuseRumor(
    rumor: Rumor,
    adjacencyMap: LocationAdjacentMap,
    distortionRate: number = 0.3
  ): Rumor[] {
    const adjacentLocations = adjacencyMap[rumor.currentLocationId] || [];
    return adjacentLocations.map(adjLocId => {
      let content = rumor.content;
      let intensity = rumor.intensity;
      let distortionCount = rumor.distortionCount;
      let facts = [...rumor.facts];

      // Mutate content and facts with a probability
      if (Math.random() < distortionRate) {
        distortionCount += 1;
        // Exaggerate intensity
        intensity = Math.min(5.0, intensity * (1.1 + Math.random() * 0.3));
        
        // Mutate rumor text prefix
        const mutations = [
          "据传闻，",
          "有人亲眼目睹，",
          "十万火急！据说",
          "江湖传言，"
        ];
        const stripped = content.replace(/^(据传闻，|有人亲眼目睹，|十万火急！据说|江湖传言，)/, "");
        content = mutations[Math.floor(Math.random() * mutations.length)] + stripped;
        
        // Mutate first factual element
        if (facts.length > 0) {
          facts[0] = facts[0] + " (传言夸大)";
        }
      }

      return {
        id: `${rumor.id}_diff_${adjLocId}_${Date.now()}`,
        content,
        originatorId: rumor.originatorId,
        currentLocationId: adjLocId,
        intensity: Number(intensity.toFixed(2)),
        distortionCount,
        facts
      };
    });
  }

  /**
   * Level of Detail 2 (LOD 2) Behavior Tree decision logic.
   * Runs local status rules for background agents with zero token overhead.
   */
  public evaluateLOD2Decision(
    character: CharacterState,
    adjacentLocations: string[]
  ): { action: string; targetLocationId?: string; energyDelta: number; hungerDelta: number; sanityDelta: number } {
    // 1. Sleep/Rest if extremely fatigued
    if (character.energy < 20) {
      return {
        action: "REST",
        energyDelta: 30,
        hungerDelta: 5,
        sanityDelta: 5
      };
    }
    
    // 2. Search for food/supplies if starving
    if (character.hunger > 80) {
      return {
        action: "FORAGE",
        energyDelta: -10,
        hungerDelta: -30,
        sanityDelta: -5
      };
    }
    
    // 3. Relax or recover sanity if mentally compromised
    if (character.sanity < 30) {
      return {
        action: "REST",
        energyDelta: 15,
        hungerDelta: 5,
        sanityDelta: 20
      };
    }
    
    // 4. Probability of moving to adjacent nodes
    if (adjacentLocations.length > 0 && Math.random() < 0.4) {
      const targetLocationId = adjacentLocations[Math.floor(Math.random() * adjacentLocations.length)];
      return {
        action: "MOVE",
        targetLocationId,
        energyDelta: -15,
        hungerDelta: 10,
        sanityDelta: 0
      };
    }
    
    // 5. Gather information or socialize locally
    return {
      action: "SOCIALIZE",
      energyDelta: -5,
      hungerDelta: 5,
      sanityDelta: 10
    };
  }

  /**
   * Determines if a focal character (LOD 1) requires scheduling a heavy LLM decision.
   * Keeps token consumption minimal by scheduling dynamically.
   */
  public shouldScheduleLOD1LLMDecision(
    character: CharacterState,
    localTension: number,
    rivalPresent: boolean
  ): boolean {
    if (localTension >= 70) return true;
    if (rivalPresent) return true;
    if (character.sanity <= 30) return true;
    if (character.hunger >= 85) return true;
    return false;
  }
}
