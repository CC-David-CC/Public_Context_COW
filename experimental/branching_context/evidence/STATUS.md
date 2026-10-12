# Branching-context implementation handoff status

The Luna handoff harness is implemented on local branch
`feat/branching-completion`, based on publication commit `6dd5f9df`. The queue
contains 34 tickets, including a disabled exhaustive-certification ticket.
The first implementation tickets now bind numerical checkpoints to exact
canonical histories, validate controller versions and draw cursors, keep
pinned main-prefix images during background-fork cache cleanup, and share
immutable host-buffer segments with bounded copy-on-write for published tail
ranges and cache-wide unique-payload budget accounting. Concurrent-slot
integration, G4 and G5 remain queued.

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
| C01 checkpoint/history binding | One real-CUDA ticket test passed; a deliberately misassigned same-length checkpoint missed and replayed 33 canonical tokens |
| C02 controller identity | One model-free test passed; eight corrupted controller/RNG cases were rejected before sampling or input consumption |
| C03 pinned-root retention | Native CPU policy test passed; a background child no longer supersedes a pinned root, and only the unpinned child was evicted |
| R01 host-prefix ownership | Native CPU probe passed; siblings shared 4096 segment bytes, one changed byte caused 4096 actual bytes copied, and exact-prefix mismatch was rejected |
| R02 published-tail isolation | Native CPU probe passed; a 17-byte write to a unique published page and a 23-byte sibling tail write copied exactly those bytes |
| R03 unique host-storage accounting | Native CPU probe passed; 4,096 shared payload bytes charged once, owners moved 2 → 1 → 0 through eviction and clear |

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

The C01 run used the existing pinned SUT (`9d045e70`) and separately linked
oracle binding (`d2e6b715`) with the Q8_0/FP16 profile (`b62135ea`). The C01 test
did not invoke the oracle or compare logits, so it has no C01 numerical maximum
and does not qualify G1. Its direct native trace counted 99 forward tokens:
three 33-token prefill operations, including the 33-token replay after the
wrong checkpoint association. It reused 11 prior model-file hash receipts and
hashed 0 model bytes. The final native counter sample reported 251658240
tracked VMM bytes, 354189456 exported running-state bytes, 0 COW pages and 0
copied bytes; this isolated replay test does not measure sharing benefit.

C02 validated against the versioned controller contract without invoking the
model, SUT or oracle. Its test exercised four corruptions (unknown RNG ID,
unknown sampler order, negative draw cursor and cursor beyond the 128-bit PRF
range) through both sampling and input consumption. All were rejected as
`IntegrityError`; G0 and the four reference mutants passed. This run produced
no model, numerical, GPU-resource or throughput measurement.

C03 exercised the native cache header with a CPU C++ probe, plus canonical
store eviction and cancellation before publication. The pinned main prefix
remained available after a background child was parked and evicted; canonical
root and child histories remained readable, while the canceled child created
no object. The changed native header was compiled by the probe, but the full
engine was not built for CUDA, HIP or SYCL. Physical sharing, allocation bytes,
latency and overall RAM savings were not measured; backend builds are queued
under X01.

R01 changed `ConversationBuffer` copies to share owned segments. Mutable visits
and partial resize detach shared segments before exposing or changing payloads;
the class reports shared segment capacity and cumulative bytes copied by COW.
Its direct probe observed 4096 shared bytes across three sibling buffers and
4096 copied bytes when one sibling changed one byte. The exact-prefix cache
probe matched a three-token root only when the full prefix agreed. Green took
0.779 seconds; G0 and reference mutants passed. The driver checked the
Q8_0/FP16 profile plus the existing SUT and separately linked oracle hashes,
but this CPU test made no model forward or numerical comparison. The 4 KiB
fixture is an ownership check, not a whole-workload RAM-savings or throughput
measurement. No CUDA, HIP or SYCL engine build was performed; X01 remains
queued.

R02 made buffer segments explicit views over owned payloads. Snapshot capture
freezes every K/V, scale and pooled segment, including unique buffers. A later
mutable visit splits the view at the written range and copies only that range,
keeping neighboring prefix/suffix bytes on the published payload. The CPU
probe measured 17 bytes copied for a write to a unique frozen buffer and 23
bytes for a sibling tail write; the parent byte stayed unchanged. Green took
0.581 seconds; G0 and reference mutants passed. Driver bindings included the
Q8_0/FP16 profile, SUT and separate oracle, but this test did not load them or
compare logits. It did not run physical CUDA page audits, scale/indexer/GDN/PLE
integration checks, or exhaustive G3-003 coverage. Those original assertions
remain unchanged and unqualified; no backend build or gate certification was
performed.

