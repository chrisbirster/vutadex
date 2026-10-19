# Milestone versions and GitHub releases

Vutadex uses one **minor version** for each pre-1.0 milestone. The package and
root lockfile must be updated together as part of each milestone release PR.

| Milestone | Intended version |
| --- | --- |
| M0 | v0.0.0 |
| M1 | v0.1.0 |
| M2 | v0.2.0 |
| M3 | v0.3.0 |
| M4 | v0.4.0 |
| M5 | v0.5.0 |
| M6 | v0.6.0 |
| M7 | v0.7.0 |

A milestone is not released just because development work was merged to `dev`.
The release boundary is the reviewed `dev` → `main` pull request, using a
regular merge commit to preserve ancestry. Unit, integration, regression,
packaged-CLI, and cross-platform coverage checks must pass before merging.

The `Publish versioned release` GitHub Actions workflow waits for successful
**main push CI**, verifies it tested the latest main commit and that
`package.json` and `package-lock.json` versions match, then creates the
corresponding immutable `vX.Y.Z` Git tag and GitHub Release if missing.
If the tag already exists, it is never moved. Maintenance changes that keep
the same package version do not create an additional release.

## Historical version mismatch

M0, M1 and M2 merged when `package.json` still reported `0.1.0`.
The intended historical milestones are M0 `v0.0.0`, M1 `v0.1.0`, and
M2 `v0.2.0`, but **M0 and M2's original commit metadata do not match
those versions**. Never rewrite their released commits merely to fix metadata
or silently assert historical package versions that are not present.
Any historical backfill requires clearly labeled release notes explaining this
discrepancy and selecting the verified milestone merge SHAs.

M3–M5 already have matching package versions. M6 must not be tagged as
`v0.6.0` until its functionality is complete and approved on `main`.
The initial post-M5 canonical Cleanup v3 promotion retains `0.5.0`:
a code-structure cleanup is not an M6 release. A future v1.0.0 release
requires its own explicit sign-off, after the M7 distribution milestone.
