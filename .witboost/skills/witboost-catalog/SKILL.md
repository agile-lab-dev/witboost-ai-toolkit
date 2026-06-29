---
name: witboost-catalog
description: Navigate and query the Witboost catalog — entities, domains, data products, components, blueprints, marketplace
tools:
  # Discovery & Blueprints
  - list_blueprints
  - get_blueprint
  - list_templates
  - get_template_schema
  - get_template_parameters
  - validate_against_template
  # Data Products & Components
  - list_data_products
  - get_data_product
  - list_components
  # Repositories
  - list_repositories
  - clone_repository
  # Marketplace
  - marketplace_search
  - marketplace_get_data_product
  - marketplace_get_output_ports
  - marketplace_get_output_port
---

# Witboost Catalog Navigation

## Key Concepts

- **Data Product**: A composable unit in the data mesh — identified by a URN, belongs to a domain, contains components
- **Component**: A building block of a data product — types: `storage`, `workload`, `outputport`
- **Blueprint**: Defines the composition of a data product — which templates are included and in what order they must be created
- **Template**: A scaffolder template used to create a data product or a component
- **Domain**: An organizational grouping for data products (e.g., `finance`, `marketing`)

## Common Patterns

### Finding a Data Product

1. `list_data_products` with optional `domain` filter
2. `get_data_product` for full details including component list

### Exploring Components

1. `list_components` with the data product ID
2. Filter by `type` for a specific component kind (storage, workload, outputport)

### Browsing Blueprints & Templates

1. `list_blueprints` → `get_blueprint` to see template composition and creation order
2. `list_templates` with optional `domain` and `type` filters
3. `get_template_schema` for required parameters of a specific template
4. `validate_against_template` to check descriptor values against template JSON Schema constraints

### CRITICAL: Template IDs

Template names are **platform-specific** and cannot be guessed. Examples of real names:
`dataproduct-template`, `snowflake-template.1`, `DBTWithKensu`, `dremio-sql-outputport`

**Never** invent template names like `dbt-template`, `dremio-output-port-template`, etc.
**Always** call `list_templates` first and use the exact `Template ID` from the output.

### Discovering Upstream Data via Marketplace

1. `marketplace_search` to find candidate data products by keyword
2. `marketplace_get_data_product` for details (ID, domain, version)
3. `marketplace_get_output_ports` to list available output ports
4. `marketplace_get_output_port` for full schema (columns, types, data contract, SLA)

## Entity Ref Format

| Kind | Format | Example |
|---|---|---|
| Data Product | `system:domain.dp-name.version` | `system:finance.spend-analytics.0` |
| Component | `component:default/domain.dp-name.ver.comp` | `component:default/finance.spend-analytics.0.storage` |
| Domain | `domain:finance` | |
| User | `user:first.last_domain.tld` | `user:john.doe_example.com` |
| Group | `group:dev` | |

**Never** include `default/` in domain, user, or group refs.

## URN Format

```
urn:dmb:cmp:domain:dp-name:version:component-name
urn:dmb:dp:domain:dp-name:version
```

Derived from dot-notation identifiers by replacing dots with colons.

## Tips

- The catalog is case-sensitive for entity names
- Use the data product name (not the display title) for API calls
- Dot-notation for IDs (`finance.cashflow.0`), colons for URNs (`urn:dmb:cmp:...`)
