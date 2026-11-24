# zoritto API reference

This reference describes the deployed single-spreadsheet API for an HTTP-capable AI agent.

**Base URL:** `https://zorito.vercel.app/api/v1`

`/api/v1` is a prefix, not an endpoint. Only the endpoints listed below are available.

## Authentication

Except for the health endpoint, send the separately provided zoritto API key in every request:

```http
Authorization: Bearer YOUR_ZORITTO_API_KEY
```

For create and update requests, also send `Content-Type: application/json`. Never put the key in a URL, response, log, or chat message. The agent does not need Google credentials.

This key permits reading and writing all configured tabs. A tab not in the server's allowlist is rejected. URL-encode tab names and record IDs used as path segments.

## Responses

Successful requests return HTTP `200` and a JSON object:

```json
{
  "success": true,
  "data": {}
}
```

Errors return a non-2xx status and a JSON object:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required."
  }
}
```

## Endpoints

### Check health

`GET /health`

No authentication is required. This only checks that the application is running; it does not verify Google Sheets access.

```json
{
  "success": true,
  "data": { "status": "ok" }
}
```

### List allowed tabs

`GET /tabs`

Returns the configured tab names. It does not check whether they actually exist in the spreadsheet.

```json
{
  "success": true,
  "data": { "tabs": ["Contacts", "Tasks"] }
}
```

### List records

`GET /tabs/{tab}/records?limit=50&offset=0`

| Parameter | Description |
| --- | --- |
| `tab` | Exact name of an allowed worksheet, URL-encoded as a path segment. |
| `limit` | Optional integer from 1 to 100; defaults to 50. |
| `offset` | Optional integer from 0 to 10,000; defaults to 0. |

Example response for a tab with headers `id`, `name`, and `note`:

```json
{
  "success": true,
  "data": {
    "headers": ["id", "name", "note"],
    "records": [
      { "id": "record-123", "name": "Alice", "note": "Example" }
    ],
    "pagination": { "limit": 50, "offset": 0, "total": 1 }
  }
}
```

Records are returned in sheet order. Values are Google Sheets' formatted values, so numbers, dates, and formula results generally appear as display strings. Empty cells appear as empty strings.

### Search records

`GET /tabs/{tab}/search?field=name&value=alice&match=contains`

| Parameter | Description |
| --- | --- |
| `field` | Required exact column-header name, 1–100 characters. |
| `value` | Required search text, 1–500 characters. |
| `match` | `contains` (default) or `exact`; matching is case-insensitive. |
| `limit`, `offset` | Optional pagination parameters with the same limits as listing records. |

The response has the same `headers`, `records`, and `pagination` shape as listing records. Search operates on formatted values, not formulas or unformatted cell values.

### Create a record

`POST /tabs/{tab}/records`

Send a non-empty JSON object whose keys match existing worksheet headers. The server generates `id`; do not include it in the request.

Example request body:

```json
{ "name": "Alice", "note": "Example" }
```

Example response:

```json
{
  "success": true,
  "data": { "id": "generated-record-id" }
}
```

The response contains the new ID, not the complete record. Omitted fields are left empty.

### Update a record

`PATCH /tabs/{tab}/records/{id}`

Use the stable `id` returned by listing, searching, or creating a record; it is not the sheet row number. Send a non-empty JSON object containing only the fields to change.

Example request body:

```json
{ "note": "Updated" }
```

Example response:

```json
{
  "success": true,
  "data": { "id": "record-123" }
}
```

Only the specified cells are written. Updating `id`, an unknown field, or a cell that appears to contain a formula is rejected.

## Data rules and limits

- Each allowed tab must have a header row with unique, non-empty column names, including `id`. Every non-empty data row must have a unique, non-empty ID.
- Request bodies accept strings, finite numbers, booleans, and `null`; `null` clears a cell. Nested objects and arrays are not supported. Strings are limited to 5,000 characters, and the complete request body to 16 KiB.
- Agent-supplied values use Google Sheets' `RAW` mode. A string beginning with `=` is stored as text, not executed as a formula.
- A worksheet's configured grid may have at most 10,001 rows including the header and 100 columns. A Google response is limited to 4 MiB.
- There is no delete endpoint, bulk-edit endpoint, arbitrary range access, sorting parameter, or API to select a different spreadsheet.

## Errors and safe operation

| Status | Example code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Invalid parameters, body, or field. |
| 401 | `UNAUTHORIZED` | Missing or invalid API key. |
| 403 | `PERMISSION_DENIED` | Tab is not allowed. |
| 404 | `TAB_NOT_FOUND`, `RECORD_NOT_FOUND` | Allowed tab or record does not exist. |
| 413 | `BODY_TOO_LARGE` | Request body exceeds 16 KiB. |
| 422 | `INVALID_SHEET`, `SHEET_TOO_LARGE`, `FORMULA_CELL` | Invalid worksheet structure, size limit, or attempted formula-cell update. |
| 500 | `CONFIGURATION_ERROR`, `INTERNAL_ERROR` | Server configuration or internal failure. |
| 502 | `SHEETS_ERROR` | Google Sheets could not be reached or rejected the request. |

**Writes are not atomic with respect to other editors.** Avoid writes while another user or process is editing or restructuring the worksheet: a concurrent row insertion or deletion could cause an update to target the wrong row.

**Do not blindly retry a failed or timed-out create or update.** A write may have succeeded even if its response was lost. Inspect the sheet or read back the record first; for an uncertain create, check for the intended record before trying again.
