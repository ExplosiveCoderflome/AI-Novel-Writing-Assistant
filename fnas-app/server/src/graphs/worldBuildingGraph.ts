import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

function parseJSONObject(source: string): Record<string, string> {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("Missing JSON object.");
  }
  return JSON.parse(text.slice(first, last + 1)) as Record<string, string>;
}

export const WorldBuildingGraphAnnotation = Annotation.Root({
  seed: Annotation<string>(),
  name: Annotation<string>(),
  worldType: Annotation<string>(),
  axioms: Annotation<string>(),
  description: Annotation<string>(),
  background: Annotation<string>(),
  geography: Annotation<string>(),
  magicSystem: Annotation<string>(),
  technology: Annotation<string>(),
  races: Annotation<string>(),
  politics: Annotation<string>(),
  cultures: Annotation<string>(),
  religions: Annotation<string>(),
  history: Annotation<string>(),
  conflicts: Annotation<string>(),
  consistencyReport: Annotation<string>(),
  worldSummary: Annotation<string>(),
  error: Annotation<string | undefined>(),
});

export type WorldBuildingGraphState = typeof WorldBuildingGraphAnnotation.State;

async function seedNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Convert user seed into concise world description."),
      new HumanMessage(
        `name=${state.name}
worldType=${state.worldType}
seed=${state.seed}`,
      ),
    ]);
    return { description: typeof result.content === "string" ? result.content : JSON.stringify(result.content) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "seed node failed" };
  }
}

async function axiomNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Generate 5 core axioms as bullet lines."),
      new HumanMessage(
        `worldType=${state.worldType}
description=${state.description}`,
      ),
    ]);
    const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    return { axioms: text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "axiom node failed" };
  }
}

async function foundationNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Output JSON with fields background, geography."),
      new HumanMessage(
        `description=${state.description}
axioms=${state.axioms}
worldType=${state.worldType}`,
      ),
    ]);
    const parsed = parseJSONObject(typeof result.content === "string" ? result.content : JSON.stringify(result.content));
    return {
      background: parsed.background ?? "",
      geography: parsed.geography ?? "",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "foundation node failed" };
  }
}

async function powerNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Output JSON with fields magicSystem, technology."),
      new HumanMessage(
        `description=${state.description}
background=${state.background}
geography=${state.geography}
axioms=${state.axioms}`,
      ),
    ]);
    const parsed = parseJSONObject(typeof result.content === "string" ? result.content : JSON.stringify(result.content));
    return {
      magicSystem: parsed.magicSystem ?? "",
      technology: parsed.technology ?? "",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "power node failed" };
  }
}

async function societyNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Output JSON with fields races, politics."),
      new HumanMessage(
        `background=${state.background}
geography=${state.geography}
magicSystem=${state.magicSystem}
technology=${state.technology}`,
      ),
    ]);
    const parsed = parseJSONObject(typeof result.content === "string" ? result.content : JSON.stringify(result.content));
    return {
      races: parsed.races ?? "",
      politics: parsed.politics ?? "",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "society node failed" };
  }
}

async function cultureNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Output JSON with fields cultures, religions."),
      new HumanMessage(
        `races=${state.races}
politics=${state.politics}
background=${state.background}`,
      ),
    ]);
    const parsed = parseJSONObject(typeof result.content === "string" ? result.content : JSON.stringify(result.content));
    return {
      cultures: parsed.cultures ?? "",
      religions: parsed.religions ?? "",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "culture node failed" };
  }
}

async function historyNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Write concise world history timeline."),
      new HumanMessage(
        `description=${state.description}
background=${state.background}
politics=${state.politics}
cultures=${state.cultures}`,
      ),
    ]);
    return { history: typeof result.content === "string" ? result.content : JSON.stringify(result.content) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "history node failed" };
  }
}

async function conflictNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Write core world conflicts and narrative tension."),
      new HumanMessage(
        `axioms=${state.axioms}
politics=${state.politics}
history=${state.history}
magicSystem=${state.magicSystem}`,
      ),
    ]);
    return { conflicts: typeof result.content === "string" ? result.content : JSON.stringify(result.content) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "conflict node failed" };
  }
}

async function consistencyNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Output a concise consistency audit."),
      new HumanMessage(
        `axioms=${state.axioms}
magicSystem=${state.magicSystem}
technology=${state.technology}
politics=${state.politics}
history=${state.history}
conflicts=${state.conflicts}`,
      ),
    ]);
    return { consistencyReport: typeof result.content === "string" ? result.content : JSON.stringify(result.content) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "consistency node failed" };
  }
}

async function summaryNode(state: WorldBuildingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("Write final world summary in 5-8 lines."),
      new HumanMessage(
        `name=${state.name}
type=${state.worldType}
description=${state.description}
conflicts=${state.conflicts}
consistency=${state.consistencyReport}`,
      ),
    ]);
    return { worldSummary: typeof result.content === "string" ? result.content : JSON.stringify(result.content) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "summary node failed" };
  }
}

export function createWorldBuildingGraph(llm: BaseChatModel) {
  return new StateGraph(WorldBuildingGraphAnnotation)
    .addNode("seed", (state) => seedNode(state, llm))
    .addNode("axiom", (state) => axiomNode(state, llm))
    .addNode("foundation", (state) => foundationNode(state, llm))
    .addNode("power", (state) => powerNode(state, llm))
    .addNode("society", (state) => societyNode(state, llm))
    .addNode("culture", (state) => cultureNode(state, llm))
    .addNode("history", (state) => historyNode(state, llm))
    .addNode("conflict", (state) => conflictNode(state, llm))
    .addNode("consistency", (state) => consistencyNode(state, llm))
    .addNode("summary", (state) => summaryNode(state, llm))
    .addEdge(START, "seed")
    .addConditionalEdges("seed", (state) => (state.error ? END : "axiom"))
    .addConditionalEdges("axiom", (state) => (state.error ? END : "foundation"))
    .addConditionalEdges("foundation", (state) => (state.error ? END : "power"))
    .addConditionalEdges("power", (state) => (state.error ? END : "society"))
    .addConditionalEdges("society", (state) => (state.error ? END : "culture"))
    .addConditionalEdges("culture", (state) => (state.error ? END : "history"))
    .addConditionalEdges("history", (state) => (state.error ? END : "conflict"))
    .addConditionalEdges("conflict", (state) => (state.error ? END : "consistency"))
    .addConditionalEdges("consistency", (state) => (state.error ? END : "summary"))
    .addEdge("summary", END)
    .compile({
      name: "world-building-graph",
    });
}
