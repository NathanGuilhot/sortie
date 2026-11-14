# Duplicate detection

Imports, watched-file changes and Cleanup scans use the same versioned file analysis. A single worker hashes file bytes, normalizes orientation/color/alpha, and computes a perceptual fingerprint plus a small comparison image. SQLite writes stay in the main process. Changes during processing trigger another pass; derived results from an older content revision are discarded.

Byte equality proves identical files. A Hamming-distance tree proposes visual candidates without a fixed neighbor limit. Candidates must pass both a cached full-frame comparison and a larger comparison with local-detail checks. Groups contain only mutually verified pairs. Animation, multipage and RAW files use byte equality only. Unsupported visual decoding and unreadable files are reported as incomplete coverage.

Visual matches are suggestions for manual review. Fixed-size image comparisons cannot prove that every small edit is absent. Thresholds are conservative heuristics, not probabilities. Crop, flip, watermark and edit detection are outside the current scope. CLIP is used by semantic search, not by duplicate detection.

Cleanup presents full-image thumbnails, dimensions and file size. The user chooses a keeper and confirms the number of other writable images going to Trash. Board memberships combine automatically without duplicate entries. The keeper's descriptive metadata stays unchanged. Paths, file extensions in action labels, and preservation settings are absent from the review flow.

## Recovery

Each removal has a durable journal entry before the operating-system Trash call. Confirmed Trash success is persisted separately from an in-progress move. Startup finalizes known successes, while interrupted ambiguous moves retain their records for investigation rather than assuming a missing path proves success.

Trashed images retain their original image records and board memberships, and a separate `trashed` flag keeps them out of gallery and board queries even after a drive reconnects. Restoring a file from system Trash and importing or rescanning its folder reuses the original record and clears that flag. There is no fallback to permanent deletion. Recovery does not reconstruct files deleted from system Trash.

Boards are represented by `tags` and `image_tags` internally. This storage naming does not introduce a user-facing tags feature.

## Validation

Use Node 20, matching CI, and Yarn. Run `yarn type-check`, `yarn lint`, `yarn format:check`, `yarn test`, and `yarn build:code`. The test script rebuilds SQLite for Node and restores its Electron ABI afterward.

Regression coverage includes cross-format and resized copies, orientation, alpha, local edits, small text changes, more than twelve copies, non-transitive grouping, stale records, dismissal revisions, cancellation, board union, Trash failure, interrupted moves and restored files. Generated fixtures contain no private library artwork.
