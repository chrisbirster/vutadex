# M6.2 — Plandalf `.deck` v2 interchange contract

Status: **format verified; implementation pending**. This document is a compatibility gate, not a claim that `vdex deck import/export` is supported yet.

Upstream references (checked 2026-10-19):
- [Plandalf format](https://github.com/chrisbirster/plandalf/blob/main/docs/deck-format.md)
- [Plandalf card types](https://github.com/chrisbirster/plandalf/blob/main/docs/card-types.md)
- [Plandalf CLI](https://github.com/chrisbirster/plandalf/blob/main/docs/cli.md)

## Wire format

UTF-8 **newline-delimited JSON** (NDJSON), one object per nonempty line. Emit exactly one initial deck header:

```json
{"kind":"deck","format":"plandalf.deck","version":2,"name":"Geography"}
```

Subsequent records are logical notes, not generated cards:

```json
{"kind":"note","note_type":"reverse","fields":["France","Paris"],"tags_json":"[]"}
```

Use the existing supported note types and their exact positional fields from `docs/m5.md`. Preserve fields without coercing JSON-in-string values for choices, ordering or occlusion. `tags_json` is a JSON-encoded string, not a JSON array. Vutadex currently has no equivalent per-note tags storage: until tags round-trip faithfully, **reject nonempty tags** instead of silently dropping them.

Sharing is deliberately **content only**. Never export or restore FSRS due dates, card IDs, review events, scheduling state, learned parameters or sessions. Import creates new local IDs and fresh study state. Generated cards are derived from notes. The file extension is `.deck`; it does not imply a ZIP container, SQLite file, media bundle or backup.

## Compatibility and safety decisions

1. Export a stable deck-name header followed by deterministic logical-note order, with no retired notes and no duplicate generated-card records.
2. Existing manual Vutadex cards have no originating logical note. To avoid loss, export them as fresh `basic` note records after logical notes, preserving front/back text only.
3. Import into **a new deck**. Parse, validate and bound all records **before database mutation**, then create deck and notes in one SQLite transaction. On any failure leave no partial deck, note or card.
4. Reject unsupported versions, record kinds, malformed NDJSON, missing header, unknown note types, invalid positional fields, trailing unrecognized objects, and content exceeding explicit input limits. No dynamic SQL derived from the file, no remote media fetches.
5. For `image-occlusion` records, a `deez-media://sha256:...` URI alone does not transfer image bytes. Until M6.3 ships a validated portable media transport, reject imports whose media blobs are unavailable locally; export should fail rather than silently emit an unusable image-containing deck.
6. Never accept incoming review history or scheduler values even if embedded in extra keys. Define explicit allowed keys and reject unknown fields.
7. V1 Plandalf files contain `kind:"card"` records. V1 **import** is a later compatibility option, not part of v2 export; do not label the reader v1 compatible until fixtures pass.

## Required M6.2 acceptance

- Export and reimport Basic, reverse, optional reverse, cloze, typed answer, multiple choice/select, ordering, plus valid locally available image occlusion.
- Match upstream Plandalf-produced fixtures byte-semantic (not IDs); confirm Plandalf imports a Vutadex export.
- Round-trip manual cards as Basic notes; preserve UTF-8, embedded newlines, quote escapes, stable field arrays, note counts and deterministic record order.
- Prove source FSRS history remains untouched and destination cards start unreviewed.
- Malformed files, unsupported versions, unknown types, invalid choice/mask schemas, nonempty unsupported tags, missing media, and mid-import injected SQLite failures leave the original database unchanged.
- End-to-end CLI tests use temporary homes and packaged `vdex`; run Node 26 Ubuntu, macOS and Windows checks before merge.

## Separation of concerns

M6.2 is **shareable content interchange**, not a restore strategy. M6.3 must separately cover database/FSRS backup, integrity verification and media portability. Neither feature may represent `.deck` as a full-fidelity personal backup.
