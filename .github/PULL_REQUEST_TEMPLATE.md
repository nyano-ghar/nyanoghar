<!-- Thanks for sending a pull request! A few things that make review faster:

1. First time here? Start with CONTRIBUTING.md in the repo root.
2. Keep the PR to one logical change. Two unrelated fixes are two PRs.
3. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before pushing — CI runs
   all three and will fail the build otherwise.
4. If the PR is not ready for review, open it as a draft.
-->

#### What type of PR is this?

<!-- Uncomment one. -->
<!-- /kind bug -->
<!-- /kind feature -->
<!-- /kind cleanup -->
<!-- /kind documentation -->
<!-- /kind dependency -->
<!-- /kind api-change -->
<!-- /kind failing-test -->

#### What this PR does / why we need it

#### Which issue(s) this PR fixes

<!--
Add "Fixes #123" to close the issue automatically when this merges.
Use "Refs #123" if it is related but does not close it.
-->

Fixes #

#### Which module does this touch?

<!-- Tick all that apply. -->

- [ ] identity (accounts, sessions, roles, verification)
- [ ] catalog (listings, species/breeds, media, search)
- [ ] adoption (applications, meetings, reviews)
- [ ] provider (clinics, shops, appointments)
- [ ] chat-svc (Go)
- [ ] shared packages (`packages/*`)
- [ ] infra / CI / docs

#### Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
      (`type(scope): description`)
- [ ] Database access stays in `<module>.service.ts` — routes only validate,
      delegate and serialize
- [ ] Schema changed? Ran `pnpm db:generate` and committed the migration
      (CI fails on drift)
- [ ] Added a Drizzle `many()`? Added the matching inverse `one()` in the same
      commit (a missing inverse is not a type error — it throws at query time)
- [ ] New env var? Added it to `.env.example` and the config schema
- [ ] Touched auth, media visibility, or a transition table? Explained the
      security reasoning below
- [ ] Docs updated in this PR — would someone acting on the current README,
      `AGENTS.md` or `CHANGELOG.md` now be wrong? (No change needed for an
      internal refactor)

#### Does this need a changelog entry?

<!--
Add a line under "Unreleased" in CHANGELOG.md for anything a user or an
operator would notice: new endpoints, changed responses, new required
configuration, security fixes. Write "NONE" if it is purely internal.
-->

```release-note

```

#### Additional notes for reviewers

<!--
Anything that makes review easier: a design decision you went back and forth
on, a tradeoff you made, or an area you would like a second opinion on.
-->
