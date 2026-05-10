export type UserProfileEntry = {
  key: string;
  value: string;
  updatedAt: string;
};

export type UserProfileSnapshot = {
  entries: UserProfileEntry[];
  updatedAt: string;
};

export type SetUserProfileInput = {
  key: string;
  value: string;
};

export type GetUserProfileInput = {
  key?: string | undefined;
};
