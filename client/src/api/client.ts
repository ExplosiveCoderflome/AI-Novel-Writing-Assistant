import axios, { AxiosError } from "axios";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { API_BASE_URL } from "@/lib/constants";
import { toast } from "@/components/ui/toast";

export interface ApiHttpError extends Error {
  status?: number;
  details?: unknown;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    const status = error.response?.status;
    const backendError = error.response?.data?.error;
    let message = backendError ?? error.message ?? "请求失败。";

    if (!status) {
      message = "网络连接失败，请检查网络后重试。";
    } else if (status >= 500) {
      message = backendError ?? "服务器错误，请稍后重试。";
    }

    toast.error(message);

    const normalizedError = new Error(
      message,
    ) as ApiHttpError;
    normalizedError.status = status;
    normalizedError.details = error.response?.data;
    return Promise.reject(normalizedError);
  },
);
