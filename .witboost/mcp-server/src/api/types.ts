/** Generic API response wrapper */
export interface ApiResponse<T> {
  data: T;
  status: number;
  ok: boolean;
  error?: ApiError;
}

/** Structured API error */
export interface ApiError {
  code: string;
  message: string;
  status: number;
  retryAfter?: number;
}

// ── Domain entities (Witboost platform objects) ─────────────────────

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  version: string;
  schema: Record<string, unknown>;
  parameters: Record<string, unknown>;
}

export interface DataProduct {
  id: string;
  name: string;
  domain: string;
  version: string;
  description: string;
  owner: string;
  components: ComponentRef[];
  status: string;
}

export interface ComponentRef {
  id: string;
  name: string;
  type: string;
}

export interface Component {
  id: string;
  name: string;
  type: string;
  technology: string;
  descriptor: Record<string, unknown>;
  status: string;
}

export interface DeploymentStatus {
  id: string;
  dataProductId: string;
  environment: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  logs: string[];
  errors: string[];
}

export interface PolicyResult {
  policyId: string;
  name: string;
  status: "passed" | "failed" | "warning";
  message: string;
}

export interface TestResult {
  id: string;
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  message?: string;
}

export interface Repository {
  id: string;
  name: string;
  url: string;
  defaultBranch: string;
}
