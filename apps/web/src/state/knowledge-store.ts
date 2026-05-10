import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import type {
  KnowledgeLevel,
  KnowledgeDocument,
  KnowledgeListItem,
  KnowledgeManifest,
  KnowledgeChangeRecord,
} from "@/types/knowledge";
import { getDocumentKey } from "@/types/knowledge";

interface KnowledgeStore {
  manifest?: KnowledgeManifest;
  byLevel: Record<KnowledgeLevel, Record<string, KnowledgeListItem>>;
  documents: Record<string, KnowledgeDocument>;
  changes: KnowledgeChangeRecord[];
  loading: boolean;
  lastFetchedAt?: string;
  actions: {
    setManifest: (manifest: KnowledgeManifest) => void;
    setItems: (items: KnowledgeListItem[]) => void;
    setDocument: (document: KnowledgeDocument) => void;
    setChanges: (changes: KnowledgeChangeRecord[]) => void;
    setLoading: (loading: boolean) => void;
    getItem: (level: KnowledgeLevel, slug: string) => KnowledgeListItem | undefined;
    getDocument: (level: KnowledgeLevel, slug: string) => KnowledgeDocument | undefined;
    listByLevel: (level: KnowledgeLevel) => KnowledgeListItem[];
  };
}

const initialByLevel = {
  l1: {},
  l2: {},
  l3: {},
} as Record<KnowledgeLevel, Record<string, KnowledgeListItem>>;

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  byLevel: initialByLevel,
  documents: {},
  changes: [],
  loading: false,

  actions: {
    setManifest: (manifest) => set({ manifest }),

    setItems: (items) => {
      const byLevel = { ...initialByLevel };
      for (const item of items) {
        byLevel[item.level] = { ...byLevel[item.level], [item.slug]: item };
      }
      set({ byLevel, lastFetchedAt: new Date().toISOString() });
    },

    setDocument: (document) => {
      const key = getDocumentKey(document.level, document.slug);
      set((state) => ({
        documents: { ...state.documents, [key]: document },
      }));
    },

    setChanges: (changes) => set({ changes }),

    setLoading: (loading) => set({ loading }),

    getItem: (level, slug) => get().byLevel[level]?.[slug],

    getDocument: (level, slug) => get().documents[getDocumentKey(level, slug)],

    listByLevel: (level) => Object.values(get().byLevel[level] || {}),
  },
}));

export const useKnowledgeActions = () => useKnowledgeStore((state) => state.actions);
export const useKnowledgeManifest = () => useKnowledgeStore((state) => state.manifest);
export const useKnowledgeItemsByLevel = (level: KnowledgeLevel) =>
  useKnowledgeStore(useShallow((state) => Object.values(state.byLevel[level] || [])));
export const useAllKnowledgeItems = () =>
  useKnowledgeStore(useShallow((state) => {
    const l1Items = Object.values(state.byLevel.l1 || []);
    const l2Items = Object.values(state.byLevel.l2 || []);
    const l3Items = Object.values(state.byLevel.l3 || []);
    return [...l1Items, ...l2Items, ...l3Items];
  }));
export const useKnowledgeDocument = (level: KnowledgeLevel, slug: string) =>
  useKnowledgeStore((state) => state.documents[getDocumentKey(level, slug)]);
export const useKnowledgeChanges = () => useKnowledgeStore((state) => state.changes);
export const useKnowledgeLoading = () => useKnowledgeStore((state) => state.loading);