R03 changed cache byte accounting to deduplicate shared payload allocations
across parked snapshots and retained reuse images. Direct storage metrics
report unique payload capacity, allocation count, current `shared_ptr` owner
count, and cumulative COW-copied bytes. The probe measured 4,644 cache bytes
for two snapshots sharing one 4,096-byte payload; the owner count fell from
two to one when the first entry was evicted and to zero after clear. Remaining
bytes were per-snapshot directories and metadata. The final green after a
pre-reservation safety fix took 0.886 seconds; G0 and reference mutants passed.
An intermediate rerun preserved a compile typo in that reservation fix. No
host RAM-pressure telemetry, OOM injection, model restore, disk roundtrip, GPU
work or numerical comparison was run. The registered G2/G3 methods remain
unexecuted; this ticket is not gate certification. `conversation_memory.cpp`
telemetry was unchanged because this probe measures cache allocations through
their actual payload owners, not an OS available-memory estimate.

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
tests and C01-R03 implementation tests are separate from the registered suite
and do not increase registered implementation coverage. G4 still lacks its 11
registered methods; G5 still lacks its 12. Ticket validation is not gate
certification.
The runner preserves old validation, exposes stale fingerprints and never
converts a ticket outcome into a gate PASS. The long campaign remains disabled.

## Evidence and restart

[harness-validation.json](harness-validation.json) records actual test IDs,
counts, fingerprints, numerical/resource measurements and limits. Private raw
evidence is in `evidence/runs/luna/`, including the Windows import failures,
two intended red failures, the append-only ledger and
`remote/evidence-final.zip`. Archive SHA-256:
`7a7a3b235f33e01d0ac281d022f0165c378125d7c4abda276b8c50b7e65bc535`.

The Windows ledger has H00 and B00 validated. The owned Linux ledger records
H00, B00, B01, B02, C01, C02, C03, R01, R02 and R03 validated; on the final
R03 source fingerprint, R03 is current while R01 and R02 are stale and need
post-build regression. Its recorded next ticket was **S01**; the takeover
review below supersedes that recommendation. C01,
C02 and C03 run reports and hash-chained ledger snapshots are under
`evidence/runs/luna/remote/C01-20261012/` and
`evidence/runs/luna/remote/C02-20261012/` and
`evidence/runs/luna/remote/C03-20261012/` and
`evidence/runs/luna/remote/R01-20261012/` and
`evidence/runs/luna/remote/R02-20261012/` and
`evidence/runs/luna/remote/R03-20261012/`. The local Windows ledger remains
separate; do not rerun remote reference/model evidence to make it appear local.
The remote location is recorded in `evidence/runs/luna/remote/location.json`:
`/home/dflanag3/branching-g3/luna-handoff-20261012T015402-76cb1e6d`.
Do not repeat the completed reference/model checks merely because the local
Windows ledger does not contain the Linux runs. Inspect the Linux ledger on
its own host with the recorded bindings.

Read [the Luna handoff](../plans/luna/HANDOFF.md) and launch with
[LAUNCH.txt](../plans/luna/LAUNCH.txt). No Codex CLI session, push, PR, service,
or long certification campaign was launched by this handoff preparation.

## Primary takeover, 2026-10-12

Luna's execution turn stopped before takeover. Commit `6e651a15` preserves
its implementation and tests. The owned execution directory is now
`/home/dflanag3/branching-g3/primary-queue-20261012T031643` on llm-49 / r4090.

- C02-REPAIR: PASS, three tests, no failures/errors/skips/xfails, 74.878 seconds.
  Nine fresh-process full-vocabulary comparisons had maximum absolute error
  0.0. Forced idle feeds, consumed-token publication, interrupted publication,
  grammar/RNG resume and complete numerical-checkpoint eviction were checked.
  The existing CUDA binaries and unqualified Q8_0/FP16 profile were used.
