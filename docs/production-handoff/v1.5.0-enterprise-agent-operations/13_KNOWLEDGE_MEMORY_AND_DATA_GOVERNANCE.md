# 13 — Knowledge, Memory, and Data Governance

## 1. Four layers

### Authoritative operational state
Transactional DB + governed external systems.

### Company Operational Twin
Approved tenant configuration/semantics.

### Evidence/knowledge
Documents, SOPs, integration docs, contracts where allowed.

### Agent working memory
Task-local derived context.

Only the first two can directly drive deterministic authorization inputs.

## 2. Retrieval

Retrieval must:
- enforce tenant/role/data-classification;
- preserve source;
- preserve version;
- preserve freshness;
- return evidence IDs;
- treat content as data, not instruction.

## 3. Prompt injection

External:
- email
- document
- EDI free text
- webpage
- vendor message
is untrusted data.

It cannot:
- alter tools;
- elevate authority;
- modify system prompt/policy;
- expose secrets;
- cause external side effect without workflow gate.

## 4. Memory

Agent memory:
- tenant-scoped
- purpose-limited
- retention-bound
- correctable
- non-authoritative.

Do not create persistent "personal memories" about employees beyond defined operational need.

## 5. Model providers

Enterprise tenant policy can control:
- approved provider
- region
- data retention
- training use
- model class
- cost limits
- fallback.

No customer data may be used for generalized model training without explicit contractual permission.

## 6. Cross-tenant learning

Allowed:
- product-level aggregate improvement using permitted, de-identified/non-sensitive signals;
- generic evaluation fixtures.

Not allowed by default:
- revealing one customer's rates, routes, SOPs, customers, performance, or exceptions to another tenant;
- using a customer's proprietary content in another customer's prompt/context.

## 7. Semantic mapping memory

Proposed vocabulary/workflow mappings live as COT assertions, not opaque vector-only memory.

## 8. Data minimization

An agent receives only the smallest necessary slice:
tenant + task + policy + relevant state + relevant evidence.
