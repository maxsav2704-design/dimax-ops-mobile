## Summary

- what changed
- why it changed

## Scope

- repo: `mobile`
- offline, sync, screen, or native Android impact

## Checks

- [ ] `npm run quality-gate` passed
- [ ] `npm run doctor` passed
- [ ] offline queue and installer data isolation reviewed if relevant
- [ ] native Android and production API configuration reviewed if relevant

## Ops / Release Impact

- [ ] no SQLite schema change
- [ ] SQLite migration included and cold resync behavior reviewed
- [ ] no production env or signing change
- [ ] device QA evidence updated if runtime behavior changed
