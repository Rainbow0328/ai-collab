export type GuardCheckInput = {
  level: string;
  slug: string;
  content: string;
};

export type GuardCheckResult = {
  ok: boolean;
  violations: Array<{ message: string }>;
};

export class GuardService {
  public check(input: GuardCheckInput): GuardCheckResult {
    const violations: Array<{ message: string }> = [];

    if (!input.level.trim()) {
      violations.push({ message: "Knowledge level is required." });
    }
    if (!input.slug.trim()) {
      violations.push({ message: "Knowledge slug is required." });
    }

    return {
      ok: violations.length === 0,
      violations
    };
  }
}
