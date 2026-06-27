# Dream Stitch Backend Database

The backend now uses PostgreSQL through Prisma while keeping the existing Apollo GraphQL API.

## Required Environment Variables

Set these locally and on Render:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
GOOGLE_CLIENT_ID="your-google-oauth-web-client-id.apps.googleusercontent.com"
RESEND_API_KEY="re_xxxxxxxxx"
OTP_EMAIL_FROM="Dream Stitch <verify@your-domain.com>"
OTP_TTL_MINUTES="10"
```

Email verification uses Resend. In local development, if `RESEND_API_KEY` is not set, the backend prints the OTP in the terminal so registration can still be tested. For production, add a verified sending domain in Resend and set `OTP_EMAIL_FROM` to an address on that domain.

Google login needs the same Google OAuth Web Client ID on both sides:

- Backend: `GOOGLE_CLIENT_ID`
- Frontend: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Optional seed admin account:

```env
ADMIN_EMAIL="admin@dreamstitch.com"
ADMIN_PASSWORD="change-this-password"
```

## Local Setup

Create a Supabase PostgreSQL project, then create a local `.env` file from `.env.example`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@POOLER-HOST:6543/postgres?pgbouncer=true&connection_limit=1&schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@POOLER-HOST:5432/postgres?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
GOOGLE_CLIENT_ID="your-google-oauth-web-client-id.apps.googleusercontent.com"
RESEND_API_KEY="re_xxxxxxxxx"
OTP_EMAIL_FROM="Dream Stitch <verify@your-domain.com>"
```

Use Supabase's pooler connection strings:

```text
Project Settings -> Database -> Connection string
```

For Prisma:

- `DATABASE_URL` should use the transaction-mode pooler on port `6543` with `?pgbouncer=true&connection_limit=1&schema=public`.
- `DIRECT_URL` should use the session-mode pooler on port `5432` with `?schema=public`.

Then install dependencies and create the database tables:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm start
```

If you do not want to create migration files yet, use:

```bash
npm run prisma:push
npm run seed
```

## Render Setup

Use these settings for a backend-only repository:

```text
Root Directory: empty
Build Command: npm install && npm run prisma:generate && npm run prisma:push && npm run seed
Start Command: npm start
```

Use these settings if the backend is inside an `API` folder in a monorepo:

```text
Root Directory: API
Build Command: npm install && npm run prisma:generate && npm run prisma:push && npm run seed
Start Command: npm start
```

After you generate and commit real Prisma migrations, you can replace `npm run prisma:push` with `npm run prisma:deploy` for stricter production migration control.

## Main Dynamic Data

- Products: `Product`, `ProductImage`, `ProductVariant`
- Users: `User`, `Address`
- Cart: `Cart`, `CartItem`
- Orders: `Order`, `OrderItem`
- Reviews: `Review`
- Made to Order: `Fabric`, `FabricImage`, `MadeToOrderRequest`
- Currency: `Currency`
- Optional content: `Blog`, `Instagram`

The seed script reads the current static product array from `src/product/data.js` and inserts it into PostgreSQL.
