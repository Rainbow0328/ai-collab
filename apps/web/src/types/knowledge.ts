import type {
  KnowledgeLevel,
  KnowledgeDocument,
  KnowledgeListItem,
  KnowledgeManifest,
  KnowledgeChangeRecord,
  ListKnowledgeInput,
  ListKnowledgeChangesInput,
} from "@ai-collab/protocol";

export type {
  KnowledgeLevel,
  KnowledgeDocument,
  KnowledgeListItem,
  KnowledgeManifest,
  KnowledgeChangeRecord,
  ListKnowledgeInput,
  ListKnowledgeChangesInput,
};

export interface KnowledgeState {
  manifest?: KnowledgeManifest;
  byLevel: Record<KnowledgeLevel, Record<string, KnowledgeListItem>>;
  documents: Record<string, KnowledgeDocument>;
  changes: KnowledgeChangeRecord[];
  loading: boolean;
  lastFetchedAt?: string;
}

export function getDocumentKey(level: KnowledgeLevel, slug: string): string {
  return `${level}:${slug}`;
}
