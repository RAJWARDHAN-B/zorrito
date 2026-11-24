# zoritto MVP — Private Google Sheets API for One AI Agent

## 1. Purpose

zoritto is a small, private API that lets one AI agent read and edit the owner's Google Sheet without giving the agent access to the owner's Google account or Google credentials.

The app's server authenticates to Google Sheets with a dedicated service account. The agent authenticates to zoritto with a separate, secret API key. The server checks each request and performs only the allowed operation on the configured spreadsheet and worksheet tabs.

```text
AI agent
  │ Authorization: Bearer <zoritto API key>
  ▼
zoritto Next.js API
  │ Google service-account credentials (server only)
  ▼
Configured Google Spreadsheet
```

The agent must never receive the service-account key, a Google access token, or credentials for the owner's Google account.

## 2. MVP Scope

### Included

- One owner and one configured Google Spreadsheet.
- One service account with access only to that spreadsheet.
- One AI agent authenticated by a zoritto API key.
- A server-side allowlist of worksheet tabs.
- Read records, search records, add records, and update records by stable ID.
- A small, versioned JSON REST API.
- Input validation, safe error responses, and minimal redacted request logging.
- Local development and deployment as one Next.js application.

### Not included in the first version

- Multi-user accounts, teams, or tenant management.
- An API-key management dashboard or in-app key rotation.
- Supabase, another database, Redis, or a separate backend service.
- A general-purpose spreadsheet editor or complex spreadsheet grid.
- Multiple spreadsheets, arbitrary spreadsheet IDs, or arbitrary Google Drive access.
- Delete and bulk-edit API operations. Add them only when there is a clear need and an explicit safety design.
- Guaranteed global rate limiting or durable audit history.

The first version can be API-only. A dashboard is optional and should not be required for the agent to use the API.

## 3. Architecture and Dependencies

Use one Next.js project:

