// Application-wide values. Algorithm internals (FSRS bounds and weights) stay in fsrs/.

// Storage
export const APP_NAME = 'vutadex';
export const DB_NAME = 'vdex.db';

// Text limits, in UTF-16 code units (what String#length counts)
export const MAX_DECK_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

/** Card front/back, note fields and generated card text. */
export const MAX_TEXT_LENGTH = 10000;

// Study sessions
export const DEFAULT_NEW_LIMIT = 20;
export const DEFAULT_REVIEW_LIMIT = 100;
export const MAX_STUDY_LIMIT = 1000;

// Scheduling
export const TARGET_RETENTION = 0.9;

// Media
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MEDIA_REFERENCE_PREFIX = 'deez-media://sha256:';

/** Matches a full media reference; capture group 1 is the lowercase hex SHA-256. */
export const MEDIA_REFERENCE_PATTERN = /^deez-media:\/\/sha256:([0-9a-f]{64})$/;

// Parsing
/** A positive integer with no sign, leading zeros or separators, e.g. "7" but not "0" or "007". */
export const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export const MIGRATION_FILE_PATTERN = /^(\d+)_.+\.sql$/;
