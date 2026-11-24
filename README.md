# zoritto — Complete Product & Engineering Specification

## 1. Project Overview

Build a production-ready web application named **zoritto**.

**Tagline:** A little fox for your data.

zoritto is a lightweight spreadsheet management platform built around Google Sheets.

It combines three core capabilities:

- A spreadsheet-like web application where users can view, edit, search, and manage their Google Sheets data.
- A data management dashboard with connections, analytics, permissions, and activity logs.
- A secure REST API that allows third-party AI assistants, including Instinct AI, to interact with Google Sheets using individual API credentials.

Google Sheets will remain the primary data storage system. zoritto will provide an application and controlled API layer on top of it.

The application must be modular, secure, responsive, and designed for future expansion.

## 2. Technology Stack

Use the following stack.

### Frontend

- Next.js with App Router.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Lucide icons.
- TanStack Table or an appropriate spreadsheet grid implementation.
- React Hook Form.
- Zod for validation.

### Backend

- Next.js Route Handlers.
- Server-side Google Sheets API integration.
- Google service account authentication.
- Separate service modules for spreadsheet operations, authentication, authorization, and logging.

Do not introduce a separate Express.js or Node.js server. Next.js already provides the required backend capabilities.

### Database

Use Supabase PostgreSQL for:

- User accounts.
- API key metadata and hashes.
- Client permissions.
- Audit logs.
- Application configuration.
- Future multi-user support.

Do not store actual spreadsheet records in Supabase. Google Sheets remains the source of truth.

### Authentication

- Supabase Auth for dashboard users.
- Custom API-key authentication for external integrations.
- Role-based authorization.
- Secure server-side session management.

### Hosting

- Vercel for the Next.js application and API.
- Supabase for PostgreSQL.
- Google Cloud for the service account and Google Sheets API.

The application should be deployable using free-tier services wherever possible. Avoid introducing paid dependencies unless necessary.

## 3. Application Architecture

Build a modular architecture:

```text
Browser / Dashboard
└── Next.js Application
    ├── Dashboard authentication
    ├── Spreadsheet interface
    ├── REST API
    ├── API key authentication
    ├── Permission management
    ├── Google Sheets service
    └── Audit logging
        └── Google Sheets API
            └── Dedicated Google Service Account
                └── Configured Google Spreadsheet
```

External AI clients must be able to communicate directly with the REST API without going through the frontend.

The frontend and external API clients must use the same underlying spreadsheet service and authorization layer.

## 4. Spreadsheet Connection

Initially support one Google Spreadsheet containing multiple tabs.

The administrator must be able to configure:

- Spreadsheet ID.
- Spreadsheet display name.
- Google service account connection.
- Allowed worksheet tabs.
- Default worksheet tab.

The Google service account must have access only to the intended spreadsheet.

Use the Google Sheets API with the narrowest appropriate OAuth scope.

Store service account credentials in server-side environment variables.

Never expose service account credentials, private keys, or access tokens to the browser.

The spreadsheet ID must be controlled by server-side configuration, not supplied arbitrarily by external API clients.

## 5. Main Application Modules

### 5.1 Dashboard

Create a clean dashboard displaying:

- Connected spreadsheet.
- Number of available tabs.
- Number of records, where practical.
- Recent spreadsheet activity.
- Total API requests.
- API health status.
- Recent successful and unsuccessful operations.

Include useful summary cards and recent activity.

Do not display invented statistics. Fetch actual values from the backend.

### 5.2 Spreadsheet Workspace

This is the primary feature of zoritto.

Create a spreadsheet-like interface with:

- Editable grid.
- Column headers.
- Row numbers.
- Multiple worksheet tabs.
- Add row.
- Delete row.
- Edit cells.
- Search.
- Filtering.
- Sorting.
- Pagination or virtual scrolling.
- Copy and paste.
- Refresh.
- Column resizing.
- Loading indicators.
- Empty states.
- Error states.