- **Next.js Route Handlers** for the REST API.
- **TypeScript** for application code.
- **Google Sheets API client** for server-side spreadsheet access.
- **Zod** for validating request bodies and configuration.
- **Vitest** (or the project's chosen test runner) for focused automated tests.

No separate Express server or database is required for this MVP. The single agent key, spreadsheet ID, tab allowlist, and service-account credentials can be supplied through server-side environment variables.

Suggested modules:

```text
app/api/v1/
  health/route.ts
  tabs/route.ts
  tabs/[tab]/records/route.ts
  tabs/[tab]/search/route.ts
  tabs/[tab]/records/[id]/route.ts

lib/
  auth/api-key.ts
  config.ts
  google-sheets/client.ts
  google-sheets/records.ts
  validation/
  errors.ts
```

Keep Google Sheets access and API-key verification in server-side modules. Do not put credentials in client components, browser bundles, or `NEXT_PUBLIC_` variables.

## 4. Google Sheets Setup

1. Create a Google Cloud project and enable the Google Sheets API.
2. Create a dedicated service account for zoritto.
3. Share only the intended spreadsheet with the service-account email. Grant Editor access only if the API needs to write.
4. Configure the spreadsheet ID on the server. Never accept a spreadsheet ID from an API request.
5. Add the required headers to row 1 of each allowed worksheet.
6. Reserve a unique `id` header for record identity. Existing sheets without IDs need a one-time migration to populate unique IDs before update-by-ID is enabled.

The API must check each requested tab against the configured allowlist before accessing it. A tab name supplied by an agent is untrusted input even when it appears in the URL.

## 5. Environment Configuration

Use server-side variables such as:

```dotenv
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SPREADSHEET_ID=
GOOGLE_ALLOWED_TABS=Contacts,Tasks
ZORITTO_API_KEY=
```

`GOOGLE_ALLOWED_TABS` is a comma-separated list of exact tab names. Parse and validate it at startup. Reject missing or malformed required settings rather than silently using defaults.

Generate `ZORITTO_API_KEY` from a cryptographically secure random source. Put it in the server's secret configuration and the agent's secret store. Do not commit it, return it from an endpoint, or log it. Compare presented keys safely, including handling different key lengths without leaking useful comparison timing.

The Google private key must remain server-side. When a hosting provider requires newline escaping, normalize the value in the server configuration layer.

Rotating the single agent key requires updating the server secret and the agent's secret, then redeploying or restarting the app. In-app key revocation is outside this MVP.

## 6. API Authentication and Authorization

- Require `Authorization: Bearer <ZORITTO_API_KEY>` on every data endpoint.
- Keep health checks minimal and return no credentials, spreadsheet IDs, or configuration details.
- Fail closed if the configured key is missing or invalid.
- Enforce tab allowlisting on the server for every tab-specific request.
- Initially permit read, create, and update operations. Do not expose delete or bulk-write endpoints.
- Apply conservative request-body and result-size limits.
- Use HTTPS for any deployed app and agent connection.
- Return generic authentication errors; do not reveal whether a key fragment or other secret was correct.

The API key is a credential to zoritto, not a Google credential. Treat it as sensitive because anyone holding it can perform the operations enabled by the API.

## 7. Data Contract and Spreadsheet Behavior

- The first row contains unique, non-empty column headers.
- Each data row must have a unique, non-empty value in the `id` column.
- New record IDs are generated server-side; clients cannot choose or change them.
- Updates identify a row by its `id`, not by its current row number.
- Updates may change only supplied, recognized fields. Unknown columns and attempts to modify `id` are rejected.
- Write only the cells that changed. Do not rewrite an entire worksheet when updating one record.
- Use Google Sheets' `RAW` input mode for agent-provided values so strings beginning with `=` are not interpreted as formulas.
- Return a clearly documented representation of cell values. In the MVP, formula cells may be returned as their calculated/displayed values; formula editing is not supported.
- Detect duplicate IDs and invalid headers and return an explicit error rather than updating an arbitrary row.

Google Sheets is not an indexed database. For the MVP, set a documented maximum number of rows and columns per tab and a maximum page size. List, search, and sort behavior should be described as operating on the bounded sheet data. If expected sheet sizes grow beyond those limits, reassess the storage and query design rather than silently loading unbounded ranges.

## 8. Initial API

All responses use JSON and a consistent success/error shape.

### `GET /api/v1/health`

Returns a minimal liveness response. It must not reveal secrets or internal configuration. Decide whether this endpoint is public or authenticated based on the hosting platform's health-check needs.

### `GET /api/v1/tabs`

Returns only the configured, permitted tab names.

### `GET /api/v1/tabs/{tab}/records?limit=50&offset=0`

Returns records for an allowed tab, including the header/field information and pagination metadata. Enforce a maximum `limit`.

### `GET /api/v1/tabs/{tab}/search?field=name&value=alex&match=contains`

Searches an allowed field in a bounded worksheet range. Support documented matching modes such as `exact` and case-insensitive `contains`. Validate `field`, `value`, and pagination inputs.

### `POST /api/v1/tabs/{tab}/records`

Adds a record. Accept only known fields, generate the `id` on the server, and append the row without treating user-supplied values as formulas.

### `PATCH /api/v1/tabs/{tab}/records/{id}`

Updates only the supplied fields on the row with the matching ID. Reject empty updates, unknown fields, and attempts to change the ID.

No endpoint accepts a spreadsheet ID or an arbitrary cell range from the agent.

Example success response:

```json
{
  "success": true,
  "data": {
    "id": "generated-record-id"
  }
}
```

Example error response:

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "This operation is not allowed"
  }
}
```

Use appropriate HTTP status codes for invalid input, missing records, authentication failures, and temporary Google API errors. Never return stack traces or raw provider errors to the agent.

## 9. Reliability and Safety

- Batch related Google Sheets reads and writes where practical.
- Handle quota and transient errors with bounded retries and exponential backoff; do not retry validation or permission errors.
- Set explicit request, response, and page-size limits.
- Avoid silent success responses when a Google Sheets operation fails.
- Log request ID, operation, tab, result, and timestamp as appropriate. Do not log API keys, private keys, access tokens, or cell contents.
- Explain the MVP's concurrency behavior. Simultaneous edits from the agent, zoritto, or Google Sheets users can conflict; do not claim strong locking unless it is implemented across all app instances and external editors.
- Keep a backup or recovery process for important sheets. Google Sheets remains the source of truth, so a valid write changes the owner's actual spreadsheet.

If durable audit history, shared rate limits, key revocation without redeploying, or stronger concurrency controls become requirements, add an appropriate persistent service at that point. They are not prerequisites for the first single-agent version.

## 10. Testing

Use mocked Google Sheets calls for automated tests. Cover at least:

- Missing and invalid API keys.
- Unknown or disallowed tabs.
- Invalid request bodies and oversized pages.
- Reading and searching records.
- Creating records with server-generated IDs.
- Updating only requested fields.
- Rejecting attempts to change IDs or unknown columns.
- Duplicate/missing IDs and missing headers.
- Google API failures, quota responses, and retry limits.
- Ensuring secrets and spreadsheet values are absent from logs and error responses.

Perform a manual integration test against a separate test spreadsheet before enabling writes against the real sheet.

## 11. Deployment

For local development, run the Next.js application on the developer's machine and configure secrets only in a local environment file excluded from version control.

For a remote AI agent, deploy the Next.js app to an HTTPS-reachable host and configure all secrets in that host's secret manager. The agent needs only the zoritto API URL and API key. Do not place the Google service-account key in the agent configuration.

Vercel is one possible host, not an architectural requirement. Check the host's current plan terms and usage limits before using it, especially if the project becomes commercial. Google Sheets API quotas and billing terms should also be checked before production use.

## 12. MVP Completion Criteria

The MVP is ready when:

1. The service account can access only the intended spreadsheet.
2. An unauthenticated or incorrectly authenticated agent cannot read or change sheet data.
3. The agent can list permitted tabs, read records, search, add a record, and update a record by ID.
4. Requests for an unlisted tab, unsupported operation, unknown field, or invalid ID fail safely.
5. Formula-like text sent by the agent is stored as text rather than executed as a formula.
6. Failures are reported explicitly and do not produce success-shaped responses.
7. Automated tests pass, and writes have been verified against a separate test spreadsheet.
8. No Google credentials or API keys appear in the repository, browser bundle, logs, or API responses.

## 13. Implementation and Setup

The initial implementation uses Node.js 20.9 or later and npm. It is an API-only Next.js application; the home page does not manage sheets or secrets. The health endpoint is public and reports process liveness only; it does not check the Google connection.

For step-by-step instructions to obtain the credentials, see [env-guide.md](./env-guide.md).

### Prepare a test spreadsheet

1. In Google Cloud, create or select a project and enable the Google Sheets API.
2. Create a dedicated service account and create a JSON key for it. Keep the downloaded file outside the repository and never share it with the agent. Its `client_email` and `private_key` values are the server credentials. Protect and rotate the key as you would a password.
3. Create a separate test spreadsheet. Share it with the service account's email as an Editor. The account should not be shared on unrelated spreadsheets.
4. Create an allowed tab, for example `Contacts`. Add a header row such as `id`, `name`, `note`. Each existing non-empty data row must have a unique, non-empty ID. Back up existing data and populate IDs before connecting a pre-existing worksheet; this app does not migrate IDs.
5. Copy the spreadsheet ID from its URL: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.

The sheet's grid must have at most **10,001 rows including the header** and **100 columns**. This limit applies to the configured grid size, including empty rows and columns. Reduce an oversized grid in Google Sheets after checking that no data will be lost. Google responses are also limited to 4 MiB, so a sheet with many large cell values may need a smaller grid. Up to 100 records are returned per page.

### Run locally

```bash
npm install
cp .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Put the generated key in `ZORITTO_API_KEY` and securely store another copy for the agent. Fill in the remaining values in `.env.local`:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: the service account's `client_email`.
- `GOOGLE_PRIVATE_KEY`: the service account's `private_key`. If entered on one line, keep the `\n` sequences; the app converts them to newlines.
- `GOOGLE_SPREADSHEET_ID`: the ID from the test spreadsheet URL.
- `GOOGLE_ALLOWED_TABS`: exact, comma-separated tab names. Names containing commas are not supported.
- `ZORITTO_API_KEY`: a randomly generated, URL-safe key of at least 32 characters.

