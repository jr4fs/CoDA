import { apiClient } from "../lib/apiClient";

export interface ClientConfig {
  allowSignup: boolean;
}

export async function getClientConfig(): Promise<ClientConfig> {
  const { data } = await apiClient.get<ClientConfig>("/api/config");
  return data;
}
