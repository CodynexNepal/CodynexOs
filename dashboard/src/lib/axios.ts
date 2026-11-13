import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { env, TOKEN_KEY } from "./env";

export const api = axios.create({
  baseURL: env.apiUrl,
  timeout: 90000,
  withCredentials: true,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
});

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* noop */
  }
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.withCredentials = true;
  const token = getToken();
  if (token && !config.headers.get("Authorization")) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

let redirecting = false;
let refreshPromise: Promise<string | null> | null = null;

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _transportRetry?: boolean;
}

const RETRYABLE_TRANSPORT_CODES = new Set([
  "ECONNABORTED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ERR_NETWORK",
]);

function waitForRetry(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = axios
    .post<{ success?: boolean; data?: { accessToken?: string } }>(
      `${env.apiUrl}/auth/refresh`,
      {},
      { withCredentials: true, timeout: 15000 }
    )
    .then((res) => {
      const nextToken = res.data?.data?.accessToken ?? null;
      if (nextToken) {
        setToken(nextToken);
      }
      return nextToken;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    const parsed = toApiError(error);
    const axiosErr = axios.isAxiosError(error) ? error : null;
    const originalRequest = axiosErr?.config as RetryableRequestConfig | undefined;
    const reqUrl = originalRequest?.url ?? "";
    const isAuthRoute =
      reqUrl.includes("/auth/login") ||
      reqUrl.includes("/auth/refresh") ||
      reqUrl.includes("/auth/logout");

    // Dashboard reads are safe to retry. This absorbs a transient database
    // pool wake-up or local dev-proxy reconnect without retrying mutations.
    if (
      typeof window !== "undefined" &&
      originalRequest &&
      originalRequest.method?.toLowerCase() === "get" &&
      !originalRequest._transportRetry &&
      !originalRequest.signal?.aborted &&
      RETRYABLE_TRANSPORT_CODES.has(axiosErr?.code ?? "")
    ) {
      originalRequest._transportRetry = true;
      await waitForRetry(750);
      return api(originalRequest);
    }

    if (
      parsed.status === 401 &&
      typeof window !== "undefined" &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRoute
    ) {
      originalRequest._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        originalRequest.headers.set("Authorization", `Bearer ${newToken}`);
        return api(originalRequest);
      }
    }

    if (parsed.status === 401 && typeof window !== "undefined" && !isAuthRoute) {
      clearToken();
      if (!window.location.pathname.startsWith("/login") && !redirecting) {
        redirecting = true;
        window.location.href = "/login?reason=session-expired";
        window.setTimeout(() => {
          redirecting = false;
        }, 2000);
      }
    }
    return Promise.reject(error);
  }
);

export interface ApiErrorShape {
  message: string;
  status: number;
  errors?: Record<string, string[]>;
  code?: string;
}

export function toApiError(error: unknown): ApiErrorShape {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{
      message?: string;
      errors?: Record<string, string[]>;
      code?: string;
    }>;
    const status = err.response?.status ?? 0;
    const data = err.response?.data;
    if (status === 0) {
      if (err.code === "ECONNABORTED") {
        return {
          message: "Request timed out while waiting for CodyNex OS backend.",
          status: 0,
          code: err.code,
        };
      }
      return {
        message: "Cannot reach CodyNex OS backend. Check that the API server is running.",
        status: 0,
        code: err.code,
      };
    }
    return {
      message:
        data?.message ||
        (status === 404
          ? "Resource not found."
          : status === 403
            ? "Permission denied."
            : status >= 500
              ? "Server error. Check backend logs."
              : err.message || "Request failed."),
      status,
      errors: data?.errors,
      code: data?.code,
    };
  }
  if (error instanceof Error) return { message: error.message, status: 0 };
  return { message: "Something went wrong.", status: 0 };
}

export default api;