Use the local `.env` syntax supported by Next.js: for a one-line private key, surround it with double quotes, e.g. `GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`. Do not commit the filled file or a service-account JSON key.

```bash
npm run dev
npm test
npm run typecheck
npm run build
```

### Deploy to Vercel

1. Import the Git repository into Vercel as a Next.js project.
2. Add the five environment variables above in Vercel's project settings for the intended environment. Paste the private key as the secret value, either with actual newlines or escaped `\n` sequences. Do not add shell-style surrounding quotes to the Vercel UI value.
3. Deploy or redeploy after updating secrets. Only configure production secrets for trusted deployment environments; avoid exposing them to untrusted preview deployments.
4. Confirm `https://YOUR-DEPLOYMENT/api/v1/health` returns `{"success":true,"data":{"status":"ok"}}`. This only verifies the app is running.
5. Give the agent the HTTPS base URL and its zoritto API key through its secure configuration. Never give it the service-account JSON or private key.
6. Exercise read, search, create, and update using the separate test spreadsheet before changing the spreadsheet ID to your real sheet.

### API usage

For an agent-facing endpoint reference, see [API.md](./API.md). After deployment, the same public, plain-text reference is available at `/docs`; it contains no credentials.

Every endpoint except health requires `Authorization: Bearer <ZORITTO_API_KEY>`. For local testing, load the agent key into `ZORITTO_API_KEY` in your shell without committing it; beware that shell history, terminal output, and process inspection can expose secrets. Encode tab names and record IDs as URL path segments.

