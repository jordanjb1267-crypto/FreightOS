# 12 — AI Agent Security, Authority, and Tooling Standard

## 1. Core principle

An AI model's output is untrusted input. The model may propose actions; deterministic systems decide whether those actions are authorized, valid, safe, and executable.

## 2. Agent registry

Every agent MUST have a registry record containing:

- stable agent identity;
- owner and business purpose;
- allowed organizations/tenants;
- data classification ceiling;
- allowed tools and operations;
- amount, frequency, object, geography, and time limits;
- approval requirements;
- model/provider and version policy;
- prompt/configuration version;
- monitoring and evaluation suite;
- kill switch and revocation method;
- retention and audit settings.

## 3. Action envelope

Agents do not call privileged tools with raw free-form instructions. They produce or request a validated action envelope containing:

- agent identity;
- principal/organization represented;
- intended operation;
- target resource;
- structured parameters;
- reason and supporting evidence references;
- confidence/uncertainty where relevant;
- requested authority level;
- idempotency key;
- policy context;
- expiration.

See `schemas/agent-action-envelope.schema.json`.

## 4. Prompt-injection resistance

Content from emails, documents, websites, OCR, EDI, customer notes, and retrieved knowledge is untrusted. It MUST NOT:

- change system or policy instructions;
- reveal credentials or hidden configuration;
- grant tool access;
- authorize transactions;
- cause retrieval from another tenant;
- disable logging or safety controls;
- select arbitrary network endpoints.

Separate data from instructions, validate structured outputs, restrict tools, and apply deterministic policy after the model.

## 5. Tool security

- Tools must expose narrow operations rather than general-purpose shells or database access.
- Tool inputs require schema validation and normalization.
- Tool authorization is independent of the model prompt.
- Tools must use short-lived scoped credentials.
- High-impact tools require approval or transaction signing.
- Tool results must be filtered according to the agent's data scope.
- Connector tools must defend against server-side request forgery and unapproved destinations.

## 6. Memory and retrieval

- Memory is tenant and purpose scoped.
- Retrieved content is filtered before model access.
- Embeddings inherit source classification and deletion requirements.
- Agent memory cannot become an alternate authority store.
- Sensitive conversations and tool outputs must not be used for generalized training without approval.

## 7. High-risk prohibitions

An agent may not independently:

- grant itself or others authority;
- change payment destinations;
- approve its own financial request;
- resolve chain-of-custody disputes without evidence policy;
- erase audit history;
- disable security monitoring;
- change production code and deploy it;
- expose confidential tenant information to another party;
- represent uncertain data as verified fact.

## 8. Evaluation requirements

Before enablement, test:

- direct and indirect prompt injection;
- cross-tenant retrieval attempts;
- tool-parameter manipulation;
- secret extraction;
- authority escalation;
- repeated/duplicate action generation;
- malicious document content;
- stale or conflicting data;
- model/provider outage;
- unsafe high-confidence hallucination;
- refusal and escalation behavior;
- kill-switch effectiveness.

## 9. Reference basis

Use OWASP LLMSVS/AISVS and NIST SSDF AI profile as applicable. See `REFERENCES.md`.
