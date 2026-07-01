# Sherlock — Project-Aware Tier Config Bootstrap

**Date:** 2026-07-01
**Status:** Design (approved in brainstorming)
**Base:** `main` (includes the short-slug + no-skeleton-scaffold work).
**Scope:** Tier defaults (`src/config.js`), a new config-generation module
(`src/config-gen.js`), the `investigate` prep flow (`src/commands/investigate.js`), and the
SKILL.md refine loop. **No change** to the finding/verdict schemas, lens/rule logic,
partition grouping, or the report format.

---

## 1. Problem

In a repo with **no `sherlock.config.yml`**, the built-in default tier map
(`src/config.js` `defaultTiersConfig`) is `S: []`, `A: ["**/ws/**", "**/streaming/**"]`,
`B: ["**"]`. Almost every unit falls to **tier B**, so the risk-tiering — and the
tier-based lens applicability that depends on it — is meaningless out of the box. Tiers
only look healthy when a repo already ships a hand-written config.

## 2. Goal

Two complementary fixes (user chose "both"):

1. **Better static defaults** — ship a real risk taxonomy as the built-in default, so even
   with no config (or a standalone `partition`) tiers are meaningful.
2. **Project-aware config bootstrap** — at initialization, when no config exists, the CLI
   **scans the file tree** and writes a **tailored draft** `sherlock.config.yml` (tier
   globs only for risk keywords that actually appear), then **Claude refines** that draft
   against the tree **before** the real partition runs.

The engine split is **CLI scan → LLM refine** (deterministic draft, LLM adjustment).

## 3. Non-goals (YAGNI)

- No fuzzy filename matching (`*auth*` would catch "author"). Directory-segment globs only.
- No change to schemas, lenses, rules, partition grouping, or report format.
- No overwrite of an existing config — bootstrap only ever writes when none is present.
- No LLM inside the Node CLI — the CLI draft is deterministic; refinement is a SKILL.md
  step Claude performs.
- No auto-`git add` of the generated config; the user owns it (README notes gitignore is
  optional — the config is meant to be committed).

---

## 4. The risk taxonomy (single source of truth)

Defined once in `src/config-gen.js` and reused for both the static defaults and the scan:

```
S (highest risk):  auth authz login security secret secrets crypto credential credentials
                   token tokens password passwords payment payments billing
                   oauth jwt sso saml iam vault keys
A (elevated):      api server route routes router controller controllers db database
                   model models middleware session sessions tenant permission permissions
                   ws websocket stream streaming upload uploads webhook webhooks
                   handlers graphql rpc gateway queue queues worker workers storage cache
```

A keyword `k` maps to the glob `**/{k}/**` (matches any directory named `k` at any depth).
`B` is always `["**"]`.

---

## 5. Part A — better static defaults (`src/config.js`)

`defaultTiersConfig()` returns the **full taxonomy** as globs:

```js
// derived from src/config-gen.js TIER_KEYWORDS
S: ["**/auth/**", "**/authz/**", "**/login/**", … "**/billing/**"],
A: ["**/api/**", "**/server/**", … "**/webhooks/**"],
B: ["**"],
```

To keep one source of truth, `config.js` imports the keyword lists (or the prebuilt glob
lists) from `config-gen.js` rather than hardcoding a second copy. These globs are harmless
when a keyword is absent (they simply match nothing), so this is a strict improvement over
the current near-empty default. `assignTier` (in `src/tiers.js`) is unchanged.

---

## 6. Part B — config bootstrap

### 6.1 New module `src/config-gen.js` (pure + unit-tested)

| Export | Signature | Behavior |
|---|---|---|
| `TIER_KEYWORDS` | `{ S: string[], A: string[] }` | The taxonomy above. |
| `keywordGlobs(tier)` | `(tier) → string[]` | `TIER_KEYWORDS[tier].map(k => \`**/${k}/**\`)`, sorted. Used by `config.js` for defaults. |
| `scanSegments(cwd, {include, exclude})` | `async → Set<string>` | `walkFiles(cwd, {include, exclude})`, then collect every directory path segment of every returned file's rel path. Reuses the existing exclude-aware walk; scopes tiering to dirs with reviewable code. |
| `tailoredTiers(segments)` | `(Set<string>) → {S,A,B}` | For each tier, keep only `**/${k}/**` where `k ∈ segments`. `B: ["**"]`. Sorted, deterministic. |
| `renderConfigYaml({tiers, exclude})` | `→ string` | A **commented** `sherlock.config.yml` body: the tailored `tiers`, the `exclude` passed in, an empty `rules.project`, and `output`. Comments explain each block and that tiers were derived from the tree. |
| `writeStarterConfig(cwd, {include, exclude})` | `async → {written, path, tiers}` | If a config file already exists → `{written:false}` (never overwrite). Else `segments = scanSegments(...)`, `tiers = tailoredTiers(segments)`, write `renderConfigYaml({tiers, exclude})`; return `{written:true, path, tiers}`. |

