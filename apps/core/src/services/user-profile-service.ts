import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { UserProfileEntry, UserProfileSnapshot, SetUserProfileInput, GetUserProfileInput } from "@ai-collab/protocol";

const PROFILE_DIR = ".ai-collab";
const USER_PROFILE_SUBDIR = "user-profile";

export class UserProfileService {
  private readonly profileRoot: string;

  public constructor() {
    this.profileRoot = resolve(homedir(), PROFILE_DIR, USER_PROFILE_SUBDIR);
    this.ensureRoot();
  }

  public get(input: GetUserProfileInput = {}): UserProfileSnapshot {
    if (input.key) {
      const entry = this.readEntry(input.key);
      return {
        entries: entry ? [entry] : [],
        updatedAt: new Date().toISOString()
      };
    }

    const entries = this.readAllEntries();
    return {
      entries,
      updatedAt: new Date().toISOString()
    };
  }

  public set(input: SetUserProfileInput): UserProfileEntry {
    const entry: UserProfileEntry = {
      key: input.key,
      value: input.value,
      updatedAt: new Date().toISOString()
    };
    this.writeEntry(entry);
    return entry;
  }

  public delete(key: string): boolean {
    const path = this.getEntryPath(key);
    if (!existsSync(path)) {
      return false;
    }
    unlinkSync(path);
    return true;
  }

  private ensureRoot(): void {
    mkdirSync(this.profileRoot, { recursive: true });
  }

  private getEntryPath(key: string): string {
    const safeKey = key.replace(/[<>:"/\\|?*]/g, "_");
    return join(this.profileRoot, `${safeKey}.json`);
  }

  private readEntry(key: string): UserProfileEntry | null {
    const path = this.getEntryPath(key);
    if (!existsSync(path)) {
      return null;
    }
    return JSON.parse(readFileSync(path, "utf8")) as UserProfileEntry;
  }

  private readAllEntries(): UserProfileEntry[] {
    if (!existsSync(this.profileRoot)) {
      return [];
    }
    return readdirSync(this.profileRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        JSON.parse(readFileSync(join(this.profileRoot, entry.name), "utf8")) as UserProfileEntry
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private writeEntry(entry: UserProfileEntry): void {
    const path = this.getEntryPath(entry.key);
    writeFileSync(path, JSON.stringify(entry, null, 2), "utf8");
  }
}
