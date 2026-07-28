# MCP Tool Contracts: Witboost AI Toolkit

**Phase**: 1 — Design & Contracts | **Date**: 2026-06-14

The MCP server exposes tools via JSON-RPC over stdio following the [Model Context Protocol](https://spec.modelcontextprotocol.io/) specification. Each tool is an atomic operation mapping to one Witboost REST API call.

---

## Blueprints

### `list_blueprints`

List available blueprints from the Witboost catalog.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "domain": { "type": "string", "description": "Filter by domain (optional)" },
    "type": { "type": "string", "description": "Filter by blueprint type (optional)" }
  }
}
```

**Output**: Text content listing blueprint names, descriptions, and IDs.

**Errors**: `UNAUTHORIZED` (401), `API_UNREACHABLE` (connection error)

---

### `get_blueprint_schema`

Retrieve the JSON Schema for a blueprint's template parameters.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "blueprintId": { "type": "string", "description": "Blueprint identifier" }
  },
  "required": ["blueprintId"]
}
```

**Output**: JSON content with the blueprint's parameter schema (fields, types, validations, defaults).

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

### `get_blueprint_parameters`

Get default parameter values for a blueprint.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "blueprintId": { "type": "string", "description": "Blueprint identifier" }
  },
  "required": ["blueprintId"]
}
```

**Output**: JSON content with default parameter values.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

## Data Products

### `list_data_products`

List data products accessible to the authenticated user.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "domain": { "type": "string", "description": "Filter by domain (optional)" },
    "status": { "type": "string", "description": "Filter by status (optional)" },
    "limit": { "type": "number", "description": "Max results (default: 50)" },
    "offset": { "type": "number", "description": "Pagination offset (default: 0)" }
  }
}
```

**Output**: Text content listing data product names, domains, versions, and statuses.

**Errors**: `UNAUTHORIZED` (401), `API_UNREACHABLE`

---

### `get_data_product`

Get detailed information about a specific data product.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier (URN or name)" }
  },
  "required": ["dataProductId"]
}
```

**Output**: Text content with data product details — name, domain, version, owner, components list, status, and descriptor summary.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

### `create_data_product`

Create a new data product from a blueprint.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "blueprintId": { "type": "string", "description": "Blueprint to create from" },
    "parameters": { "type": "object", "description": "Template parameter values matching the blueprint schema" }
  },
  "required": ["blueprintId", "parameters"]
}
```

**Output**: Text content confirming creation with the new data product's ID, name, and catalog URL.

**Errors**: `VALIDATION_ERROR` (400 — invalid parameters), `UNAUTHORIZED` (401), `CONFLICT` (409 — name already exists)

---

### `update_data_product`

Update an existing data product's metadata.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" },
    "updates": { "type": "object", "description": "Fields to update (name, description, owner, etc.)" }
  },
  "required": ["dataProductId", "updates"]
}
```

**Output**: Text content confirming the update with changed fields.

**Errors**: `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401)

---

### `delete_data_product`

Delete a data product. Requires confirmation via `confirm` parameter.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" },
    "confirm": { "type": "boolean", "description": "Must be true to confirm deletion" }
  },
  "required": ["dataProductId", "confirm"]
}
```

**Output**: Text content confirming deletion.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401), `CONFIRMATION_REQUIRED` (if `confirm` is false)

---

## Components

### `list_components`

List components of a data product.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Parent data product identifier" },
    "type": { "type": "string", "description": "Filter by component type (optional)" }
  },
  "required": ["dataProductId"]
}
```

**Output**: Text content listing component names, types, technologies, and statuses.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

### `add_component`

Add a new component to a data product.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Parent data product identifier" },
    "blueprintId": { "type": "string", "description": "Component blueprint identifier" },
    "parameters": { "type": "object", "description": "Component template parameters" }
  },
  "required": ["dataProductId", "blueprintId", "parameters"]
}
```

**Output**: Text content confirming the component was added with its ID and type.

**Errors**: `NOT_FOUND` (404 — parent not found), `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401)

---

### `remove_component`

