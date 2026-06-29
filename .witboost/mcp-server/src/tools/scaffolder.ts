import type { WitboostApiClient } from "../api/client.js";

interface TaskEvent {
  type: string;
  body?: { message?: string; error?: { name?: string; message?: string }; stepId?: string; status?: string };
}

interface TaskStatus {
  id: string;
  status: "open" | "processing" | "completed" | "failed";
}

export interface ScaffolderResult {
  ok: boolean;
  taskId: string;
  status: string;
  error?: string;
}

const POLL_INTERVAL = 2000;
const MAX_WAIT = 120_000;

/**
 * Poll a scaffolder task until it reaches a terminal state (completed/failed).
 * Returns structured result with status and optional error message from events.
 */
export async function waitForScaffolderTask(
  api: WitboostApiClient,
  taskId: string,
): Promise<ScaffolderResult> {
  const deadline = Date.now() + MAX_WAIT;

  while (Date.now() < deadline) {
    const res = await api.get<TaskStatus>(`/api/scaffolder/v2/tasks/${taskId}`);
    if (!res.ok) {
      return { ok: false, taskId, status: "unknown", error: res.error?.message ?? "Failed to fetch task status" };
    }

    const { status } = res.data!;
    if (status === "completed") {
      return { ok: true, taskId, status };
    }
    if (status === "failed") {
      const errorMsg = await getTaskError(api, taskId);
      return { ok: false, taskId, status, error: errorMsg };
    }

    // Still running — wait and retry
    await sleep(POLL_INTERVAL);
  }

  return { ok: false, taskId, status: "timeout", error: `Task did not complete within ${MAX_WAIT / 1000}s` };
}

async function getTaskError(api: WitboostApiClient, taskId: string): Promise<string> {
  const res = await api.get<TaskEvent[]>(`/api/scaffolder/v2/tasks/${taskId}/events`);
  if (!res.ok || !res.data) return "Unknown error (could not fetch task events)";

  const events = res.data;

  // Look for log events containing "Error:" — these have the actual error message
  const errorLogs = events.filter(
    (e) => e.type === "log" && e.body?.message?.startsWith("Error:"),
  );
  if (errorLogs.length > 0) {
    // Return the first error message, truncated to a reasonable length
    return errorLogs[0].body!.message!.slice(0, 500);
  }

  // Fall back to failed step events
  const failedSteps = events.filter((e) => e.body?.status === "failed");
  if (failedSteps.length > 0) {
    const last = failedSteps[failedSteps.length - 1];
    return last.body?.message ?? "Task step failed (no message)";
  }

  // Last resort: completion event
  const completion = events.find((e) => e.type === "completion");
  if (completion?.body?.message) return completion.body.message;

  return "Task failed (no error details in events)";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
