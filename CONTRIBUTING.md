# Contributing to Baylo

Thanks for your interest — contributions of any size are welcome, from typo fixes to features.

## Getting set up

```bash
git clone https://github.com/katzennjammer/baylo.git
cd baylo
npm install
cp .env.example .env     # fill in at least DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL
npx prisma migrate dev
npm run dev
```

You do **not** need every API key to contribute. Only `DATABASE_URL`, `AUTH_SECRET`, and
`NEXTAUTH_URL` are required to boot; the rest each gate one optional feature. See the
[environment variables table](README.md#environment-variables) for what you'd be turning off.

## Before you open a pull request

- **Run the checks.** `npm run build` should pass. `npm run lint` currently reports a number
  of pre-existing errors and warnings — don't feel obliged to fix them all, but please don't
  add new ones in the files you touch.
- **Never commit secrets.** `.env` is gitignored — keep it that way. If you add a new
  environment variable, add it to `.env.example` with a placeholder value and document it
  in the README table.
- **Database changes go through Prisma.** Edit `prisma/schema.prisma`, then run
  `npx prisma migrate dev --name describe-your-change` and commit the generated migration.
  Don't hand-edit migrations that are already committed.
- **Match the surrounding style.** No separate formatter config — follow the conventions of
  the file you're editing.

## Pull requests

Keep them focused: one concern per PR is much easier to review than a large mixed change.
In the description, say what changed and why, and mention anything a reviewer should test
by hand. If your change is visual, a screenshot helps a lot.

For anything large or architectural, open an issue first so we can agree on the approach
before you invest the time.

## Reporting bugs

Open an issue with what you expected, what actually happened, and the steps to reproduce.
Include your Node version and whether you're on MySQL or MariaDB — several past issues came
down to that difference.

## Security

Please **don't** open a public issue for a security vulnerability. Report it privately via
GitHub's [security advisories](https://github.com/katzennjammer/baylo/security/advisories/new).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE) that covers this project.