Remove a component from a data product.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Parent data product identifier" },
    "componentId": { "type": "string", "description": "Component identifier" },
    "confirm": { "type": "boolean", "description": "Must be true to confirm removal" }
  },
  "required": ["dataProductId", "componentId", "confirm"]
}
```

**Output**: Text content confirming removal.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401), `CONFIRMATION_REQUIRED`

---

## Repositories

### `list_repositories`

List Git repositories associated with a data product.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" }
  },
  "required": ["dataProductId"]
}
```

**Output**: Text content listing, for each repository, its HTTPS and SSH clone URLs and associated component.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

## Provisioning

### `deploy`

Deploy a data product to a target environment.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" },
    "environment": { "type": "string", "description": "Target environment name" },
    "confirm": { "type": "boolean", "description": "Must be true to confirm deployment" }
  },
  "required": ["dataProductId", "environment", "confirm"]
}
```

**Output**: Text content with deployment ID and initial status.

**Errors**: `NOT_FOUND` (404), `VALIDATION_ERROR` (400 — descriptor invalid), `UNAUTHORIZED` (401), `CONFIRMATION_REQUIRED`

---

### `undeploy`

Undeploy a data product from an environment.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" },
    "environment": { "type": "string", "description": "Environment to undeploy from" },
    "confirm": { "type": "boolean", "description": "Must be true to confirm undeployment" }
  },
  "required": ["dataProductId", "environment", "confirm"]
}
```

**Output**: Text content confirming undeployment initiation.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401), `CONFIRMATION_REQUIRED`

---

### `get_deployment_status`

Get the current status of a deployment.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" },
    "environment": { "type": "string", "description": "Environment name (optional — returns all if omitted)" }
  },
  "required": ["dataProductId"]
}
```

**Output**: Text content with deployment status per environment — state, timestamps, component-level status.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

### `get_deployment_logs`

Retrieve provisioning logs for a deployment.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" },
    "environment": { "type": "string", "description": "Environment name" },
    "componentId": { "type": "string", "description": "Filter by component (optional)" },
    "tail": { "type": "number", "description": "Number of recent log lines (default: 100)" }
  },
  "required": ["dataProductId", "environment"]
}
```

**Output**: Text content with log entries (timestamps, levels, messages).

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

## Testing

### `validate_descriptor`

Validate a data product descriptor against governance policies.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier (optional — validates from API)" },
    "descriptorPath": { "type": "string", "description": "Local path to descriptor file (optional — validates local file)" }
  }
}
```

**Output**: Text content with validation results — pass/fail status, policy names, violation details with explanations and suggested fixes.

**Errors**: `NOT_FOUND` (404), `PARSE_ERROR` (invalid YAML/descriptor format)

---

### `run_tests`

Trigger test execution for a data product.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" },
    "testSuite": { "type": "string", "description": "Specific test suite to run (optional)" }
  },
  "required": ["dataProductId"]
}
```

**Output**: Text content with test execution ID and initial status.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

### `get_test_results`

Get results of a test execution.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" },
    "testExecutionId": { "type": "string", "description": "Test execution ID (optional — returns latest if omitted)" }
  },
  "required": ["dataProductId"]
}
```

**Output**: Text content with test results — pass/fail counts, individual test details, failure messages.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

## Governance

### `check_policies`

Check a data product against governance policies.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" }
  },
  "required": ["dataProductId"]
}
```

**Output**: Text content with policy compliance status — each policy name, pass/fail, and violation details with remediation guidance.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

### `get_approval_status`

Get the approval status of a data product.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "dataProductId": { "type": "string", "description": "Data product identifier" }
  },
  "required": ["dataProductId"]
}
```

**Output**: Text content with approval status — pending approvals, approvers, timestamps, and any required actions.

**Errors**: `NOT_FOUND` (404), `UNAUTHORIZED` (401)

---

## Error Code Reference

All tools use a consistent error reporting pattern. When `isError: true`, the content includes:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or expired token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Entity does not exist |
| `VALIDATION_ERROR` | 400 | Invalid input parameters |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | API rate limit exceeded |
| `API_UNREACHABLE` | — | Cannot connect to Witboost API |
| `CONFIRMATION_REQUIRED` | — | Destructive operation requires `confirm: true` |
| `GIT_ERROR` | — | Git operation failed |
| `PARSE_ERROR` | — | Could not parse descriptor or config file |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
