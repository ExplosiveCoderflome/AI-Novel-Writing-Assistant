import type {ApiResponse} from "@ai-novel/shared/types/api";
import type {DirectorVersion, NovelDirectorIdentity} from "@ai-novel/shared/types/director/version";
import {apiClient} from "../client";

export async function getDirectorVersions(): Promise<{availableVersions: DirectorVersion[]; defaultVersion: DirectorVersion}> {
  const {data} = await apiClient.get<ApiResponse<{availableVersions: DirectorVersion[]; defaultVersion: DirectorVersion}>>("/novels/director-versions");
  if (!data.success || !data.data) throw new Error(data.error || "导演版本读取失败。");
  return data.data;
}

export async function getNovelDirectorVersion(novelId: string): Promise<NovelDirectorIdentity> {
  const {data} = await apiClient.get<ApiResponse<NovelDirectorIdentity>>(`/novels/${encodeURIComponent(novelId)}/director-version`);
  if (!data.success || !data.data) throw new Error(data.error || "本书导演设置读取失败。");
  return data.data;
}
export async function setNovelDirectorVersion(novelId: string, version: DirectorVersion, expectedEpoch: number): Promise<NovelDirectorIdentity> {
  const {data} = await apiClient.put<ApiResponse<NovelDirectorIdentity>>(`/novels/${encodeURIComponent(novelId)}/director-version`, {version, expectedEpoch});
  if (!data.success || !data.data) throw new Error(data.error || "本书导演设置保存失败。");
  return data.data;
}
