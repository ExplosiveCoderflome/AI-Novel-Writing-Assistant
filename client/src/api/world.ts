import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { World } from "@ai-novel/shared/types/world";
import { apiClient } from "./client";

export async function getWorldList() {
  const { data } = await apiClient.get<ApiResponse<World[]>>("/worlds");
  return data;
}

export async function getWorldDetail(id: string) {
  const { data } = await apiClient.get<ApiResponse<World>>(`/worlds/${id}`);
  return data;
}

export async function createWorld(payload: Partial<World> & { name: string }) {
  const { data } = await apiClient.post<ApiResponse<World>>("/worlds", payload);
  return data;
}

export async function updateWorld(id: string, payload: Partial<World>) {
  const { data } = await apiClient.put<ApiResponse<World>>(`/worlds/${id}`, payload);
  return data;
}

export async function deleteWorld(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/worlds/${id}`);
  return data;
}
