import type { KnowledgeSourceKind } from '@ai-collab/protocol';
import { t } from '@/i18n';

export function getSourceKindLabel(kind: KnowledgeSourceKind): string {
  const keyMap: Record<KnowledgeSourceKind, string> = {
    manual: 'knowledge.sourceManual',
    worker_report: 'knowledge.sourceWorkerReport',
    host_update: 'knowledge.sourceHostUpdate',
    system: 'knowledge.sourceSystem',
    user_feedback: 'knowledge.sourceUserFeedback',
  };
  return t(keyMap[kind]);
}
