export interface IKeyManagementService {
  getKey(options?: { forceRefresh?: boolean }): Promise<string | undefined>;
  saveKey(key: string): Promise<void>;
  invalidateCache(): Promise<void>;
  refreshKey(): Promise<string | undefined>;
  markKeyFetched(timestamp?: number): Promise<void>;
}
