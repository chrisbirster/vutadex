# Vutadex roadmap — v1.0.0 release candidate

Branch flow: feature/* → dev → main. CI must pass on Ubuntu, macOS and Windows; use regular merge commits to preserve ancestry. A version in dev is **not a published release**.

## Completed foundations (M0–M5)
- [x] Node 26 TypeScript CLI, SQLite migrations and cross-platform CI.
- [x] Deck/card CRUD and interactive study session flow.
- [x] FSRS-7 scheduling, review history and undo.
- [x] Plandalf-style logical notes and generated cards, including structured prompts and textual image-occlusion fallback.
- [x] Cleanup v3 modular commands and canonical SQL migrations (#47, #48).

## M6 — Portability and recovery
- [x] Statistics, activity and UTC due-date forecast (#52).
- [x] Plandalf `.deck` v2 export/import, strict validation, transactional fresh note generation, rollback tests (#54, #55).
- [x] Content-addressed media integrity; consistent SQLite + media snapshots and fresh-only recovery (#58).
- [ ] Release verification on the final v1 candidate and promotion to main.
- Boundary: `.deck` files are content-only and **cannot transfer image binaries or FSRS history**; image-occlusion deck sharing remains unsupported. The separate backup archive includes image bytes. No graphical mask viewer.

## M7 — Distribution and v1 readiness
- [x] GitHub milestone tagging workflow, immutable existing tags (#50).
- [x] Node 26 Ubuntu/macOS/Windows unit, regression and coverage gates.
- [x] Built CLI and canonical SQL packaging smoke.
- [x] npm tarball manifest checks across operating systems (#57).
- [ ] Installed-package smoke test, end-to-end portability and backup recovery acceptance (v1 candidate PR).
- [ ] Current v1 documentation, version/lockfile equality and main CI.
- [ ] Release publication as v1.0.0 from validated main and final verification of tag/Release.

No npm registry publication, cloud sync, hosted API or graphical UI is in v1 scope. Full personal-data backup and content sharing serve different purposes.
