# InterBraid NSS Stage-A Runner

Isolated shadow-only execution worker for `NSS1-STAGE-A-v0.1`.

## Frozen execution boundary

- C001 corpus SHA-256: `5213178f40142b6673ebe0438b8e7a7651ab12639e399a8af97deb3ddff54b63`
- NSS-1 execution manifest SHA-256: `3e06aff7c0347ea505b668b19e01407d00777773d1ef5e602c64ce6260dba1c1`
- State materialization SHA-256: `ed020ff686ec96a304b45fffdae09ba8284f99dc25a276f02de12df83cc9a9a5`
- Default mode: `preflight`
- Provider calls in preflight: `0`
- Frontier calls: prohibited
- OpenRouter calls: prohibited
- Live freight/economic effects: prohibited

`RUN_MODE=execute` is fail-closed and requires both `OPENAI_API_KEY` and `TYPESAFE_API_KEY` after preflight closure.
