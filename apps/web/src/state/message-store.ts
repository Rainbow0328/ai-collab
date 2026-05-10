import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import { useMemo } from "react";
import type { MessageRecord } from "@/types";
import { isMessageRead, isMessageUnread, isMessageTerminalProcessingStatus } from "@/types/message-status";

const EMPTY_ARRAY: never[] = [];

interface MessageStore {
  bySession: Record<string, MessageRecord[]>;
  currentSessionId: string | null;
  selectedMessageId: string | null;
  // 本地已读状态集合，独立于后端 processingStatus 字段
  readMessageIds: Set<string>;
  isLoading: boolean;
  actions: {
    setSessionMessages: (sessionId: string, messages: MessageRecord[]) => void;
    addMessage: (message: MessageRecord) => void;
    updateMessage: (messageId: string, updates: Partial<MessageRecord>) => void;
    setCurrentSessionId: (sessionId: string | null) => void;
    setSelectedMessageId: (messageId: string | null) => void;
    // 标记为已读 - 只修改本地状态，不污染后端字段
    markAsRead: (messageId: string) => void;
    markAllAsRead: (sessionId: string) => void;
    setLoading: (loading: boolean) => void;
    // 获取指定会话的已读状态集合
    getReadIds: () => Set<string>;
  };
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  bySession: {},
  currentSessionId: null,
  selectedMessageId: null,
  readMessageIds: new Set(),
  isLoading: false,

  actions: {
    setSessionMessages: (sessionId, messages) =>
      set((state) => ({
        bySession: { ...state.bySession, [sessionId]: messages },
      })),

    addMessage: (message) =>
      set((state) => {
        const sessionMessages = state.bySession[message.sessionId] || [];
        return {
          bySession: {
            ...state.bySession,
            [message.sessionId]: [message, ...sessionMessages],
          },
        };
      }),

    updateMessage: (messageId, updates) =>
      set((state) => {
        const nextBySession = { ...state.bySession };
        for (const sessionId of Object.keys(nextBySession)) {
          nextBySession[sessionId] = nextBySession[sessionId].map((m) =>
            m.id === messageId ? { ...m, ...updates } : m
          );
        }
        return { bySession: nextBySession };
      }),

    setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),

    setSelectedMessageId: (messageId) => set({ selectedMessageId: messageId }),

    // 标记为已读 - 添加到本地集合，不修改后端字段
    markAsRead: (messageId) =>
      set((state) => ({
        readMessageIds: new Set([...state.readMessageIds, messageId]),
      })),

    // 标记全部已读 - 批量添加到本地集合
    markAllAsRead: (sessionId) =>
      set((state) => {
        const messages = state.bySession[sessionId] || [];
        const newReadIds = messages.map((m) => m.id);
        return {
          readMessageIds: new Set([...state.readMessageIds, ...newReadIds]),
        };
      }),

    setLoading: (loading) => set({ isLoading: loading }),

    getReadIds: () => get().readMessageIds,
  },
}));

export const useMessageActions = () => useMessageStore((state) => state.actions);

export const useReadMessageIds = () => useMessageStore((state) => state.readMessageIds);

export const useMessagesBySession = (sessionId: string) =>
  useMessageStore(useShallow((state) => state.bySession[sessionId] || EMPTY_ARRAY));

export const useCurrentMessages = () =>
  useMessageStore(useShallow((state) =>
    state.currentSessionId ? (state.bySession[state.currentSessionId] || EMPTY_ARRAY) : EMPTY_ARRAY
  ));

export const useSelectedMessage = () =>
  useMessageStore((state) => {
    if (!state.selectedMessageId) return null;
    for (const messages of Object.values(state.bySession)) {
      const found = messages.find((m) => m.id === state.selectedMessageId);
      if (found) return found;
    }
    return null;
  });

export const useUnreadCountBySession = (sessionId: string) =>
  useMessageStore((state) => {
    const messages = state.bySession[sessionId] || [];
    return messages.filter((m) => isMessageUnread(m, state.readMessageIds)).length;
  });

/**
 * 获取带已读状态的消息列表
 * 页面层直接调用，不需要手动管理 readMessageIds
 */
export function useMessagesWithReadState(sessionId: string) {
  const messages = useMessagesBySession(sessionId);
  const readMessageIds = useReadMessageIds();
  return useMemo(
    () => messages.map((message) => ({
      message,
      isRead: isMessageRead(message, readMessageIds),
    })),
    [messages, readMessageIds]
  );
}

export const useMessageIsRead = (messageId: string) =>
  useMessageStore((state) => {
    const allMessages = Object.values(state.bySession).flat();
    const message = allMessages.find((m) => m.id === messageId);
    if (!message) return false;
    return isMessageRead(message, state.readMessageIds);
  });

export const useMessagesLoading = () => useMessageStore((state) => state.isLoading);
