# Validation flags — 2026-06-14

4 hubs need your eyes (medium/low confidence). 4 high-confidence verdicts were auto-applied to overrides.json.

| id | status | conf | disposition | dupOf | note | evidence |
|---|---|---|---|---|---|---|
| wild-adventure-school-africa-hub | uncertain | low | junk | — | Phantom/stale listing — no verifiable web presence. | no first-party presence found for a 'Wild Adventure School' Africa worldschool hub |
| siem-reap-bliss-hub-cambodia | uncertain | low | merge | bliss-hubs-siem-reap | Duplicate of bliss-hubs-siem-reap; no verified first-party page. | blissinvestor.com lists only Pai/Koh Lanta; no first-party Siem Reap page — duplicates existing bliss-hubs-siem-reap |
| wonder-intercultural-school | active | medium | fix | — | Operationally active (IG); site SSL broken — revive from inactive but verify. | instagram.com/wonderschool.cc — active to May 2025; site has broken SSL |
| eco-holistic-kids-club | uncertain | low | fix | — | FB page resolves but metadata blocked — needs manual location/recency check. | facebook.com/escueladelaluz resolves but login wall blocked country/recency |

## How to act
Review each row; to apply one, add its fix to `data/research/overrides.json` by hand, then rebuild (`cd data/research && ./make.sh --no-fetch && cd .. && npm run build:explorer`).
