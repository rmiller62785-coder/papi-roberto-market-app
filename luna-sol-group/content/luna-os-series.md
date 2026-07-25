# Luna OS™ methodology series

Five short pieces, one per phase of the method already named on the homepage (`/#method`) and
walked through on the PSA case study (`/work/psa#approach`). Written to stand alone as thought
leadership — useful to a reader who never becomes a client — not as recaps of client work.

Where a piece references a real engagement, it cites only facts already published elsewhere on
the site (PSA, HopSkipDrive, Maid of the Mist, or the Amazon retrospective). Where it illustrates
a pattern that isn't tied to a specific engagement, it's explicitly framed as a general pattern —
never as an anonymized "a client of mine once…" story, since that would be an unverifiable claim
dressed up as evidence, the exact thing the rest of this site is built to avoid.

Suggested format: LinkedIn "article" (not a short post) or a future `/insights` blog section.
~450–600 words each.

---

## Phase 01 — Establish operating truth

Every transformation engagement starts with the same quiet problem: the dashboard, the frontline,
and the P&L are describing three different realities, and nobody has noticed because nobody has
put them next to each other.

The dashboard says a process is 95% compliant. The frontline knows the 5% exception queue never
actually clears — it just ages. The P&L shows the cost of that aging as "shrink" or "rework,"
booked somewhere nobody connects back to the original process.

None of the three sources is lying. They're each measuring something real, from a different
vantage point, on a different timescale. The job of this phase isn't to pick which one is right —
it's to reconcile them into one fact base everyone can act on.

On the PSA engagement, this meant mapping the actual queue behavior — not the initially reported
backlog figure, but the underlying capacity limits, work accumulation, and production variability
that the reported number was obscuring. The publicly reported backlog was later revised upward by
several million cards once that reconciliation happened elsewhere in the industry's own reporting.

A pattern worth naming generally: **a measurement gap is often bigger than the problem it's
hiding.** A removed accountability metric, a generous exemption rule, or a classification change
can each look like a rounding error in isolation. Stacked together, they can create a reported
number that's 30–40% off from ground truth — and every downstream resourcing decision inherits
that error.

The output of this phase is never a recommendation. It's a fact base precise enough that the next
four phases don't have to keep re-litigating what's actually happening.

**Next**: Phase 02 — quantifying which part of that fact base is actually worth fixing.

---

## Phase 02 — Quantify the constraint

Once the fact base is solid, the temptation is to fix everything at once. That's usually a
mistake — most operating systems have five or six things wrong with them, and only one or two are
economically material enough to justify a redesign.

This phase translates each failure mode into the same currency: cost, capacity, service, and risk.
Not because finance is the only thing that matters, but because it's the only unit that lets you
compare a staffing gap against a routing inefficiency against a quality-control hole and say,
honestly, which one to fix first.

A generalized version of the test: for any candidate problem, ask what it costs *if left exactly
as it is for another quarter*. If the honest answer is "not much," it's not this quarter's
constraint, however uncomfortable it is to look at. If the answer is a number with real weight
behind it, that's where the redesign budget goes.

This is also where "sounds urgent" gets separated from "is the constraint." A surge in complaints
can be loud and still not be the binding constraint if the underlying capacity math shows the
system recovers on its own within the target window. Conversely, a quiet, un-complained-about gap
in aging-work handling can be the actual constraint precisely because nobody's watching it.

**Next**: Phase 03 — turning the identified constraint into a redesigned system, not a patch.

---

## Phase 03 — Redesign the operating architecture

A constraint, once quantified, almost never has a single-lever fix. It has a system behind it:
workflows, decision rights, incentives, and — increasingly — the technology that encodes all
three.

This is the phase most consulting engagements skip past on the way to a slide deck. It's also the
one that determines whether the fix survives past the engagement.

Three questions anchor it, generalized from how they show up across engagements:

- **Workflow** — does the sequence of work match how the constraint actually behaves, or was it
  designed for a version of the operation that no longer exists?
- **Decision rights** — when the constraint flares up, is it obvious who has the authority to act,
  or does it require an escalation chain that's slower than the problem?
- **Incentives** — are the people closest to the constraint measured on the thing that actually
  matters, or on a proxy metric that made sense before the redesign?

On the HopSkipDrive engagement, this looked like connecting dispatch, compliance, SOPs, risk,
and executive governance into one operating architecture spanning a 30+ metro footprint — not
because any single piece was broken, but because they'd been designed independently as the
company scaled, and scale had exposed the seams between them.

**Next**: Phase 04 — making the redesigned system something people can actually run under pressure.

---

## Phase 04 — Engineer the adoption mechanism

An operating model that only works when things are calm isn't a real fix — it's a demo. The test
of this phase is whether the new system holds up during a demand spike, a staffing gap, or a
leadership change, because those are exactly the conditions under which the *old* system failed.

Adoption engineering means building the specific mechanisms that make the new behavior the path
of least resistance, not just the documented one: office hours instead of a dense policy binder,
targeted coaching aimed at the specific gap rather than generic training, and — increasingly —
automation that removes a manual step rather than adding a checklist to an already-full one.

On a past peak-readiness engagement, this took the form of AI-assisted defect attribution paired
with targeted coaching across the lowest-performing segment of the field organization, rather than
broad-based retraining that would have spread limited coaching capacity too thin to move the
number that mattered.

The generalizable principle: **adoption fails when the new system requires more attention than
the old one did.** If the redesigned process needs a more disciplined operator than the one who's
actually staffing the role during a Tuesday-afternoon surge, it will quietly revert the first time
things get busy.

**Next**: Phase 05 — the cadence that keeps the fix from decaying once the engagement ends.

---

## Phase 05 — Install durable control

The most common failure mode in operations work isn't a bad diagnosis. It's a correct diagnosis
and a good fix that decays within two quarters because nobody installed the mechanism to notice
when it starts slipping.

Durable control is boring by design: a named metric, a named owner, a threshold that triggers
action before the problem is visible to a customer, and an escalation path that's actually used
rather than theoretical.

The reason this phase gets its own name, rather than being folded into "redesign," is that it has
to survive a leadership change. A control mechanism that only works because the person who
designed it is still in the room isn't control — it's institutional memory with a shelf life.

A generalized version of what a working control mechanism looks like: a weekly signal review, a
causal attribution step (is this the known constraint recurring, or something new?), a decision,
a field action, and a verification step that closes the loop back to the metric. Skip the
verification step and the cadence becomes a status meeting; skip the causal attribution step and
every recurrence gets treated as a surprise.

This is also the phase that turns a one-time engagement into something a client's own team can run
without an outside operator in the room — which, for an advisory practice, is the actual goal.

**End of series.** Full case-study application: PSA (`/work/psa`), HopSkipDrive
(`/work/hopskipdrive`), Maid of the Mist (`/work/maid-of-the-mist`).
