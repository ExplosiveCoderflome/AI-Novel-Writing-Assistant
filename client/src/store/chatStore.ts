import { create } from "zustand";
import { del, get, set } from "idb-keyval";

const CHAT_SESSIONS_KEY = "chat-sessions";
const CHAT_CURRENT_SESSION_KEY = "chat-current-session-id";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  latestRunId?: string | null;
  runIds?: string[];
  createdAt: string;
  updatedAt: string;
}
   
interface ChatStoreState {
  sessions: ChatSession[];
  currentSessionId: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  createSession: (title?: string) => Promise<string>;
  setCurrentSession: (sessionId: string) => Promise<void>;
  appendMessage: (sessionId: string, message: ChatMessage) => Promise<void>;
  setSessionRunId: (sessionId: string, runId: string | null) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  removeSession: (sessionId: string) => Promise<void>;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function persistState(sessions: ChatSession[], currentSessionId: string) {
  await Promise.all([
    set(CHAT_SESSIONS_KEY, sessions),
    set(CHAT_CURRENT_SESSION_KEY, currentSessionId),
  ]);
}

export const useChatStore = create<ChatStoreState>((setState, getState) => ({
  sessions: [],
  currentSessionId: "",
  hydrated: false,
  hydrate: async () => {
    const [sessions, currentSessionId] = await Promise.all([
      get<ChatSession[]>(CHAT_SESSIONS_KEY),
      get<string>(CHAT_CURRENT_SESSION_KEY),
    ]);
    const normalizedSessions = (sessions ?? []).map((session) => ({
      ...session,
      runIds: Array.isArray(session.runIds)
        ? session.runIds
        : session.latestRunId
          ? [session.latestRunId]
          : [],
    }));
    setState({
      sessions: normalizedSessions,
      currentSessionId: currentSessionId ?? normalizedSessions[0]?.id ?? "",
      hydrated: true,
    });
  },
  createSession: async (title = "新对话") => {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: generateId("session"),
      title,
      messages: [],
      latestRunId: null,
      runIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const sessions = [session, ...getState().sessions];
    setState({ sessions, currentSessionId: session.id });
    await persistState(sessions, session.id);
    return session.id;
  },
  setCurrentSession: async (sessionId) => {
    setState({ currentSessionId: sessionId });
    await set(CHAT_CURRENT_SESSION_KEY, sessionId);
  },
  appendMessage: async (sessionId, message) => {
    const sessions = getState().sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            messages: [...session.messages, message],
            updatedAt: new Date().toISOString(),
          }
        : session,
    );
    setState({ sessions });
    await persistState(sessions, getState().currentSessionId);
  },
  setSessionRunId: async (sessionId, runId) => {
    let changed = false;
    const sessions = getState().sessions.map((session) => {
      if (session.id !== sessionId) {
        return session;
      }
      const currentRunIds = session.runIds ?? (session.latestRunId ? [session.latestRunId] : []);
      const nextRunIds = runId
        ? (currentRunIds.includes(runId) ? currentRunIds : [...currentRunIds, runId])
        : currentRunIds;
      const sameLatest = (session.latestRunId ?? null) === (runId ?? null);
      const sameRunIds = nextRunIds.length === currentRunIds.length
        && nextRunIds.every((id, index) => id === currentRunIds[index]);
      if (sameLatest && sameRunIds) {
        return session;
      }
      changed = true;
      return {
        ...session,
        latestRunId: runId,
        runIds: nextRunIds,
        updatedAt: new Date().toISOString(),
      };
    });
    if (!changed) {
      return;
    }
    setState({ sessions });
    await persistState(sessions, getState().currentSessionId);
  },
  updateSessionTitle: async (sessionId, title) => {
    const sessions = getState().sessions.map((session) =>
      session.id === sessionId ? { ...session, title, updatedAt: new Date().toISOString() } : session,
    );
    setState({ sessions });
    await persistState(sessions, getState().currentSessionId);
  },
  removeSession: async (sessionId) => {
    const sessions = getState().sessions.filter((session) => session.id !== sessionId);
    const nextCurrent = sessions[0]?.id ?? "";
    setState({
      sessions,
      currentSessionId: nextCurrent,
    });
    if (sessions.length === 0) {
      await Promise.all([del(CHAT_SESSIONS_KEY), del(CHAT_CURRENT_SESSION_KEY)]);
      return;
    }
    await persistState(sessions, nextCurrent);
  },
}));
