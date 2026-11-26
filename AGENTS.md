# AGENTS.md

## Layout and verification
- No root package manifest, CI, or lint/test command; `README.md` documents the target architecture and `PLANO.md` tracks progress. `frontend/` is plain static HTML/CSS/JS with no build step; `infra/` is the only npm project (AWS CDK TypeScript). Run npm/CDK commands from `infra/`.
- `frontend/assets/js/app.js` is loaded from every page; page-specific behavior is selected by DOM ids and all `init*` functions run on `DOMContentLoaded`. Keep `index.html` asset paths (`assets/...`) and `pages/*.html` paths (`../assets/...`) consistent.

## Frontend/data contract
- `app.js` calls only root-relative `/api/...` endpoints: `GET /api/products`, `GET /api/products/:id`, `POST /api/orders`, `GET /api/orders/:id`. It never fetches `frontend/data/products.json`; the `products.json via fetch` note in `pages/como-fiz.html` is stale. Static-only hosting or `file://` will not populate the catalog.
- Cart is `localStorage['cube_keys_cart']`; checkout sends only product ids and expects the server to own prices/keys. Don't make client-side prices authoritative.
- Checkout is async: `POST /api/orders` returns `orderId`/`PENDING`; UI polls `GET /api/orders/{id}` every 2s, max 20 attempts.

## Infra/CDK
- `infra/bin/infra.ts` creates `InfraStack` from `infra/lib/infra-stack.ts`; `cdk.json` app runs `npx tsc && npx tsx bin/infra.ts`, so CDK commands already type-check (`tsconfig.json` has `noEmit`).
- `InfraStack` is still boilerplate with no resources; synth output contains only `CDKMetadata`. Don't assume the CloudFront/API Gateway/Lambda/S3 architecture described in frontend comments exists in CDK code.
- From `infra/`: `npm install`, `npm run build` (tsc), `npm test`, `npx cdk synth`, `npx cdk diff`. Focus one test: `npm test -- --runTestsByPath test/infra.test.ts`; current test is a placeholder with no assertions.
- The stack has no `env`, so account/region-dependent constructs/context lookups won't work until `env` is set in `bin/infra.ts`. `npx cdk deploy` changes a real AWS account; ask first.
- Follow `infra/AGENTS.md` for the CDK construct-doc workflow; its `find/grep/sed` examples assume Unix, so translate them for PowerShell here.

## Generated files
- `node_modules/`, `.env`, `infra/cdk.out/`, and generated `infra/**/*.js`/`*.d.ts` are ignored; `infra/jest.config.js` is the intentional JS exception. Don't hand-edit `cdk.out/`.
