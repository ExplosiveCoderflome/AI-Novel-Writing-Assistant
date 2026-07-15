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
    characterStates: Array<{ name: string; isAlive: boolean; locationId: string }>
  ): { pass: boolean; issues: string[] } {
    const issues: string[] = [];
    
    characterStates.forEach(char => {
      // 1. Deceased character action/speech check
      if (!char.isAlive) {
        const speakRegex = new RegExp(`${char.name}[^。！？]*?(?:说|道|喊|哭|冷笑|怒斥|心想|暗忖|点点头|摇摇头)`, "g");
        if (speakRegex.test(narrativeText)) {
          issues.push(`时空逻辑悖论: 角色 ${char.name} 已死亡，但其在初稿中存在台词或动作描写。`);
        }
      }
    });

    return {
      pass: issues.length === 0,
      issues
    };
  }
}
