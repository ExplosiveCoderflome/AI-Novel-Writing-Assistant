# World Sandbox Simulation Design Specification

## 1. Overview
The **World Sandbox Simulation** is an autonomous simulation framework designed to model physical, ecological, and character behavioral state changes in the novel's world. This system operates as a lock-step turn-based simulator that produces consistent spatiotemporal observation feeds, ensuring narrative continuity and realistic world boundaries during automated novel drafting.

---

## 2. Architecture & Core Simulators

The simulation space is composed of locations connected via adjacency maps, populated by characters (agents), and advanced tick-by-tick.

```
+--------------------------------------------------------------+
|                     ChronologyBranchEngine                   |
|  (Zero-copy snapshot inheritance, future pruning on rewrite) |
+--------------------------------------------------------------+
                               │
                               ▼
+--------------------------------------------------------------+
|                    Lock-step Turn Controller                 |
+--------------------------------------------------------------+
         │                     │                     │
         ▼                     ▼                     ▼
+------------------+  +------------------+  +------------------+
|   EarthPhysics   |  |  CharacterAgent  |  |   Tension &      |
|    Simulator     |  |    Simulator     |  |  Conflict Engine |
| (Weather & Temp) |  | (Ebbinghaus, BT) |  | (Local / Global) |
+------------------+  +------------------+  +------------------+
         │                     │                     │
         +---------------------+---------------------+
                               │
                               ▼
+--------------------------------------------------------------+
|                VirtualCameraNarrativeEngine                  |
|    (Observation feeds & spatiotemporal anomaly checker)      |
+--------------------------------------------------------------+
```

---

## 3. Core Components

### 3.1 Earth Physics & Ecology Simulator (`EarthPhysicsSimulator`)
Models deterministic physical and biological conditions for location biomes:
- **Temperature & Solar Zenith**: Calculates base temperature using latitude, seasonal amplitude (sine approximation based on day of year), and diurnal fluctuation (daily hour angle). Applies a lapse rate temperature drop of $6.5^\circ\text{C}$ per $1000\text{m}$ elevation.
- **Ecological Balance**: Models soil moisture via precipitation gain, river irrigation, plant transpiration, and evapotranspiration.
- **Predator-Prey Dynamics**: Employs Lotka-Volterra equations capped by biome flora carrying capacity to simulate prey (herbivore) and predator population sizes over time.

### 3.2 Character Agent Simulator (`CharacterAgentSimulator`)
Models character memory, behavior levels, and social dynamics:
- **Ebbinghaus Memory Decay**: Salience of cognitive memories decays over time using $S(t) = S(t-1) \cdot e^{-\lambda \cdot dt}$. Memories with salience below $0.15$ are pruned.
- **Rumor Diffusion**: Diffuses rumors spatially to adjacent nodes, applying a mutation/exaggeration distortion rate during transmission.
- **Level of Detail (LOD) Decision Making**:
  - **LOD 1 (Protagonist)**: Invokes the `SandboxLlmScheduler` for LLM-driven complex decisions.
  - **LOD 2 (Background)**: Runs deterministic Behavior Trees tracking hunger, energy, and sanity.

### 3.3 Tension & Conflict Engine (`TensionAndConflictEngine`)
Manages local and global dramatic pacing:
- **Local Node Tension**: Computed based on environmental hazards, security modifiers, and relational friction between present agents.
- **Global Tension**: Aggregates the average of the top 3 highest-tension nodes to represent active storytelling intensity.
- **Encounter Detection & Initiative**: Groups characters spatially, detects encounter triggers, and arbitrates conflict actions using a turn initiative hierarchy.

### 3.4 Virtual Camera Narrative Engine (`VirtualCameraNarrativeEngine`)
Generates context feeds and audits manuscript drafts:
- **Viewport Feed Rendering**: Renders a Markdown observation feed compiling biome metrics, active characters, and direct/leakage (adjacent high-intensity events) observations.
- **Temporal Consistency Auditing**: Scans drafts for logical paradoxes, including deceased character activities, geographic instant-teleportation, and power rule cost violations.

### 3.5 Chronology Branch Engine (`ChronologyBranchEngine`)
Ensures database performance and timeline revision handling:
- **Zero-Copy Branches**: Creation of branches (`SandboxBranch`) inherits past tick snapshots from parent branches without duplicating database entries.
- **Future Pruning**: When chapters are rewritten or reverted, all sandbox snapshots and chronologies at or after the target tick are deleted, and affected chapters are flagged.

---

## 4. Location & Test Map

- **Implementation**: [server/src/services/world/](file:///c:/Users/lilin/GeneralAgent/server/src/services/world)
- **Unit Tests**:
  - [earthPhysicsSimulator.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/earthPhysicsSimulator.test.js)
  - [characterAgentSimulator.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/characterAgentSimulator.test.js)
  - [tensionAndConflictEngine.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/tensionAndConflictEngine.test.js)
  - [turnBasedSimulation.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/turnBasedSimulation.test.js)
  - [virtualCameraNarrativeEngine.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/virtualCameraNarrativeEngine.test.js)
  - [chronologyBranchEngine.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/chronologyBranchEngine.test.js)
