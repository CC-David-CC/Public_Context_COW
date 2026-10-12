# Recorded implementation decisions

## October 12 UTC: Luna development harness

- Created local `feat/branching-completion` from `6dd5f9df`, preserving the
  published upstream-port branch. The handoff adds orchestration, tests and
  evidence; it does not change inference or the 85 registered assertions.
- Used a stdlib queue, explicit ticket states and an append-only hash-chained
  development ledger. This ledger is independent from canonical product
  history. No database or alternate conversation representation was added.
- Reused the existing ticket result collector and cumulative verifier. The
  harness records actual unittest IDs, fingerprints and artifacts, and refuses
  skips, xfails, missing artifacts and stale validation. A ticket is not a gate.
- Recorded an actual failing assertion for import errors being accepted as
  red evidence, then fixed it. The initial broader regression also exposed a
  missing `tests/` path case in changed-test detection; that defect was fixed.
  A second recorded red assertion exposed stale observations that could not
  be revalidated; fresh executed evidence now permits revalidation.
- Tested kernel process identities and lock contention on Windows and Linux.
  Windows owned job objects and Linux owned process groups terminated actual
  descendant processes on timeout. Ambiguous/inaccessible/live processes
  prevent duplicate execution. Abrupt Linux driver death can leave a live
  child; it must be observed rather than restarted.
- Kept 1800-second command and 7200-second ticket validation limits. The queue
  keeps the original exhaustive assertions and disables the long campaign.
  Unsupported builds/isolation/persistence capabilities remain explicit.
- Rechecked llm-49 and created a fresh owned scratch copy for bounded checks.
  Existing builds, profiles and measurements were not overwritten. Checked
  422 native/build source hashes and 11 unchanged model-file hash receipts;
  no new model bytes were hashed and no backend build was performed.
- Executed the same final 18 harness tests on Windows and Linux. Executed
  Linux G0/demo/mutation smoke and unchanged G3-004. The final model case used
  Q8_0/FP16 and existing separately linked SUT/oracle binaries; eight comparisons
  were exact, 28 byte audits passed and cleanup was observed. No numerical
  gate admission was inferred from this case.
- Audited the meaning of shared allocation counts: 24 root allocations remained
  shared by each initial child after append, but none reported filled-prefix
  bytes in the short fixture. This does not prove populated full-prefix sharing
  or total-RAM savings. Future sharing checks must distinguish allocated pages
  from live prefix payload, rather than counting unused capacity as saved KV.
- Reproduced native Windows reference failures without changing the store or
  tests. G0 ran 11 tests with two `fcntl` import errors; demo and mutants could
  not import the store. The Windows portability tickets remain necessary.
- Captured host-specific raw paths/bindings in ignored private evidence. Public
  summary records source/build/model identities and measured scope. No push,
  submission, merge or long-running certification was performed.
