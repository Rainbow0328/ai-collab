import type { MessageTrace, MessageTraceInput } from "@ai-collab/protocol";
import type { MessageTraceRepository } from "@ai-collab/store";

export class TraceService {
  public constructor(private readonly traceRepo: MessageTraceRepository) {}

  public record(input: MessageTraceInput): MessageTrace {
    return this.traceRepo.insert(input);
  }

  public getSessionTraces(sessionId: string): MessageTrace[] {
    return this.traceRepo.listBySessionId(sessionId);
  }
}
