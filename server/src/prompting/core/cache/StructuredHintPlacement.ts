import type { BaseMessage } from "@langchain/core/messages";
export function placeStructuredHint(messages: BaseMessage[], hint: BaseMessage, stable: boolean): BaseMessage[] {
    if (!stable)
        return [...messages, hint];
    // Preserve message roles: stable schema remains user guidance after leading system rules.
    const at = messages.findIndex(m => m.type !== "system");
    const index = at < 0 ? messages.length : at;
    return [...messages.slice(0, index), hint, ...messages.slice(index)];
}