Users must be able to switch between Google Sheets tabs.

All changes must be persisted to the original Google Spreadsheet.

Implement a clear saving lifecycle:

- Unsaved changes.
- Saving.
- Saved.
- Save failed.

Avoid silently losing edits.

Use optimistic updates carefully and restore previous values if an update fails.

Do not allow simultaneous operations to silently overwrite one another. Use suitable concurrency controls and, where possible, detect stale data before applying updates.

### 5.3 API Management

Create an API management section.

Administrators should be able to:

- Generate API keys.
- Name API clients.
- View client permissions.
- Revoke API keys.
- View last-used time.
- View API usage.
- Assign allowed tabs.
- Assign individual operation permissions.

When generating a key:

- Generate a cryptographically secure random secret.
- Display the complete key only once.
- Store only its secure cryptographic hash.
- Associate it with a client.
- Allow immediate revocation.

Never store plaintext API keys in the database.

Support multiple independent clients, for example:

- Instinct AI.
- Internal application.
- Another chatbot.
- External automation.

Each client must have independent permissions.

### 5.4 Permissions

Support the following granular permissions:

- `read`
- `list_tabs`
- `create`
- `update`
- `delete`

Each client should also have a list of permitted worksheet tabs.

Examples:

**Instinct AI:**

- Read: enabled.
- List tabs: enabled.
- Create: enabled.
- Update: enabled.
- Delete: disabled.

**Admin:**

- All permissions enabled.

**Read-only client:**

- Read: enabled.
- All write permissions disabled.

All permission checks must happen on the server.

Never rely on hiding frontend buttons as an authorization mechanism.

### 5.5 Activity Logs

Record every important operation.

Log:

- Client identifier.
- Authenticated user, where applicable.
- Operation.
- Worksheet tab.
- Record ID.
- Timestamp.
- Success or failure.
- Relevant before-and-after change metadata, where appropriate.

Do not log:

- API keys.
- Google private keys.
- Access tokens.
- Unnecessary sensitive spreadsheet contents.

Create an activity history interface with filters by client, action, date, and result.

### 5.6 Settings

Create settings for:

- Google Sheets connection.
- Spreadsheet ID.
- Worksheet configuration.
- API security.
- User accounts.
- Client management.
- Audit logging.

Provide a connection test that verifies whether the service account can access the configured spreadsheet.

## 6. REST API Specification

Create a versioned REST API under `/api/v1`.

All external API endpoints must require authentication.

Use the `Authorization` header:

```http
Authorization: Bearer YOUR_API_KEY
```

Never require external clients to put secrets in URL query parameters.

### Health

`GET /api/v1/health`

Returns API health and service availability without revealing secrets or internal configuration.

### List tabs

`GET /api/v1/tabs`

Returns only tabs permitted for the authenticated client.

### Get records

`GET /api/v1/tabs/{tab}/records`

Query parameters:

- `limit`
- `offset`
- `sort`
- `order`

Support pagination and return:

- Records.
- Total count.
- Pagination information.
- Column headers.

### Search

`GET /api/v1/tabs/{tab}/search`

Parameters:

- `field`
- `value`
- `limit`
- `offset`

Support exact and partial matching, with clearly documented semantics.

### Add record

`POST /api/v1/tabs/{tab}/records`

Accept a JSON object containing the record data.

- Validate all column names and data types.
- Generate a unique record ID server-side.

### Update record

`PATCH /api/v1/tabs/{tab}/records/{id}`

- Update only supplied fields.
- Never allow the client to modify the record's unique ID.

### Delete record

`DELETE /api/v1/tabs/{tab}/records/{id}`

- Require delete permission.
- Require an explicit confirmation field or equivalent confirmation mechanism.
- Return the deleted record identifier and operation status.

### API response format

Use consistent JSON responses.

Successful example:

```json
{
  "success": true,
  "data": {
    "id": "record-123",
    "message": "Record updated successfully"
  }
}
```

