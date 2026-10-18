# M0 code-quality gates

The project uses strict `tsc` checking plus a dependency-free TypeScript style checker:

- `npm run typecheck`: type correctness.
- `npm run lint`: line endings, trailing whitespace, and final newline in .ts/.json/.md/.yml files.
- `npm run format`: automatically normalize those whitespace rules.
- `npm run check`: all checks and tests.

**Scope:** This is deliberately a minimal style checker, not a full ESLint or Prettier replacement. More comprehensive lint and formatting rules can be introduced in a focused follow-up when desired.

## Branch rules (owner setup)

GitHub repository Settings → Rules → Rulesets → New branch ruleset:

1. Target `dev` and `main` (one or separate rulesets).
2. Require pull requests before merging, at least one approval where supported, and block force pushes/deletion.
3. Require all three CI checks after the feature PR merges: `Node 26 / ubuntu-latest`, `Node 26 / macos-latest`, `Node 26 / windows-latest`.
4. Enable requiring the branch to be up to date before merging if practical.

An administrator must apply these rules in GitHub Settings; repository file changes alone cannot enable enforcement.
