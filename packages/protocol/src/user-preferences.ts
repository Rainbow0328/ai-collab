export type UserPreference = {
  id: string;
  key: string;
  value: string;
  category: string | null;
  source: "manual" | "agent" | "system";
  createdAt: string;
  updatedAt: string;
};

export type UserPreferencesManifest = {
  rootPath: string;
  count: number;
  updatedAt: string;
};

export type ListUserPreferencesInput = {
  category?: string | undefined;
  query?: string | undefined;
};

export type UpsertUserPreferenceInput = {
  key: string;
  value: string;
  category?: string | null | undefined;
  source?: UserPreference["source"] | undefined;
};