Error example:

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You do not have permission to perform this operation"
  }
}
```

Use appropriate HTTP status codes.

Document the entire API using OpenAPI/Swagger.

## 7. Spreadsheet Data Management

Every worksheet should have a header row.

Support a unique ID column for reliable record identification.

If a worksheet does not have an ID column, provide a safe setup or migration procedure rather than silently assuming that row numbers are permanent identifiers.

Support:

- Empty cells.
- Text.
- Numbers.
- Dates.
- Boolean values.
- Formula cells.

Preserve existing formulas where possible.

Do not accidentally replace formulas when editing unrelated cells.

Do not allow arbitrary formula execution through untrusted AI-generated input without explicit validation and policy.

Use batching for multiple cell operations where appropriate.

Handle Google API rate limits and transient errors using controlled retries with exponential backoff.

## 8. Security Requirements

Security is a core product requirement.

Implement:

- Service account credentials stored exclusively in server-side environment variables.
- Individual API keys for each external client.
- Cryptographic API-key hashing.
- Permission-based access control.
- Per-client rate limiting.
- Request validation with Zod.
- Strict tab allowlisting.
- Audit logging.
- Secure session handling.
- Protection against unauthorized spreadsheet access.
- No arbitrary spreadsheet IDs supplied by API clients.
- No credentials in frontend bundles or GitHub.
- No sensitive information in application logs.
- CORS configured deliberately for the dashboard, without treating CORS as authentication.
- Deletion and bulk modification safeguards.

Use secure HTTP headers.

Never return raw stack traces, private configuration, or internal credentials in API responses.

The service account must be shared only with the intended spreadsheet.

## 9. AI Integration

The API must be designed for AI assistants.

Instinct AI should be able to:

- Discover permitted tabs.
- Read records.
- Search records.
- Add records.
- Update records.
- Delete records only if permitted.

Provide comprehensive API documentation with:

- Endpoint descriptions.
- Required parameters.
- Authentication instructions.
- Request examples.
- Response examples.
- Error handling.
- Permission requirements.

Make the API compatible with standard HTTP tool integrations.

Do not assume a particular AI platform supports custom tools. API compatibility and actual platform integration are separate concerns.

## 10. User Interface and Branding

- **Brand name:** zoritto
- **Tagline:** A little fox for your data.

Create a polished, modern SaaS interface.

### Visual direction

- Warm ivory background.
- Soft stone surfaces.
- Fox orange accent.
- Forest charcoal text.
- Sage green success states.
- Minimalist fox mascot.
- Clean typography.
- Subtle borders and shadows.
- Generous spacing.
- Responsive layouts.

Avoid generic dashboard templates.

The product should feel approachable, refined, and professional.

Use consistent design tokens.

Build reusable components for:

- Sidebar.
- Top navigation.
- Tables.
- Buttons.
- Dialogs.
- Forms.
- Status indicators.
- Toast notifications.
- Empty states.
- Loading states.

Initially prioritize desktop usability while keeping mobile responsive.

## 11. Suggested Application Navigation

### Sidebar

- Overview.
- Spreadsheet.
- API Management.
- Activity Logs.
- Settings.

### Header

- Current workspace.
- Current spreadsheet.
- API/service status.
- User profile.

The spreadsheet section should provide easy navigation between worksheet tabs.

## 12. Database Schema

Use Supabase PostgreSQL.

Suggested tables:

### `users`

- `id`
- `email`
- `name`
- `role`
- `created_at`

### `api_clients`

- `id`
- `name`
- `description`
- `created_at`
- `revoked_at`
- `last_used_at`

### `api_keys`

- `id`
- `client_id`
- `key_hash`
- `key_prefix`
- `created_at`
- `expires_at`
- `revoked_at`
- `last_used_at`

### `client_permissions`

- `id`
- `client_id`
- `worksheet_name`
- `can_read`
- `can_create`
- `can_update`
- `can_delete`
- `can_list_tabs`

### `audit_logs`

- `id`
- `client_id`
- `user_id`
- `action`
- `worksheet_name`
- `record_id`
- `status`
- `timestamp`
- `metadata`

Add appropriate indexes, constraints, and database access policies.

Do not store plaintext credentials.

## 13. Development Structure

Organize the application into reusable modules.

Suggested structure:

```text
app/
├── dashboard/page.tsx
├── spreadsheet/page.tsx
├── api-management/page.tsx
├── activity/page.tsx
├── settings/page.tsx
└── api/v1/
    ├── health/
    ├── tabs/
    ├── search/
    └── records/

