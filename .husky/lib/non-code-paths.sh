#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# Canonical "is this change non-code?" allowlist — the SINGLE source of truth for
# both git hooks: pre-commit (skip lint-staged) and pre-push (skip pnpm build).
# Defined ONCE here and sourced by both, so the allowlist can NEVER drift between
# them. This file is the canon propagated verbatim to the other repos.
#
# A path is NON-CODE iff it matches the allowlist below. EVERYTHING else is CODE:
# all source, all styles, and specifically .json / .yaml / .yml / .lock (they gate
# the build). This is a FAIL-SAFE allowlist — an unrecognized path is treated as
# code, so a new/unknown file type can never silently skip the build or the lint.
# To let a genuinely non-code asset skip, extend the allowlist HERE (one place).
#
# Allowlisted (case-insensitive), by extension:
#   docs       .md .mdx .txt
#   documents  .pdf                       (e.g. CONTEXT/ competitor-quote PDFs)
#   images     .png .jpg .jpeg .gif .svg .webp .ico
# and by exact basename:
#   licenses   LICENSE  (in any directory)
# and by path prefix:
#   git hooks  .husky/  — the ONE directory allowlist, and it's safe: git hooks are
#              shell run by git, NEVER part of `next build`, so nothing under .husky/
#              can affect the app build (the build never tested hooks anyway). This
#              also makes the canonical SELF-propagating — pushing a hook change (this
#              very canon out to the other repos) skips its OWN build gate, so no
#              `git push --no-verify` is needed to land it.
#
# We do NOT blanket-allowlist any OTHER directory (e.g. CONTEXT/). A directory is
# only safe to allowlist when NOTHING in it can reach the build — true for .husky/,
# NOT for CONTEXT/ (a stray .ts/.mjs fixture there must still gate). CONTEXT/ docs
# are already covered by their doc extensions above. Keep this list extension- and
# basename-based; .husky/ is the single, justified path exception.
# ─────────────────────────────────────────────────────────────────────────────

# Case-insensitive extension allowlist, one alternation, anchored to end-of-path.
# (Used with `grep -iE`; each input line is exactly one path.)
NON_CODE_EXT_RE='\.(md|mdx|txt|pdf|png|jpe?g|gif|svg|webp|ico)$'

# all_non_code "<newline-separated paths>"
#   Exit 0 (true)  iff the list has >=1 path AND every path is non-code (allowlisted).
#   Exit 1 (false) if the list is empty OR any path is code.
# Reads its input from $1 (NOT stdin) so pre-push can keep reading refs from stdin.
all_non_code() {
  # Real (non-blank) paths in the list.
  _ncp_any=$(printf '%s\n' "$1" | grep -vE '^[[:space:]]*$' || true)
  [ -n "$_ncp_any" ] || return 1        # empty set -> not provably non-code

  # Of those, the ones NOT allowlisted (by extension, then bare LICENSE) = code.
  # Anything left after stripping the allowlist means the change touches code.
  _ncp_code=$(printf '%s\n' "$_ncp_any" \
    | grep -viE "$NON_CODE_EXT_RE" \
    | grep -vE '(^|/)LICENSE$' \
    | grep -vE '^\.husky/' \
    || true)
  [ -z "$_ncp_code" ]                    # true iff nothing left = all non-code
}
