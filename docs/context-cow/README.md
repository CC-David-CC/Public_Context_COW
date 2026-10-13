# Context COW v0.1.0 — experimental

Context COW keeps immutable conversation histories while reusing optional model
state in GPU memory, host RAM and on disk. The focus is GPU copy-on-write: share
an unchanged prefix, prepare private tail pages, and continue different branches
without changing their common parent.

This project is based on [Strata](https://github.com/Niko1221/Strata). Compatible
changes are intended to be proposed upstream over time. Publication here does
not imply that these changes have been accepted upstream.

- [Build and run](GETTING_STARTED.md)
- [Measurements, fingerprints and limitations](RESULTS.md)
- [Runner inventory](RUNNERS.md)
- [Priorities and design](ROADMAP.md)
- [Raw reports and export manifest](results/MANIFEST.json)
- [Figure sources and provenance](figures/PROVENANCE.json)

The source checkpoint for the latest GPU optimization is `c053ddbb`.
The Git release tag is `context-cow-v0.1.0`; this version identifies the
experimental Context COW package, independently of Strata's version numbers.
