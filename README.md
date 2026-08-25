# Baylo

A community swap marketplace — list your pre-loved items, browse what others are offering, and trade
directly instead of buying new. Built with Next.js 16, Prisma, and MySQL/MariaDB.

## Features

- **Listings & trading** — post items with photos, browse by category, send and negotiate trade offers
- **Mutual swap confirmation** — both parties confirm a completed trade via one-time codes
- **Realtime messaging** — direct messages with typing indicators, powered by Pusher Channels
- **Community feed** — posts, comments, likes, follows, and trader leaderboards
- **AI assists** — item identification, value estimation, and perceptual-hash duplicate detection
- **Wallet & top-ups** — in-app balance with PayMongo checkout (sandbox)
- **Eco impact tracking** — eco-tasks and per-user impact stats
- **Auth** — credentials + Google OAuth via NextAuth v5, with email password reset

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS v4 |
| Database | MySQL / MariaDB via Prisma 7 |
| Auth | NextAuth v5 (Auth.js) |
| Realtime | Pusher Channels |
| Media | Cloudinary + `sharp` |
| Payments | PayMongo (test mode) |
| AI | Anthropic API |
| State/data | Zustand, TanStack Query |

## Getting started

### Prerequisites

- Node.js 20+
- A MySQL or MariaDB instance

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# then open .env and fill in your own credentials

# 3. Set up the database
npx prisma migrate dev
npx prisma generate

# 4. Run the dev server
npm run dev
```

The app runs at http://localhost:3000.

### Environment variables

All required variables are documented in [`.env.example`](.env.example). At minimum you need
`DATABASE_URL`, `AUTH_SECRET`, and `NEXTAUTH_URL` to boot. The Cloudinary, Pusher, PayMongo,
Google OAuth, SMTP, and Anthropic keys enable their respective features.

> **Note:** `.env` is gitignored. Never commit real credentials — use `.env.example` as the
> template and keep your own values local.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Project structure

```
prisma/          Schema and migrations
scripts/         One-off maintenance scripts
src/app/         App Router pages and route handlers
  api/           REST endpoints (items, trades, offers, messages, wallet, ai, ...)
  auth/          Login, register, password reset
  dashboard/     Authenticated app shell
src/components/  Shared UI components
src/lib/         Server utilities (db, auth, integrations)
public/          Static assets
```

## License

Not currently licensed for redistribution.
