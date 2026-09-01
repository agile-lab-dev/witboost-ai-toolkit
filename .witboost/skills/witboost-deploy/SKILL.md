---
name: witboost-deploy
description: Deploy and monitor data products — provisioning, log analysis, environment management, troubleshooting
tools:
  - deploy
  - undeploy
  - get_deployment_status
  - get_deployment_logs
---

# Witboost Deployment & Troubleshooting

## Deployment Pipeline

```
Validate → Test → Check Policies → Deploy → Monitor → Verify
```

Always validate before deploying. Never skip straight to deployment.

## Environment Management

Environment names are **tenant-specific** — don't assume `development`/`staging`/`production` exist. Some tenants use `dev`/`uat`/`prod`, others use entirely different names. Confirm the exact names with the user (or from environments already seen in prior successful calls) before deploying.

Typical tier pattern (actual names vary by tenant):

| Tier | Policies | Approvals | Use for |
|---|---|---|---|
| lowest (e.g. `dev`/`development`) | Relaxed | None | Frequent iteration |
| middle (e.g. `uat`/`staging`) | Strict | Sometimes | Pre-production validation |
| highest (e.g. `prod`/`production`) | Full governance | Required | Live data |

**Best practice**: Deploy to the lowest non-production tier first, then promote.

## Deployment Workflow

1. `deploy` with the target environment and `confirm: true`
2. `get_deployment_status` to monitor progress
3. On failure → `get_deployment_logs` with the failing `componentId`
4. Diagnose → fix → re-deploy

## Common Failure Patterns

### 1. Provisioning Failures

**Symptoms**: Deployment status shows `failed`, component-level errors in logs

**Common causes**:
- Infrastructure permissions (cloud IAM roles missing)
- Resource naming conflicts (e.g., S3 bucket name already taken)
- Tech adapter not registered or unreachable
- Network/firewall issues between Witboost and cloud provider

**Diagnosis**:
1. `get_deployment_status` — check which components failed
2. `get_deployment_logs` with the failing `componentId`
3. Look for `ERROR` and `FATAL` entries first

### 2. Governance Policy Violations

**Symptoms**: `check_policies` returns failed policies

**Common causes**:
- Data classification missing on output ports
- SLA not defined
- Owner not set or not authorized for the domain

### 3. Approval Blockers

**Symptoms**: Deployment blocked pending approval

**Resolution**: `get_approval_status`, notify the appropriate approver.

## Log Analysis Tips

- Filter logs by `componentId` to focus on a specific component
- Use `tail` parameter to limit output (default: 100 lines)
- Stack traces often contain the root cause in the first few lines
- Timestamps help correlate failures across components

## Cleanup

Use `undeploy` to clean up failed deployments before retrying.
Always confirm destructive operations with the user.
