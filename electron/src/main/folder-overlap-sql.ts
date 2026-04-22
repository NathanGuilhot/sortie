// Shared SQL fragments for folder-overlap-aware queries.
//
// When two registered folders overlap (e.g. /foo and /foo/bar), images under
// the intersection belong to both. These NOT EXISTS clauses filter to images
// that are NOT covered by any other folder — used to scope folder removal and
// availability flips so sibling folders' files are left alone.

export const OVERLAP_EXCLUDE_CLAUSE = `NOT EXISTS (
  SELECT 1 FROM folders f2
  WHERE f2.path <> ?
    AND images.file_path LIKE f2.path || '/%'
)`;

export const OVERLAP_EXCLUDE_AVAILABLE_CLAUSE = `NOT EXISTS (
  SELECT 1 FROM folders f2
  WHERE f2.path <> ?
    AND f2.available = 1
    AND images.file_path LIKE f2.path || '/%'
)`;