- R03 repair: PASS for two actual C++ sanitizer/allocation-failure tests,
  two unchanged R01/R02 probes and the unchanged R03 accounting probe.
  ASan exposed a segment reference invalidated by vector reservation; capturing
  its payload and offsets before reservation removed the use-after-free.
  Four failed allocations left the payload and completed-copy counter intact.
  The original R01 workspace-copy assertion also failed during review; restoring
  unpublished value-copy behavior fixed it while retaining published range COW.
- G0: PASS, 51/51 on Linux. Four reference mutants rejected. No registered
  tests, equations or tolerances were edited. No new G1-G5 gate PASS is claimed.

[takeover-validation.json](takeover-validation.json) records executed test IDs,
reports, artifact hashes and limitations. Raw archive SHA-256 is
`38173e40e26e661ccc6ec66a2f2528590a6c61e661302e2206fb7b3524c0a2ed`.
All earlier failures remain in the ledger and raw evidence.

C01's focused checkpoint-identity check does not establish normal native cache
integration. The next work is a new CUDA engine build and completion of that
integration before relying on S01's prerequisites. CUDA configuration succeeded
with the changed source. Compilation of 15 targets succeeded in 127.188 seconds.
Nine native executables then passed, but the unchanged conversation snapshot
test failed its incremental allocation-admission assertion. A new test reproduced
under-admission for published shrink/same-size/growth rewrites; including detach
payloads and view-directory allocations made that focused test pass. The rebuilt
snapshot test now reaches a retained-pointer stability failure. The unchanged
validation and transfer tests also fail their exact estimate-versus-image-bytes
assertion. These integration failures remain unresolved; native validation is
FAIL, not PASS. Tests and their assertions remain unchanged. The first build's
commands, source/binary hashes and logs are in the execution directory's
`native-validation-primary/progress.json`; the admission red log is retained
under `evidence/runs/luna/remote/PRIMARY-20261012/`.
HIP and SYCL compilers were not found on the execution host's PATH; those builds
remain unverified. The long certification campaign remains disabled.

## Native repair follow-up, 2026-10-12

R03-ADMISSION passed three unchanged-after-red native tests, the three original
R01/R02/R03 probes, G0 51/51 and four reference mutants. Const callbacks now read
without COW. Standalone capture admission retains its original conservative
per-buffer charge; cache-wide allocation counting still deduplicates actual
payload identities. Published rewrites charge detached payloads and directories.
The unchanged native validation and transfer executables now pass 972 and 1548
checks. The snapshot executable still fails `growth never reallocates the
retained payload`: the test requires pointer retention even when `dirty=3` or
`dirty=0` rewrites that prefix. Sharing the old address for different bytes would
mutate the ancestor. This failure is retained and is not counted as a PASS.

The rebuilt actual CUDA SUT and separate fresh-process oracle passed three
controller-boundary tests and registered G3-004. There were 17 full-vocabulary
comparisons, maximum absolute error 0.0, 175 oracle-computed tokens and 28
retained-image-after-generation byte audits. Six hot appends computed one token
each; measured COW was 216 pages / 452984832 bytes. The maximum tracked VMM bytes
sampled after those appends was 578813952; this excludes model arenas and host
memory and is not a process-wide peak. The profile remains unqualified.
[current-native-validation.json](current-native-validation.json) records the
executed IDs, exact source/binary/model/profile hashes and limits. Raw archive
SHA-256: `56fd895e88e79e31899e5ae5e7fe1b2d30ee492fa2dbd2e89de6d9c095a5310d`.

C01-EXACT adds and validates a read-only native cache lookup for a completely
consumed history. Legacy request matching remains unchanged. One CPU lookup
test, three original host probes, G0 and mutants passed. Its first new fixture
omitted its steering setting; that failed run was retained, the fixture setup
was corrected, and a fresh red/green cycle preserved the same assertions.
This lookup is not yet connected to the native inference driver. It was added
after the CUDA model measurements; those measurements pin the preceding source.

[queue-followup-validation.json](queue-followup-validation.json) records both
follow-up tickets, including red and failed runs. Their ledger lives in the
owned `primary-queue-20261012T031643-admission` execution directory. Raw archive
SHA-256: `5bda1950cafaed03c8e05c8a27a230f843cb5b1c8e7f0423cb9192d7f6ab8c1d`.
Next: connect exact native cache lookup and checked snapshot restore to the
canonical API, then run forced sibling/fresh-oracle and cache-miss tests.