components/
├── layout/
├── dashboard/
├── spreadsheet/
├── api-management/
├── activity/
├── settings/
└── ui/

lib/
├── google-sheets/
├── auth/
├── permissions/
├── api-keys/
├── audit/
├── validation/
└── rate-limit/

types/
├── api.ts
├── spreadsheet.ts
└── auth.ts

supabase/
└── migrations/
```

Keep business logic out of React components and route handlers.

Use service modules that can be independently tested.

## 14. Environment Variables

Prepare an environment configuration template.

Include:

```dotenv
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SPREADSHEET_ID=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_APP_URL=
```

Never prefix private credentials with `NEXT_PUBLIC_`.

Ensure `.env` files and credential files are excluded from Git.

Provide a safe setup guide for generating and configuring Google service account credentials.

## 15. Deployment

Deploy the application on Vercel.

Use GitHub for source control.

Provide:

- Local setup instructions.
- Dependency installation instructions.
- Environment variable setup.
- Supabase database migrations.
- Google Cloud setup.
- Google Sheets API activation.
- Service account creation.
- Spreadsheet sharing instructions.
- Vercel deployment instructions.
- Production verification steps.

The application must work locally before deployment.

Do not hardcode production URLs or credentials.

## 16. Testing Requirements

Implement tests for:

- Authentication.
- Invalid API keys.
- Revoked API keys.
- Permission denial.
- Tab restrictions.
- Record creation.
- Record updates.
- Record deletion.
- Pagination.
- Search.
- Invalid data.
- Google API errors.
- Rate limiting.
- Audit logging.

Use mocked Google Sheets API calls for automated tests.

Also provide a manual integration test using a real test spreadsheet.

## 17. Development Phases

Build incrementally.

### Phase 1

- Project setup.
- Database setup.
- Google service account connection.
- Spreadsheet reading.
- Multiple-tab support.

### Phase 2

- Spreadsheet UI.
- Cell editing.
- Adding and deleting rows.
- Search and pagination.

### Phase 3

- REST API.
- API-key generation.
- Client permissions.
- External API access.

### Phase 4

- Activity logs.
- Dashboard analytics.
- Settings.
- Security hardening.

### Phase 5

- Testing.
- Documentation.
- Vercel deployment.
- Production verification.

Do not attempt to build every module simultaneously.

## 18. Critical Development Instructions

- Build real, working functionality rather than static mockups.
- Do not use fake spreadsheet data in production.
- Do not simulate successful API responses.
- Do not expose service account credentials.
- Do not store spreadsheet records in Supabase as the primary data source.
- Do not use a separate Express server unless there is a clear technical reason.
- Do not introduce paid services unnecessarily.
- Handle errors explicitly.
- Use TypeScript types throughout.
- Validate all untrusted input.
- Keep API routes independent of the frontend.
- Document every endpoint.
- Make the application easy to maintain and extend.

Before beginning implementation, produce a concise architecture plan and database schema. Then build and test each development phase.

The final product should be a functioning spreadsheet management platform and a reusable, secure API that any compatible AI assistant can connect to.

**Product identity:** zoritto.

**Core philosophy:** Your spreadsheet stays yours. Your AI gets only the access you explicitly grant.
