# Branching-context implementation handoff status

The Luna handoff harness is implemented on local branch
`feat/branching-completion`, based on publication commit `6dd5f9df`. The queue
contains 34 tickets, including a disabled exhaustive-certification ticket.
No inference implementation or registered acceptance assertion changed in
this handoff. Cache integration, host-RAM sharing, G4 and G5 remain queued.

## Executed bounded checks, October 12 UTC

| Check | Observed result |
| --- | --- |
| Harness regressions, Windows | 18 passed; zero failures/errors/skips/xfails |
| Same harness revision, Linux | 18 passed; zero failures/errors/skips/xfails |
| Reference G0, Linux | 51/51 passed; zero skips |
| Reference demo / mutation smoke, Linux | Demo passed; four mutants rejected |
| Registered real-CUDA G3-004 | One case passed; eight exact comparisons, max error 0.0, 28 byte audits |
| Hot append work | Six appends, one forward token each, zero prefix recomputation |
| Resources in the short CUDA case | 216 COW pages / 452984832 bytes; sampled tracked-VMM peak 704643072 bytes |
| Ownership cleanup | Eight handles/images released, one context closed, 27 leases acquired/released |
| Native Windows reference checks | G0 failed: 11 tests ran, two import errors; demo and mutation smoke also failed on missing `fcntl` |

The model case used existing pinned `ed5c4557` binaries, Q8_0 weights, FP16 KV
and the token-level operator on llm-49/r4090 (RTX 4090). The harness checked 422
native/build source files, actual binary hashes, 11 still-valid model hash
receipts and oracle symbols. It did not rebuild the backend or rehash model
bytes. The final case took 75.9314 seconds on a shared host. No throughput or
overall-RAM-benefit claim follows.

Each initial child retained 24 root physical allocations after append. In this
short partial-page fixture none of those shared allocations had a nonzero
`filled_prefix_bytes` in the audit. Populated tail allocations were copied.
This checks immutable retained bytes and measured COW, not populated full-prefix
sharing across long branches. That sharing/accounting qualification remains
outstanding.

## Gate boundaries

| Gate | Status for this handoff |
| --- | --- |
| G0 | PASS on Linux; FAIL on native Windows because the store cannot import |
| G1 | BLOCKED for certification: current numerical profile not qualified; full suite unexecuted |
| G2 | BLOCKED for certification: current full crash/restart/OOM/eviction suite unexecuted |
| G3 | BLOCKED for certification: one of 16 cases executed; no complete physical/resource qualification |
| G4 | BLOCKED: 11 registered methods and full workflow absent |
| G5 | BLOCKED: 12 registered methods and release hardening outstanding |

There are 85 registered cases and 62 existing method bodies. The 18 harness
tests are separate and do not increase registered implementation coverage.
The runner preserves old validation, exposes stale fingerprints and never
converts a ticket outcome into a gate PASS. The long campaign remains disabled.

## Evidence and restart

[harness-validation.json](harness-validation.json) records actual test IDs,
counts, fingerprints, numerical/resource measurements and limits. Private raw
evidence is in `evidence/runs/luna/`, including the Windows import failures,
two intended red failures, the append-only ledger and
`remote/evidence-final.zip`. Archive SHA-256:
`7a7a3b235f33e01d0ac281d022f0165c378125d7c4abda276b8c50b7e65bc535`.

The Windows ledger has H00 and B00 validated. The owned Linux ledger has H00,
B00, B01 and B02 validated; its next implementation ticket is **C01**.
The remote location is recorded in `evidence/runs/luna/remote/location.json`:
`/home/dflanag3/branching-g3/luna-handoff-20261012T015402-76cb1e6d`.
Do not repeat the completed reference/model checks merely because the local
Windows ledger does not contain the Linux runs. Inspect the Linux ledger on
its own host with the recorded bindings.

Read [the Luna handoff](../plans/luna/HANDOFF.md) and launch with
[LAUNCH.txt](../plans/luna/LAUNCH.txt). No Codex CLI session, push, PR, service,
or long certification campaign was launched by this handoff preparation.
