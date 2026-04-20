export interface SecretStoreRecord {
  provider: string;
  displayName: string | null;
  key: string | null;
  model: string | null;
  baseURL: string | null;
  isActive: boolean;
  reasoningEnabled: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecretStoreWriteInput {
  displayName?: string | null;
  key?: string | null;
  model?: string | null;
  baseURL?: string | null;
  isActive?: boolean;
  reasoningEnabled?: boolean;
}

export interface SecretStoreListOptions {
  onlyActive?: boolean;
  providers?: string[];
}

export interface SecretStore {
  listProviders(options?: SecretStoreListOptions): Promise<SecretStoreRecord[]>;
  getProvider(provider: string): Promise<SecretStoreRecord | null>;
  hasProvider(provider: string): Promise<boolean>;
  createProvider(provider: string, input: SecretStoreWriteInput): Promise<SecretStoreRecord>;
  updateProvider(provider: string, input: SecretStoreWriteInput): Promise<SecretStoreRecord>;
  upsertProvider(provider: string, input: SecretStoreWriteInput): Promise<SecretStoreRecord>;
  deleteProvider(provider: string): Promise<void>;
}
