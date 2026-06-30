// workflow/sherlock.workflow.js
export const meta = {
  name: 'sherlock',
  description: 'Risk-tiered code investigation: lenses → adversarial verify → triaged report',
  phases: [
    { title: 'Partition', detail: 'CLI builds units.json + scaffolds report' },
    { title: 'Review', detail: 'one reviewer agent per (unit × applicable lens)' },
    { title: 'Verify', detail: 'adversarially refute each candidate finding' },
    { title: 'Synthesize', detail: 'dedupe, group, write report; reconcile coverage' },
  ],
}

// args: { scope?: string, lenses?: string, date?: string }
const CLI = '${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js'
const STYLE = '${CLAUDE_PLUGIN_ROOT}/skills/sherlock/persona/report-style.md'
const FINDING = { type: 'object', required: ['id','lens','severity','file','line','excerpt','rationale','recommendation'],
  properties: { id:{type:'string'}, lens:{type:'string'}, severity:{type:'string',enum:['CRITICAL','HIGH','MEDIUM','LOW']},
    file:{type:'string'}, line:{type:'integer'}, excerpt:{type:'string'}, rationale:{type:'string'}, rule:{type:'string'}, recommendation:{type:'string'} } }
const FINDINGS = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: FINDING } } }
const VERDICT = { type: 'object', required: ['verdict','reason'], properties: { verdict:{type:'string',enum:['confirmed','uncertain','refuted']}, reason:{type:'string'} } }

phase('Partition')
log('Sherlock: partitioning + scaffolding (deterministic CLI)')
// The orchestrator (you) runs these Bash steps before/within the workflow:
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js partition <scope>
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js scaffold --date <date>
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js rules        (resolve rule context)
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js lenses --select <lenses>
// units.json, the resolved lens set, and the rule context are passed via args.
const units = args?.units || []
const lenses = args?.lenses || []        // resolved Lens objects (name, verification_class, applies_to, severity_default)
const rules = args?.rules || { standard: [], projectGeneral: [], projectSpecific: [] }

function lensesForUnit(unit) {
  return lenses.filter(l => l.applies_to.tiers.includes(unit.tier))
}

const perUnit = await pipeline(
  units,
  // Stage 1 — REVIEW: fan out one reviewer per applicable lens, collect candidate findings
  (unit) => parallel(lensesForUnit(unit).map(lens => () =>
    agent(
      `You are the "${lens.name}" investigator (${lens.title}).\n` +
      `Perspective: ${lens.perspective}\n` +
      `Review ONLY these files of unit "${unit.id}" (tier ${unit.tier}): ${unit.files.join(', ')}.\n` +
      `Check against these rules (project-specific override general on conflict):\n` +
      `  standard: ${rules.standard.join(', ')}\n  project: ${[...rules.projectGeneral, ...rules.projectSpecific].join(', ')}\n` +
      `Emit candidate findings with file:line, a code excerpt, the violated rule, severity, and a concrete recommendation. ` +
      `Be precise; no finding without evidence.`,
      { label: `review:${unit.id}:${lens.name}`, phase: 'Review', schema: FINDINGS },
    ).then(r => (r?.findings || []).map(f => ({ ...f, unit: unit.id, verification_class: lens.verification_class })))
  )).then(groups => ({ unit, candidates: groups.filter(Boolean).flat() })),

  // Stage 2 — VERIFY: route each candidate by verification_class
  ({ unit, candidates }) => parallel(candidates.map(f => () => {
    if (f.verification_class === 'cleanup') {
      return agent(
        `Refute-by-default check of this ${f.lens} finding:\n${JSON.stringify(f)}\n` +
        `For dead-code: re-search the whole repo for references INCLUDING dynamic imports, string-keyed dispatch, ` +
        `reflection/registration, test-only and entrypoint usage. For comment/refactor: confirm the change is ` +
        `behavior-preserving and a real improvement. Verdict refuted unless clearly real.`,
        { label: `verify:${unit.id}:${f.id}`, phase: 'Verify', schema: VERDICT },
      ).then(v => ({ ...f, verdict: v }))
    }
    // security / correctness → 3-vote panel, distinct probes
    const probes = ['reproduce the concrete trigger path', 'establish a real reachable impact', 'confirm it violates the cited rule/spec']
    return parallel(probes.map(probe => () =>
      agent(`Try to REFUTE this ${f.lens} finding via: ${probe}.\n${JSON.stringify(f)}\nDefault to refuted if uncertain.`,
        { label: `verify:${unit.id}:${f.id}`, phase: 'Verify', schema: VERDICT })
    )).then(votes => {
      const real = votes.filter(Boolean).filter(v => v.verdict === 'confirmed').length
      const verdict = real >= 2 ? 'confirmed' : (real === 1 ? 'uncertain' : 'refuted')
      return { ...f, verdict: { verdict, reason: votes.filter(Boolean).map(v => v.reason).join(' | ') } }
    })
  })).then(verified => ({ unit, verified: verified.filter(Boolean) })),
)

// Phase 3 — SYNTHESIZE (barrier: needs all units to dedupe + group)
phase('Synthesize')
const all = perUnit.filter(Boolean).flatMap(u => u.verified)
const kept = all.filter(f => f.verdict.verdict !== 'refuted')
const refuted = all.filter(f => f.verdict.verdict === 'refuted')
const summary = await agent(
  `First read the Sherlock persona style guide at ${STYLE} and follow it.\n` +
  `Synthesize the final review report from these verified findings (JSON):\n${JSON.stringify(kept).slice(0, 200000)}\n` +
  `Write the INVESTIGATION.md summary in three sections: ` +
  `"🗂️ The Brief" (scope, units, LOC, lines of inquiry, counts); ` +
  `"🧾 Evidence ledger" — a table | severity | location | lead | verdict | with one row per kept finding, top CRITICAL/HIGH first; ` +
  `and "⚖️ The Verdict" (counts of must-fix / to-review / dismissed plus the headline lead). ` +
  `Use the canonical emoji legend (🔴🟠🟡🟢 severity; ✅🟡🚫 verdict). Keep it terse and technical.`,
  { label: 'synthesize', phase: 'Synthesize' },
)
log(`Sherlock: ${kept.length} findings kept, ${refuted.length} refuted`)
return { kept, refuted, summary, units: units.map(u => u.id) }
