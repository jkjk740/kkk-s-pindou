# Execution ledger — 2026-10-09-cutout-and-detail-conversion.md

- User approved spec and implementation plan; implement in this session and checkout.
- Ruling: do not run tests/lint/runtime acceptance, create branches or commits — explicit user/project constraints override default skill gates. Write regression cases first; compile/start is authorized.
- Pre-flight: conversion limits feed storage, backend validation, gallery and export; cutout IDs feed work DTO, local snapshots and restore; grayscale masks feed both manual editor and server compositor; export pages feed saved-page tracking and public counting.
- Ruling: retain current repository APIs and private image endpoints; add normalized-input ownership mapping and private cutout metadata lookup as planned.
- Tasks 1–10 implementation and startup work are delivered. The planned automated and device acceptance matrix is not marked passed: tests were written but not executed, and remaining platform/edge-case scenarios are listed for user acceptance. Real AI calls and album validation remain user-owned; missing AI configuration is not a reason to fake results or block manual tools.

## Implementation record

1. Conversion: shared 128-edge / 16384-cell / 221-color limits, alpha-only empty-cell handling, Lab matching and bounded reduced-palette optimization; uploads default to 64 / 32.
2. Local works: immutable per-work records and an atomic index, legacy v1 read compatibility, 40-work / 5 MiB budget and rollback of staged writes; temporary image paths are not persisted.
3. Data: normalized-input mappings, confirmed cutouts, durable tasks, queue lock and nullable work cutout references; owner/source checks continue through sync and public snapshots.
4. Images: EXIF-aware normalized input, canonical grayscale-mask validation, original-alpha multiplication, private mask/result persistence and known-rollback cleanup.
5. AI: optional official Alibaba SDK adapter, explicit user disclosure, bounded downloads, no automatic paid retries, durable request UUIDs, serial processing and restart interruption handling.
6. Manual editing: brush differences, lasso selection, undo/redo history budgets, viewport geometry and stale-result session guards.
7. UI: fixed cutout tools/footer, clipped checkerboard workspace, idle selection outline, magnifier, pinch/pan, comparison and self-built confirmations; asynchronous mask application blocks edits and submission.
8. Editor integration: confirmed cutout is converted as a candidate before replacing the draft; cancellation/stale responses retain the old work; original restoration requires confirmation.
9. Export: adaptive full-sheet layout or 64-grid tiles, global mirror coordinates, per-tile material counts, sequential album saves, failed-page continuation and one final public download confirmation.
10. Handoff: local incremental migration completed, front-end development compilation completed, back-end development service started, configuration and user acceptance guide written.

## One read-only review

Singer reviewed the implementation without running tests or accessing credentials. All six findings were addressed:

- Keep the home page first in page registration; the cutout tool is not the launch page.
- Acquire the global queue lock before taking a MySQL consistent-read snapshot for quota checks.
- Freeze manual editing and confirmation during asynchronous AI-mask application; reject stale canvas loads.
- Widen narrow export tiles independently of grid width so the 221-color legend fits the full canvas budget.
- Retain unfinished export sessions, direction, saved-page cursor and public download intent when closing/reopening the sheet.
- Confirm original restoration before resetting manual color edits and row progress.

## Actual delivery evidence and limitations

- `npm --prefix backend run migrate:cutout` reported that the incremental schema was written and existing images/works were retained. Scope is only local `127.0.0.1:3306/bead_island`; no password reset or bless changes.
- Front-end watch reported `DONE Build complete. Watching for changes...` after the final source edits.
- Back-end watch reported `豆屿后端监听 127.0.0.1:3001` and remains running. No HTTP acceptance requests were issued by the agent.
- The unlocked WeChat developer tool is already open on this project's cutout page. It contains an in-progress editing session, so no manual restart/recompile or cancel/save action was taken that could discard the user's selection.
- AI is not configured or invoked. User configuration steps, privacy disclosure and possible fees are documented in `docs/cutout-and-detail-conversion.md`.
- Tests/lint, true AI segmentation, real-device gesture behavior and album saves were not run or validated by the agent. The added regression cases and manual acceptance matrix are handed to the user, not asserted to pass.
- Dependency installation's automatic npm report included one high-severity advisory. No separate audit, forced dependency upgrade or audit fix was run; this remains a release-readiness item for the user.
- No branch, worktree or commit was created.
