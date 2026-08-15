# 12 — FreightOS Workforce Acceptance Gates

WF-01 every named production job has an approved Job Book  
WF-02 every job has one owned business outcome  
WF-03 every job has explicit non-scope  
WF-04 every role classified agent/hybrid/service/workflow/human-supervised  
WF-05 no unjustified agent survives decomposition review  
WF-06 every consequential input identifies source/freshness requirements  
WF-07 every output/handoff is typed  
WF-08 every consequential command is enumerated  
WF-09 every command passes policy/authority  
WF-10 every external side effect is idempotent  
WF-11 every external side effect is reconciled  
WF-12 every active WorkUnit has exactly one accountable owner  
WF-13 no orphan WorkUnit beyond routing SLA  
WF-14 every handoff is explicitly accepted/rejected  
WF-15 sender retains ownership until accepted handoff  
WF-16 every job has deadline/expiry behavior  
WF-17 every job has degraded mode  
WF-18 every job has exception ownership/escalation  
WF-19 every job has job-specific KPIs  
WF-20 every job has job-specific evaluation suite  
WF-21 critical failure cannot hide inside aggregate score  
WF-22 prompt-injection tests exist where untrusted content exists  
WF-23 stale/missing/conflicting-data tests exist  
WF-24 every side-effect job has crash-before/crash-after tests  
WF-25 every side-effect job has duplicate/replay tests  
WF-26 customer configuration cannot expand constitutional authority  
WF-27 A3/A4/A5 claims map to signed JobCertification records  
WF-28 certifications are scope-specific and reviewable/expiring  
WF-29 carrier department end-to-end simulation passes before corresponding autonomous claim  
WF-30 brokerage simulation exists and remains legal/promotion-gated  
WF-31 facility simulation preserves physical-control prohibition  
WF-32 shipper simulation preserves correct legal routing  
WF-33 service simulation preserves RigDesk domain ownership  
WF-34 cross-participant exception simulation passes  
WF-35 cross-tenant adversarial simulation passes  
WF-36 Operational Twin changes invalidate affected certification where material  
WF-37 job/tool/command inventory drift fails CI  
WF-38 unregistered agent-interaction edges fail CI  
WF-39 commercial claims registry cannot exceed certification evidence  
WF-40 exact release SHA/evaluation/rollback evidence is produced

FAIL WF-01..WF-28 blocks any claim that the affected job is production-certified.  
FAIL WF-29..WF-39 blocks the corresponding workforce/autonomy product claim.