**No circular import.** `config-gen.js` is a **leaf** — it imports only `node:fs`,
`node:path`, `js-yaml`, and `src/glob.js`; it must **not** import `src/config.js`.
Direction is one-way: `config.js` imports `keywordGlobs` from `config-gen.js`. The
`include`/`exclude` needed for the scan and the rendered template are **passed in** by the
caller (`investigate`, which has `config.include`/`config.exclude` from `loadConfig` —
these are the defaults when no file exists), so `config-gen.js` never needs to reach back
into `config.js` for them.

### 6.2 Config presence check (`src/config.js`)

Add `configFileExists(cwd)` → `true` if `sherlock.config.yml` **or** `sherlock.config.json`
is present at `cwd`. (`loadConfig` already tolerates absence by returning defaults; this is
a separate, explicit file check the bootstrap needs.)

### 6.3 `investigate` flow change (the initialization step)

`cmdInvestigate` gains a **bootstrap gate at the top**, before the reuse-first prep:

```
if (!configFileExists(cwd)) {
    { tiers } ← writeStarterConfig(cwd, { include: config.include, exclude: config.exclude })
                                                // scans tree + writes tailored draft
    print the "Config drafted — refine, then re-run" plan section (from tiers)
    return 0                                    // EARLY RETURN: do NOT partition yet
}
… existing reuse-first prep (partition → init) → Investigation Plan …
```

The early return is the **refine gate**: it guarantees Claude refines the tailored tiers
**before** any partition consumes them. This fires **at most once per repo** — the next
`investigate` call finds the committed config and proceeds normally, so returning repos see
**zero** behavior change.

The drafted-config plan section states, explicitly:
- the path written (`sherlock.config.yml`) and that its tiers were derived from the tree;
- the tier histogram of what the scan matched (how many S/A keyword-dirs found);
- the next step: **review and refine** the `S`/`A` tier globs against the real structure
  (add project-specific high-risk dirs, drop false matches), then **re-run `investigate`**
  to partition + plan.

`--refresh` is unaffected (it forces re-partition once a config exists). A `--no-config`
escape hatch is **out of scope** (YAGNI) — a user who wants the old all-B behavior can
write a config with empty `S`/`A`.

### 6.4 SKILL.md — the refine loop

The Procedure gains an explicit first-run branch: if `investigate` reports that it drafted
`sherlock.config.yml`, Claude (a) reads the file tree, (b) refines the `S`/`A` tier globs
in `sherlock.config.yml` to match the project's real risk surface, then (c) re-runs
`investigate`. On a repo that already has a config, this branch is skipped.

---

## 7. Data flow

```
investigate (no config)
  → writeStarterConfig: scanSegments(include,exclude) → tailoredTiers
      → renderConfigYaml → sherlock.config.yml                         [CLI draft]
  → plan: "refine tiers, re-run"                                       [early return]
Claude refines sherlock.config.yml                                     [LLM refine]
investigate (config now present)
  → partition (uses refined tiers) → init → Investigation Plan        [unchanged]
```

---

## 8. Testing

| Area | Test |
|---|---|
| Static defaults | `config.test.js`: default tiers classify `src/auth/x.ts`→S, `src/api/y.ts`→A, `src/util/z.ts`→B. |
| Taxonomy scan | `config-gen.test.js`: `tailoredTiers` emits `**/auth/**` when `auth` present, omits keywords absent from the segment set; `B` always `["**"]`; output sorted/deterministic. |
| Write-once | `config-gen.test.js`: `writeStarterConfig` writes when absent (`written:true`); a second call returns `written:false` and leaves the file byte-identical; the emitted YAML `yaml.load`s and passes `validateConfig` after `loadConfig` merge. |
| Bootstrap gate | `investigate.test.js`: a **config-less** repo → `investigate` writes `sherlock.config.yml`, returns 0, the plan names the drafted file + refine instruction, and it **does not** create `.sherlock/units.json` or the report dir (early return). |
| No regression | `investigate.test.js`: a repo **with** a config still partitions + inits + prints the normal plan (existing tests, unchanged). |

---

## 9. Touch-points

| File | Change |
|---|---|
| `src/config-gen.js` (new) | `TIER_KEYWORDS`, `keywordGlobs`, `tailoredTiers`, `renderConfigYaml`, `writeStarterConfig`. |
| `src/config.js` | `defaultTiersConfig` uses `keywordGlobs('S'|'A')`; add `configFileExists(cwd)`. |
| `src/commands/investigate.js` | Bootstrap gate + early return before the reuse-first prep; new plan section for the drafted-config case. |
| `SKILL.md` | First-run refine-loop branch in the Procedure. |
| `README.md` | Note the zero-config tiers + the generated `sherlock.config.yml` (drafted, then refined). |
| Tests | `config.test.js` (defaults), new `config-gen.test.js`, `investigate.test.js` (bootstrap gate + no-regression). |

---

## 10. Invariants preserved

- The Node CLI stays deterministic — it drafts a config from a tree scan; it never calls an
  LLM. Refinement is an explicit SKILL.md step.
- Bootstrap never overwrites an existing config; it fires at most once per repo.
- `coverage`, partition grouping, tier assignment (`assignTier`), and the report format are
  unchanged.
- Returning repos (config present) behave exactly as today.
```