## C01-COLD, 2026-10-12

PASS: `test_cold_resident_identity_and_no_replay` on llm-49 / r4090.
The checked disk checkpoint's full-history identity now survives replacement
with a resident native image. The saved payload measured 119371292 bytes,
including 118378012 native-state bytes; its SHA-256 matched the manifest.
The independent nine-token fresh forward matched exactly (maximum logit error
0.0). Both the cold restoration and the next hot materialization computed zero
prefix tokens. G0 51/51 and four reference mutants passed. No skips or xfails.

[cold-identity-validation.json](cold-identity-validation.json) records executed
IDs, commands, binary/profile hashes and measured bytes. Raw archive SHA-256:
`94a55bdb528ce357db21bd150afc7b3edf6996b97ac3580d852a9fe4dfe2ba32`.
Initial command-environment and test-cleanup errors were retained separately
from the clean red assertion. Assertions were unchanged between clean red and
green. This test used the existing pinned Q8_0/FP16 binaries and an unqualified
profile; it does not certify G1 or G2. Native RAM-cache inference integration
remains the next ticket.

## C01-RAM, 2026-10-12

PASS for the new native RAM-cache adapter test on llm-49 / r4090. Actual
`ConversationCache` capture stores numerical state and consumed frontier;
`BranchSession` validates complete history and runtime geometry before restoring
private device state. Controller/RNG/grammar remain in the canonical store.
Six fresh-process comparisons (two different forced two-token suffixes, before
the suffix and after each consumed token) matched exactly. Both RAM restores
computed zero prefix tokens. A changed full prefix returned a miss without
changing the active consumed position. Cache clear released all K/V payload
allocations. Measured cache capacity charge was 119373844 bytes, including
313344 K/V payload bytes; this excludes allocator/control-block overhead.

New CUDA binaries were built and fingerprinted. Four unchanged native
executables passed 434 session, 972 validation, 1548 transfer and 4219 cache
checks. The cold-to-resident regression passed again on these binaries.
G0 51/51 and four reference mutants passed, without skips or xfails.
The profile is unqualified; this is not G1-G5 certification.

[native-ram-validation.json](native-ram-validation.json) records executed IDs,
source/build/model hashes and measurements. Raw archive SHA-256:
`f1401dd2392e86a6ef3abcd539c4337883b4e8f7f91a2c91ee5bcd686ed96df9`.
The native RAM cache is private to one fixed-model process and one active
lease. The adapter is exercised from checked canonical history leases, but
automatic canonical cache-miss routing and ordinary concurrent conversation
slots are still outstanding. Full checkpoint eviction now clears native RAM
entries as well as hot handles and disk checkpoints.

## Automatic canonical materialization, 2026-10-12

C01-AUTO and C01-DUPLICATE passed their executed checks. `BranchingModel`
now parks consumed numerical histories and checks the native RAM cache when a
hot/disk checkpoint is absent. A RAM miss replays the canonical history. The
adapter without a native history cache explicitly returns a miss. Detecting a
misbound checkpoint clears native history acceleration before rebuilding.

Nine fresh-process comparisons through the canonical API had maximum absolute
error 0.0 and 87 oracle-computed tokens. A hot-cache eviction restored from RAM
with zero prefix forward work. A different full prefix missed and computed its
nine tokens. Removing every hot/RAM/disk numerical checkpoint left the immutable
root intact and replayed its nine tokens. Each forced sibling append computed
one token. G0 51/51 and four reference mutants passed.

Regression testing exposed repeated parking retaining duplicate unpinned live
histories. Exact duplicates with no intermediate checkpoint history now replace
the old entry; pinned roots and differing history/image/steering keys remain.
The original RAM test first failed with two entries; after the native rebuild
it passed unchanged, including six exact fresh comparisons and actual allocation
release. The original C01 binding and C01-COLD identity tests also passed.
Four unchanged native executables passed 4219 cache, 972 validation, 1548 transfer
and 434 session checks. Original R01/R02/R03 probes passed.

[automatic-ram-validation.json](automatic-ram-validation.json) records executed
IDs, errors retained during development, source/build/model fingerprints and
measurements. Raw archive SHA-256:
`5b0f90aee8b05bcc4bc5bf381a9dc2b4e9ca1654c402f69117edafc942706cb5`.
The latest tested SUT and oracle copies are preserved in `native-auto-primary/bin`
under the owned execution directory. The profile remains unqualified. No G1-G5
PASS, ordinary serving parity, concurrent-kernel support, host-prefix sharing
benefit or latency improvement is claimed. Next: S01 slot ownership/scheduling.

