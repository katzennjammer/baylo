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

Copy `.env.example` to `.env` and fill it in. Only three are needed to boot the app —
everything else switches on an optional feature, and the app runs without it.

**Required**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL/MariaDB connection string |
| `AUTH_SECRET` | NextAuth session encryption — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | App base URL, e.g. `http://localhost:3000` |

**Optional — each enables one feature**

| Variables | Enables | Without it |
| --- | --- | --- |
| `CLOUDINARY_*` | Image and audio uploads | Listings can't take photos |
| `PUSHER_*`, `NEXT_PUBLIC_PUSHER_*` | Realtime chat and typing indicators | Messages need a refresh to appear |
| `GOOGLE_CLIENT_ID` / `_SECRET` | "Sign in with Google" | Email + password sign-in still works |
| `EMAIL_SMTP_*`, `EMAIL_FROM` | Password-reset emails | Reset links can't be delivered |
| `PAYMONGO_*` | Wallet top-ups via PayMongo | Wallet works, top-up checkout doesn't |
| `ANTHROPIC_API_KEY` | AI item ID, valuation, duplicate detection | Post items manually |
| `PHASH_THRESHOLD`, `DUPLICATE_ACTION` | Tunes duplicate-listing strictness | Sensible defaults apply |

> **Note:** `.env` is gitignored. Never commit real credentials — use `.env.example` as the
> template and keep your own values local. Use PayMongo **test** keys only.

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

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to get set up
and what to expect from a pull request.

## License

[MIT](LICENSE) © katzennjammer

You're free to use, modify, and distribute this project, including commercially.
Just keep the copyright notice.
