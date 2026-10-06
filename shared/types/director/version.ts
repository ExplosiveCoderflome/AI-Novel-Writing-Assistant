export type DirectorVersion = "v1" | "v2";

export interface NovelDirectorIdentity {
  novelId: string;
  version: DirectorVersion;
  epoch: number;
  availableVersions: DirectorVersion[];
  canSwitch: boolean;
  blockedReason: string | null;
  sourceRoute: string;
}