## Serialized slots and ownership, 2026-10-12

S01-OWNER and S01 passed two real-CUDA implementation tests on llm-49/r4090,
Q8_0 weights / FP16 KV. Foreign-thread reads, writes and release attempts fail
before changing the lease; its original owner continues and closes normally.
The FIFO executes two canonical branch references sequentially, preserves
independent RNG cursors, and returns only after a durable CAS branch move.
Seven fresh-process full-history comparisons had maximum absolute error 0.0
and 70 oracle-computed tokens. FIFO execution measured 2.0762215069844387
seconds for two jobs; this is not an end-to-end latency benchmark. Green runs
had zero failures, errors or skips. Linux G0 passed 51/51 and four mutants
were detected. Assertion-red runs remain in the evidence.

[serialized-slot-validation.json](serialized-slot-validation.json) records
executed IDs and backend/build/model artifact fingerprints. Raw archive SHA256
`c76ce63086385e0253dbde9965c9ae4d2b47d49bf8254bc10b87bae523cd735d`.
The user confirmed serialized execution is the first prototype priority.
Ordinary serving integration, long contexts and profile qualification remain
unexecuted; no G1-G5 PASS is claimed. Next: cancellation and slot reuse.

## S02 cancellation and recovery component, 2026-10-12

`test_s02_invariant` passed on llm-49/r4090 after its recorded assertion red.
Queued cancellation releases only the identified pending job without token
consumption. Slot reassignment then succeeds. Stale revisions reject before
GPU work, preserve retry receipts, and clear queue activity. Injected interruption
before the second snapshot publication leaves the branch on the original
generation-ready history with its original RNG cursor; later work succeeds.
Complete hot/RAM/disk checkpoint eviction replays the nine-token root and leaves
root and sibling canonical bytes unchanged. Five fresh forwards were exact
(maximum error 0.0; 48 oracle tokens), zero green failures/errors/skips.
G0 passed 51/51; all four reference mutants were detected.
[slot-recovery-validation.json](slot-recovery-validation.json) contains executed
reports, retained red and numerical measurements. Real cache-admission pressure also passed: ten distinct retained histories
forced the eight-entry cache to evict numerical states. At measurement it
held 954,990,752 capacity-accounted bytes and 2,506,752 KV payload bytes
across 288 allocations. The oldest history replayed nine tokens and matched
its fresh oracle exactly. These counters are not process RSS. Final green,
G0 and mutation runs passed; S02 is VALIDATED for the recorded local API
component scope. Every-frontier process kills, GPU OOM and randomized
concurrent interleaving remain outstanding acceptance qualification. The
publication injection is not a process-kill or GPU OOM measurement.

## Fresh normal-prefill diagnosis, 2026-10-12

N01's diagnostic test passed after its recorded red. Eight new processes
measured the historical 127-token counterexample and a one-token control on
llm-49/r4090, Q8_0 weights / FP16 KV. Actual counters report the complete
history: normal prefill consumed n-1 tokens and the final verifier consumed
one; the independent token-level oracle consumed n tokens from an empty
session. All 248,320 logits per forward are retained.

The current normal chunk-1 vs chunk-128 error at length 127 is
1.3281426429748535; chunk-31 vs chunk-128 is 1.259131669998169.
Normal vs token-level maximum error is 2.688899040222168. Even the one-token
control differs by 1.1226537227630615, with no batched-prefix work. Top-1
matched in these six comparisons. These are absolute logit errors, not
percentages. The historical 1.5612177848815918 counterexample is preserved.

G0 passed 51/51 and four reference mutants were detected. No tolerance was
fitted or admitted. N01 validates diagnosis only; normal batched equivalence
remains unresolved. Source inspection identifies differing expert-dispatch
initialization as a hypothesis for the one-token discrepancy, not yet a
measured cause. [normal-prefill-validation.json](normal-prefill-validation.json)
records full-vector hashes, work counters, binaries and model fingerprints.
Raw archive SHA256: `189e983b183b1ed156c87c8f1d9eaa1595a204622d5a4547ba120ad6f52cdc67`.
