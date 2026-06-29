---
name: witboost-validate
description: Validate data product descriptors — build descriptors, run validation loops, interpret policy errors, governance checks
tools:
  - build_descriptor
  - validate_descriptor
  - run_tests
  - get_test_results
  - list_policies
  - get_policy
  - check_policies
  - get_approval_status
  - get_descriptor_specification
---

# Witboost Validation & Governance

## Validation Workflow

### API Endpoints

1. **Preview**: `POST /api/builder/dataproducts/preview?dataProduct={dotNotation}&projectKind=System&environment={env}&version={ver}&bypassCache=true&hideComponents=false`
   - Uses **dot-notation ID** (e.g. `finance.fraud-signal-analytics.0`), NOT URN
   - Returns `{ descriptor: "yaml string" }`

2. **Validate**: `POST /api/builder/dataproducts/{dotNotation}/validate`
   - Body: `{ descriptor, version, environment, projectKind: "System" }`
   - Returns `{ body: { results: [...] } }`

### Environment Selection

| Environment | Error detail | Use for |
|---|---|---|
| `production` | **Full error messages** from all policies | Debugging validation failures |
| `development` | Often empty error arrays despite FAILED status | Quick smoke test only |

**Tip**: Always use `production` environment for meaningful error messages.

### Validation Result Interpretation

Each result has `validationPhaseKind` and `status`:

| Phase | What it checks |
|---|---|
| `POLICY_COMPONENT_VALIDATION_PHASE` | Governance policies |
| `COMPONENT_VALIDATION_PHASE` | Provisioner validates component descriptor |
| `DATAPRODUCT_VALIDATION_PHASE` | DP-level provisioner validation |

## Fix-Validate Loop

After every change:
1. Edit the file in the cloned repo
2. `git add -A && git commit -m "fix: ..." && git push origin master`
3. Wait for catalog re-ingestion (~25 seconds)
4. `build_descriptor` with `production` environment
5. `validate_descriptor` → check results
6. **Batch ALL fixes** into a single push-refresh-validate cycle
7. Repeat until all phases show COMPLETED

### Pre-flight Audit

Before validating, check:
1. `dependsOn` uses URN colon format (`urn:dmb:cmp:...`), NOT dot-notation
2. Entity ref fields (`devGroup`, `owner`) are bare names, NOT kind-prefixed
3. Nullable fields use `null` not `""`
4. Enum fields use values allowed by policies (read the policy)
5. PII tags match policy column-name detection rules
6. `dataContract.schema` includes only fields allowed by the template schema

### Understanding Policy Failures

When a policy fails, **do not guess** what it expects:

1. `list_policies` to fetch active policies with full definitions
2. Read the `content` field — it tells you exactly what is checked:
   - **CUE engine**: `cueScript` with exact validation rules
   - **Governance agent**: `governanceAgentSpec.prompt` with the AI check
   - **Remote engine**: `externalUrl` pointing to external evaluator
3. Match error message to the policy that produced it
4. Fix based on what the policy actually requires

### Template-Level Validation

Call `validate_against_template` to check descriptor values against template JSON Schema constraints
(pattern, enum, required, min/maxLength). **Use this BEFORE governance validation** — template
violations are often the root cause of policy failures.

### Descriptor Specification (CUE Schema)

Call `get_descriptor_specification` to retrieve the global CUE schema that defines
required fields and allowed values for all entity kinds (DataProduct, OutputPort, Workload, Storage).

## Common Failure Patterns

### COR_PARSE_DESCR_1
Descriptor doesn't match expected schema. Diff against a working DP — don't binary-search fields.

### Empty error arrays
Switch to `production` environment for detailed messages.

### Provisioner unreachable
COMPONENT_VALIDATION_PHASE fails for Snowflake/Databricks components when provisioners are down.
This is infrastructure, not descriptor issue.

### "Failed to parse 'content'"
Remote policy evaluator can't parse the descriptor. Normal for non-matching DP types (e.g. Databricks policy on a Snowflake DP).
