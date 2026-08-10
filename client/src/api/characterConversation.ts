import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  CharacterConversationContext,
  CharacterConversationSession,
  CharacterConversationTurn,
  CharacterSubjectRef,
} from "@ai-novel/shared/types/characterConversation";
import type { CharacterDialogueInfluence } from "@ai-novel/shared/types/characterDialogue";
import { apiClient } from "./client";

export type CharacterConversationSessionView = CharacterConversationSession & {
  latestInfluence?: CharacterDialogueInfluence | null;
};

export interface CharacterConversationTurnResult {
  session: CharacterConversationSessionView;
  characterTurn: CharacterConversationTurn;
  influence?: CharacterDialogueInfluence | null;
}

export interface CharacterConversationRequest extends CharacterSubjectRef {
  chapterAnchor?: number | null;
}

function toRequestParams(request: CharacterConversationRequest) {
  return {
    kind: request.kind,
    id: request.id,
    scopeKind: request.scopeKind,
    scopeId: request.scopeId ?? undefined,
    chapterAnchor: request.chapterAnchor ?? undefined,
  };
}

export async function getCharacterConversationContext(request: CharacterConversationRequest) {
  const { data } = await apiClient.get<ApiResponse<CharacterConversationContext>>(
    "/character-conversations/context",
    { params: toRequestParams(request) },
  );
  return data;
}

export async function getActiveCharacterConversationSession(request: CharacterConversationRequest) {
  const { data } = await apiClient.get<ApiResponse<CharacterConversationSessionView | null>>(
    "/character-conversations/sessions/active",
    { params: toRequestParams(request) },
  );
  return data;
}

export async function createCharacterConversationSession(request: CharacterConversationRequest) {
  const { data } = await apiClient.post<ApiResponse<CharacterConversationSessionView>>(
    "/character-conversations/sessions",
    toRequestParams(request),
  );
  return data;
}

export async function sendCharacterConversationTurn(
  sessionId: string,
  request: CharacterConversationRequest,
  payload: { message: string },
) {
  const { data } = await apiClient.post<ApiResponse<CharacterConversationTurnResult>>(
    `/character-conversations/sessions/${sessionId}/turns`,
    { ...toRequestParams(request), ...payload },
  );
  return data;
}

export async function activateCharacterConversationInfluence(sessionId: string, request: CharacterConversationRequest) {
  const { data } = await apiClient.post<ApiResponse<CharacterDialogueInfluence>>(
    `/character-conversations/sessions/${sessionId}/influence/activate`,
    toRequestParams(request),
  );
  return data;
}

export async function dismissCharacterConversationInfluence(sessionId: string, request: CharacterConversationRequest) {
  const { data } = await apiClient.post<ApiResponse<CharacterDialogueInfluence>>(
    `/character-conversations/sessions/${sessionId}/influence/dismiss`,
    toRequestParams(request),
  );
  return data;
}
