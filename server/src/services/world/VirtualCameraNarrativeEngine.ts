export interface CameraViewport {
  locationId: string;
  locationName: string;
  elevation: number;
  temperature: number;
  lux: number;
  localFlora: number;
  activeCharacters: string[];
}

export interface SandboxEvent {
  locationId: string;
  intensity: number; // 0.0 ~ 5.0
  description: string;
}

export class VirtualCameraNarrativeEngine {
  /**
   * Filter events visible or audible from a specific camera position.
   * Includes direct events from the camera node, and adjacent high-intensity leakages.
   */
  public filterCameraEvents(
    viewport: CameraViewport,
    adjacentLocationIds: string[],
    allEvents: SandboxEvent[]
  ): { directEvents: string[]; leakages: string[] } {
    const directEvents: string[] = [];
    const leakages: string[] = [];

    allEvents.forEach(evt => {
      if (evt.locationId === viewport.locationId) {
        directEvents.push(evt.description);
      } else if (adjacentLocationIds.includes(evt.locationId) && evt.intensity >= 4.0) {
        // High intensity events (>= 4.0) leak to adjacent locations (sound/light leak)
        leakages.push(`${evt.description} (声光从相邻区域渗漏过界，强度为 ${evt.intensity})`);
      }
    });

    return { directEvents, leakages };
  }

  /**
   * Compiles viewport metrics and events into a Markdown observation feed.
   */
  public renderCameraFeedTemplate(params: {
    viewport: CameraViewport;
    directEvents: string[];
    leakages: string[];
  }): string {
    const { viewport, directEvents, leakages } = params;
    return `
# VIRTUAL CAMERA OBSERVATION FEED
**Location:** ${viewport.locationName} (Elevation: ${viewport.elevation}m)
**Atmosphere:** Temp ${viewport.temperature.toFixed(1)}°C | Illumination ${viewport.lux} Lux

## Scene Composition
- **Flora Cover:** ${(viewport.localFlora * 100).toFixed(0)}%
- **Active Agents present:** ${viewport.activeCharacters.join(", ") || "None"}

## Direct Observations (In-Focus)
${directEvents.map(e => `- ${e}`).join("\n") || "- No significant direct events."}

## Peripheral Leakages (Out-of-Focus)
${leakages.map(l => `- [Distal Sound/Light] ${l}`).join("\n") || "- No adjacent leakages."}
`.trim();
  }

  /**
   * Parses generated narrative text and cross-references it with sandbox state snapshots.
   * Flags logical and temporal consistency issues.
   */
  public checkConsistency(
    narrativeText: string,
    characterStates: Array<{ name: string; isAlive: boolean; locationId: string; [key: string]: any }>,
    options?: {
      locations?: Array<{ id: string; name: string }>;
      worldRules?: Array<{ name: string; cost?: string }>;
      adjacencyMap?: Record<string, string[]>;
    }
  ): { pass: boolean; issues: string[] } {
    const issues: string[] = [];
    
    characterStates.forEach(char => {
      // 1. Deceased character action/speech check
      if (char.isAlive === false) {
        const speakRegex = new RegExp(`${char.name}[^。！？]*?(?:说|道|喊|哭|冷笑|怒斥|心想|暗忖|点点头|摇摇头)`, "g");
        if (speakRegex.test(narrativeText)) {
          issues.push(`时空逻辑悖论: 角色 ${char.name} 已死亡，但其在初稿中存在台词或动作描写。`);
        }
      }

      // 2. 地理瞬间位移悖论检测
      if (options?.locations && char.locationId) {
        const currentLoc = options.locations.find(l => l.id === char.locationId);
        if (currentLoc) {
          options.locations.forEach(otherLoc => {
            if (otherLoc.id !== char.locationId) {
              const actionRegex = new RegExp(`${char.name}[^。！？]*?在${otherLoc.name}(?:说话|出手|现身|抵达|大笑|流泪|练功|练剑|行走)`, "g");
              if (actionRegex.test(narrativeText)) {
                const isAdjacent = options.adjacencyMap?.[char.locationId]?.includes(otherLoc.id);
                const mentionMove = new RegExp(`${char.name}[^。！？]*?(?:赶往|去往|移动到|传送|出发|御剑|走向|来到)${otherLoc.name}`, "g").test(narrativeText);
                if (!isAdjacent && !mentionMove) {
                  issues.push(`时空逻辑悖论: 角色 ${char.name} 描写在${otherLoc.name}活动，但根据沙盒状态其当前处于不相邻的${currentLoc.name}，且文中未描写移动或传送过程。`);
                }
              }
            }
          });
        }
      }
    });

    // 3. 超凡力量代价悖论检测
    if (options?.worldRules) {
      options.worldRules.forEach(rule => {
        if (rule.cost && rule.cost.trim().length > 0) {
          const useRegex = new RegExp(`(?:使用|施展|催动|爆发|动用|祭出)[^。！？]*?${rule.name}`, "g");
          if (useRegex.test(narrativeText)) {
            const costKeywords = ["代价", "消耗", "损耗", "疲惫", "脱力", "虚弱", "反噬", "血", "伤", rule.cost.slice(0, 4)];
            const mentionCost = costKeywords.some(kw => narrativeText.includes(kw));
            if (!mentionCost) {
              issues.push(`规则代价漏洞: 文中描写了施展/催动『${rule.name}』，但并未描写或体现该规则所要求的代价（要求：${rule.cost}）。`);
            }
          }
        }
      });
    }

    return {
      pass: issues.length === 0,
      issues
    };
  }
}
