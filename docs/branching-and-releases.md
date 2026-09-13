# Branching and releases

```text
feature/* --PR--> dev --release PR--> main
                                      |
                                   vX.Y.Z
```

Feature work starts from current `dev` and never targets `main`. CI must pass before merge; squash merge is preferred. When `dev` is release-ready, open `Release vX.Y.Z` into `main`, merge the exact tested head, then create an annotated tag on `main`. Deploy release artifacts from tags.

Pre-releases use `v0.x.y-rc.N`. Emergency fixes start from `main`, are tagged, then immediately back-merged/cherry-picked to `dev`.

The repository began empty, so the one initial README commit on `main` exists solely to establish Git refs; all implementation work starts on feature branches.
