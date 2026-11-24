# Environment credentials guide

This guide explains how to obtain the five values in [`.env.example`](./.env.example). Use a separate test spreadsheet first.

## 1. Create a Google service account

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Go to **APIs & Services → Library**, search for **Google Sheets API**, and enable it.
3. Go to **IAM & Admin → Service Accounts** and select **Create service account**.
4. Give it a name such as `zoritto` and finish creation. You do not need to grant it a project-wide Owner or Editor role just to access a spreadsheet shared with it.
5. Open the service account, select **Keys → Add key → Create new key → JSON**, and download the file.

Keep the downloaded JSON outside this repository. It contains a private credential: do not commit it, upload it to your agent, or share it in chat. If key creation is disabled by an organization policy, ask your Google Cloud administrator; do not bypass the policy.

Open the JSON file locally and copy:

- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY`

Copy the entire private key, including its `BEGIN PRIVATE KEY` and `END PRIVATE KEY` lines. The JSON represents line breaks as `\n`.

## 2. Share a spreadsheet

1. Create or open a Google spreadsheet.
2. Click **Share** and add the service account's `client_email` as an **Editor**. Share only the spreadsheet you want zoritto to access.
3. Copy the spreadsheet ID from its URL:

   ```text
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```

   The portion marked `SPREADSHEET_ID` is `GOOGLE_SPREADSHEET_ID`.
4. Choose the worksheet tabs the agent may use. Set `GOOGLE_ALLOWED_TABS` to their exact names, separated by commas, for example `Contacts,Tasks`. Tab names containing commas are not supported.
5. Each permitted tab needs a header row with a unique `id` column. Existing non-empty rows need unique, non-empty IDs. See [mvp.md](./mvp.md#7-data-contract-and-spreadsheet-behavior) for the sheet requirements.

## 3. Generate an agent API key

Run this locally with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The output is `ZORITTO_API_KEY`. Store it securely: anyone with this key can read, create, and update records on your allowed tabs. The agent receives this key, **not** the Google private key.

## 4. Configure locally

Copy the template:

```bash
cp .env.example .env.local
```

Fill in `.env.local` with your own values:

```dotenv
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_CONTENT\n-----END PRIVATE KEY-----\n"
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_ALLOWED_TABS=Contacts,Tasks
ZORITTO_API_KEY=your_generated_key
```

The private-key example is a placeholder, not a valid key. Copy the complete `private_key` value from your JSON file, retaining its `\n` sequences inside the quotes. Never commit `.env.local` or the downloaded JSON.

## 5. Configure Vercel

1. In your Vercel project, open **Settings → Environment Variables**.
2. Add the same five names and values. For `GOOGLE_PRIVATE_KEY`, paste the complete key with real line breaks or `\n` sequences; do not include the `.env.local` surrounding quotes.
3. Select only the deployment environments that need these credentials. Avoid exposing production secrets to untrusted preview deployments.
4. Save and redeploy; variable changes do not update existing deployments.

The public `/api/v1/health` endpoint only checks that the app is running. To verify Google access, use an authenticated records request against the test tab as shown in [mvp.md](./mvp.md#api-usage). Keep credentials out of screenshots, logs, and support messages.

References: [Google service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create), [Google service account keys](https://docs.cloud.google.com/iam/docs/keys-create-delete), and [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).
