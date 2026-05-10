import { useEffect, useRef, useCallback } from 'react';
import type { KnowledgeLevel, ListKnowledgeInput, ListKnowledgeChangesInput } from '@ai-collab/protocol';
import { api } from '@/lib/api-client';
import {
  useKnowledgeStore,
  useKnowledgeActions,
  useKnowledgeItemsByLevel,
  useAllKnowledgeItems,
} from '@/state/knowledge-store';
import { getDocumentKey } from '@/types/knowledge';

export function useKnowledge(filter?: ListKnowledgeInput, sessionId?: string) {
  const { setItems, setLoading, listByLevel } = useKnowledgeActions();
  const fetchRef = useRef(false);
  const l1Items = useKnowledgeItemsByLevel('l1');
  const l2Items = useKnowledgeItemsByLevel('l2');
  const l3Items = useKnowledgeItemsByLevel('l3');
  const allItems = useAllKnowledgeItems();

  const items = filter?.level ? listByLevel(filter.level) : allItems;

  const fetchList = useCallback(async (input?: ListKnowledgeInput, sid?: string) => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    setLoading(true);
    try {
      const mergedInput = {
        ...(sid ? { sessionId: sid } : {}),
        ...(input ?? {}),
      };
      const result = await api.knowledge.list(mergedInput);
      setItems(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, [setItems, setLoading]);

  useEffect(() => {
    fetchRef.current = false;
    fetchList(filter, sessionId);
  }, [fetchList, filter?.level, filter?.tag, filter?.query, sessionId]);

  return {
    items,
    loading: useKnowledgeStore((state) => state.loading),
    fetchList,
  };
}

export function useKnowledgeByLevel(level: KnowledgeLevel, sessionId?: string) {
  return useKnowledge({ level }, sessionId);
}

export function useKnowledgeDocument(level?: KnowledgeLevel | null, slug?: string | null, sessionId?: string) {
  const { setDocument, setLoading } = useKnowledgeActions();
  const fetchRef = useRef<string | null>(null);

  const document = useKnowledgeStore(
    (state) => (level && slug ? state.documents[getDocumentKey(level, slug)] : undefined)
  );

  const fetch = useCallback(async () => {
    if (!level || !slug) return null;
    const cacheKey = getDocumentKey(level, slug);
    if (fetchRef.current === cacheKey) return null;
    fetchRef.current = cacheKey;
    setLoading(true);
    try {
      const doc = await api.knowledge.get(level, slug, sessionId);
      if (doc) setDocument(doc);
      return doc;
    } finally {
      setLoading(false);
      fetchRef.current = null;
    }
  }, [level, slug, sessionId, setDocument, setLoading]);

  useEffect(() => {
    if (level && slug && !document) {
      fetch();
    }
  }, [level, slug, document, fetch]);

  return {
    document,
    loading: useKnowledgeStore((state) => state.loading),
    fetch,
  };
}

export function useKnowledgeManifest(sessionId?: string) {
  const { setManifest, setLoading } = useKnowledgeActions();
  const manifest = useKnowledgeStore((state) => state.manifest);
  const fetchRef = useRef(false);
  const hasManifestRef = useRef(false);

  hasManifestRef.current = !!manifest;

  const fetch = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    setLoading(true);
    try {
      const m = await api.knowledge.getManifest(sessionId);
      setManifest(m);
      return m;
    } finally {
      setLoading(false);
    }
  }, [sessionId, setManifest, setLoading]);

  useEffect(() => {
    if (!hasManifestRef.current) {
      fetch();
    }
  }, [fetch]);

  return {
    manifest,
    loading: useKnowledgeStore((state) => state.loading),
    fetch,
  };
}

export function useKnowledgeChanges(input?: ListKnowledgeChangesInput, sessionId?: string) {
  const { setChanges, setLoading } = useKnowledgeActions();
  const changes = useKnowledgeStore((state) => state.changes);
  const fetchRef = useRef(false);

  const fetch = useCallback(async (i?: ListKnowledgeChangesInput, sid?: string) => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    setLoading(true);
    try {
      const mergedInput = {
        ...(sid ? { sessionId: sid } : {}),
        ...(i ?? {}),
      };
      const c = await api.knowledge.listChanges(mergedInput);
      setChanges(c);
      return c;
    } finally {
      setLoading(false);
    }
  }, [setChanges, setLoading]);

  useEffect(() => {
    fetchRef.current = false;
    fetch(input, sessionId);
  }, [fetch, input, sessionId]);

  return {
    changes,
    loading: useKnowledgeStore((state) => state.loading),
    fetch,
  };
}
