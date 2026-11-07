import type { Plugin } from "vite";

export declare const DEFAULT_API_BASE_URL: string;

export interface AppEnv {
  apiBaseUrl: string;
  useMocks: boolean;
}

export declare function resolveAppEnv(mode: string, env: Record<string, string>): AppEnv;
export declare function defineAppEnv(appEnv: AppEnv): Record<string, string>;
export interface CspOptions {
  apiBaseUrl: string;
  mapTilesUrl?: string;
  /** Upgrade 17: allow Google Identity Services (patient app only). */
  googleSignIn?: boolean;
}

export declare function contentSecurityPolicy(options: CspOptions): string;
export declare function medilinkCsp(options: CspOptions): Plugin;
export declare function medilinkMockWorker(options: { useMocks: boolean }): Plugin;
