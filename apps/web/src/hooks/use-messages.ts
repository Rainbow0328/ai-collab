import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api-client';
import {
  useMessageStore,
  useMessageActions,
  useCurrentMessages,
  useMessagesLoading,
  useReadMessageIds,
  useMessagesBySession,
} from '@/state/message-store';
import { isMessageRead } from '@/types/message-status';

export function useMessages(sessionId?: string) {
  const { setSessionMessages, setCurrentSessionId, setLoading } = useMessageActions();
  const messages = useMessagesBySession(sessionId ?? '');
  const readMessageIds = useReadMessageIds();
  const loading = useMessagesLoading();
  const fetchRef = useRef(false);
  const [localLoading, setLocalLoading] = useState(false);

  const fetchMessages = useCallback(async (sid: string) => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    setLocalLoading(true);
    setLoading(true);
    try {
      const list = await api.messages.list(sid);
      setSessionMessages(sid, list);
      return list;
    } finally {
      setLocalLoading(false);
      setLoading(false);
    }
  }, [setSessionMessages, setLoading]);

  useEffect(() => {
    if (sessionId) {
      setCurrentSessionId(sessionId);
      const existing = useMessageStore.getState().bySession[sessionId];
      if (!existing) {
        fetchMessages(sessionId);
      }
    }
  }, [sessionId, setCurrentSessionId, fetchMessages]);

  const stats = useMemo(() => {
    const total = messages.length;
    const readCount = messages.filter((msg) => isMessageRead(msg, readMessageIds)).length;
    const unreadCount = total - readCount;
    return {
      total,
      readCount,
      unreadCount,
      allRead: unreadCount === 0,
    };
  }, [messages, readMessageIds]);

  return {
    messages,
    loading: loading || localLoading,
    fetchMessages,
    stats,
  };
}

export function useSelectedMessage() {
  return useMessageStore((state) => {
    if (!state.selectedMessageId) return null;
    for (const sessionMessages of Object.values(state.bySession)) {
      const found = sessionMessages.find((m) => m.id === state.selectedMessageId);
      if (found) return found;
    }
    return null;
  });
}

export function useMessageTimeline(sessionId: string) {
  const messages = useMessagesBySession(sessionId);
  const readMessageIds = useReadMessageIds();

  const byDate = useMemo(() => {
    return messages.reduce((acc, msg) => {
      const date = new Date(msg.createdAt).toDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(msg);
      return acc;
    }, {} as Record<string, typeof messages>);
  }, [messages]);

  const orderedDates = useMemo(() => {
    return Object.keys(byDate).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );
  }, [byDate]);

  const unreadByDate = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [date, msgs] of Object.entries(byDate)) {
      result[date] = msgs.filter((m) => !isMessageRead(m, readMessageIds)).length;
    }
    return result;
  }, [byDate, readMessageIds]);

  return {
    messages,
    byDate,
    orderedDates,
    unreadByDate,
  };
}
