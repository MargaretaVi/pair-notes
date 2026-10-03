# Pair Notes

Pair Notes is a shared notes and checklist app. The frontend and `/api` are served from the same Cloudflare Worker origin, while shared spaces are stored in Cloudflare D1. Local browser storage keeps a cache; creating and syncing shared spaces requires an internet connection.

## Local development

```sh
npm install
npm run dev
```

To run the API locally with a local D1 database:

```sh
npm run db:migrate:local
npm run worker:dev
```

## Deploy to Cloudflare

You need a Cloudflare account and Wrangler access. The initial deployment uses the `workers.dev` address; no custom domain is required.

1. Authenticate Wrangler:

  ```sh
  npx wrangler login
  ```

2. Create the production D1 database:

  ```sh
  npx wrangler d1 create pair-notes --config wrangler.jsonc
  ```

3. Copy the database ID from Wrangler's output into the `database_id` field for the `DB` binding in `wrangler.jsonc`. This repository is configured for its provisioned production database; replace that ID if deploying into a different Cloudflare account.

4. Apply the schema to the remote database:

  ```sh
  npm run db:migrate:remote
  ```

5. Run checks and deploy the Worker with its built frontend assets:

  ```sh
  npm test
  npm run typecheck:worker
  npm run build
  npm run deploy
  ```

Wrangler prints the deployed `workers.dev` URL. Open it from a second device or a network other than the development network, create a shared space, and open its private link in another browser to verify that edits sync. Also check that reloading the app and rotating or deleting a link work.

## Subsequent deployments

After changing the database schema, apply pending migrations before deploying:

```sh
npm run db:migrate:remote
npm run deploy
```

For changes that do not add a migration, deploy with `npm run deploy`.

## Sharing and access

Anyone with a valid private link can access that space. The link's access token is kept in the URL fragment and sent to the API as a bearer token. Treat private links as credentials. A browser may show cached space data offline, but remote changes cannot sync until the device is online.

When creating a shared space, you can optionally choose a 3-32 character name using lowercase letters, numbers, and single hyphens. Names appear in the URL and must be unique. The name does not grant access; sharing still requires the complete private link.
