import type { Plugin } from "vite";

export declare const DEFAULT_API_BASE_URL: string;

export interface AppEnv {
  apiBaseUrl: string;
  useMocks: boolean;
}

export declare function resolveAppEnv(mode: string, env: Record<string, string>): AppEnv;
export declare function defineAppEnv(appEnv: AppEnv): Record<string, string>;
export declare function contentSecurityPolicy(options: { apiBaseUrl: string }): string;
export declare function medilinkCsp(options: { apiBaseUrl: string }): Plugin;