```bash
curl -H "Authorization: Bearer $ZORITTO_API_KEY" \
  http://localhost:3000/api/v1/tabs

curl -H "Authorization: Bearer $ZORITTO_API_KEY" \
  "http://localhost:3000/api/v1/tabs/Contacts/records?limit=50&offset=0"

curl -G -H "Authorization: Bearer $ZORITTO_API_KEY" \
  --data-urlencode "field=name" --data-urlencode "value=alice" \
  --data-urlencode "match=contains" \
  http://localhost:3000/api/v1/tabs/Contacts/search

curl -X POST -H "Authorization: Bearer $ZORITTO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","note":"Example"}' \
  http://localhost:3000/api/v1/tabs/Contacts/records

curl -X PATCH -H "Authorization: Bearer $ZORITTO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"note":"Updated"}' \
  http://localhost:3000/api/v1/tabs/Contacts/records/RECORD_ID
```

Create and update accept a JSON object with scalar strings, finite numbers, booleans, or `null` (`null` clears a cell). A body is limited to 16 KiB, and string values to 5,000 characters. For create, omitted columns are empty. Responses return formatted Sheets values as strings, including calculated formula results; search matches those formatted values case-insensitively. `match` is `contains` by default or `exact`. Pagination defaults to `limit=50&offset=0`; `limit` is 1–100.

Writes use `RAW`, so `=...` supplied by the agent is stored as text. Updates reject cells that appear to contain formulas. Formula editing, record deletion, and arbitrary ranges are not supported.

**Concurrency:** the API resolves a record ID to a row and then writes cells in that row. Google Sheets does not provide an atomic compare-and-write through this implementation. Concurrent row insertions, deletions, or edits—including direct edits in Google Sheets—can cause lost updates or a write to the wrong row. Do not restructure or concurrently edit a sheet while the agent is writing; use a test sheet and backups. Read retries are bounded, but writes are not retried automatically: if a write times out, inspect the sheet before retrying because it may have succeeded.

No persistent audit log or distributed rate limiter is included. Vercel logs contain request method, a generated request ID, result, and error code—not request bodies or cell contents. The API key allows all implemented operations on all allowlisted tabs, so protect it as a write credential.
