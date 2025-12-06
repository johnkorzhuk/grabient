import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

export const workflow = new WorkflowManager(components.workflow);

// Default retry options to use when defining workflows
export const defaultRetryOptions = {
  maxAttempts: 5,
  initialBackoffMs: 1000,
  base: 2,
} as const;
