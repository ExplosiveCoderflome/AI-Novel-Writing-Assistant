import { DatabaseSecretStore } from "./DatabaseSecretStore";

export const secretStore = new DatabaseSecretStore();

export type {
  SecretStore,
  SecretStoreListOptions,
  SecretStoreRecord,
  SecretStoreWriteInput,
} from "./SecretStore";
