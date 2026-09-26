# Purdue National Security & Defense Society: Task Planner

Task planning for the whole society: a Gantt chart, calendar, task table and board, a searchable archive
of finished work, an org-chart-aware permission model, and in-app email announcements. Built on
Next.js + Firebase (Firestore), email and password sign-in limited to `@purdue.edu` (accounts are created
through a one-time emailed link), deployed on Vercel.

## How people get in

1. **Create account**: enter your first and last name and your @purdue.edu email. We email a one-time link.
2. Open the link. It proves you own the inbox and signs you in, then asks you to **choose a password**.
3. From then on, use **Sign in** with your email and password. **Forgot password?** sends Firebase's reset email.
4. To change your name later, click your name in the top-right corner. (Titles are set by admins.)

A signed-in account that hasn't chosen a password yet can't reach anything else in the app, and Firestore
only accepts verified @purdue.edu accounts, so an address nobody has verified can't read or write data.

## How the organization maps to permissions

Teams form a tree of any depth, for example `Technical › Technical Team 3 › Perception`. Power comes from
where someone sits in that tree, plus a role set by an admin.

| | Admin | Director | Team / sub-team lead | Member |
|---|---|---|---|---|
| View all tasks and teams | yes | yes | yes | yes |
| Create and edit tasks | anywhere | in teams they lead | in teams they lead | no |
| Delete tasks | anywhere | in teams they lead | no | no |
| Update status and progress | yes | yes | yes | only tasks assigned to them |
| Create, rename, delete teams; appoint leads | anywhere | in teams they lead | no | no |
| Add and remove team members | anywhere | in teams they lead | in teams they lead | no |
| Change roles and titles | yes | no | no | no |
| Send email announcements | anyone | teams they lead | no | no |

- A **lead** is anyone listed as a lead of a team (Teams page). They manage that team *and every subteam below it*.
- A **director** is a person an admin gives the Director role (Admin page) and who leads a team. That adds
  the director-level powers above within their own teams.
- **Admins** have full control. Mark the President, VP, Administrative team, Chief Engineer, and anyone else on the Admin page.
- The Treasurer and Secretary are not admins by default. Make them lead of the Treasury / Operations teams
  (and Directors if you want them to manage those divisions).

## 1. Firebase setup

1. [Firebase console](https://console.firebase.google.com/) → your project → **Databases & Storage → Firestore → Create database** (Standard edition, production mode, a US location).
2. **Authentication → Sign-in method → Email/Password**: turn on **both** toggles. **Email/Password** is for signing in; **Email link (passwordless sign-in)** is how new accounts are verified.
3. **Authentication → Settings → Authorized domains**: keep `localhost` and add your production domain once you have it.
4. Copy `.env.local.example` to `.env.local` and fill in the `NEXT_PUBLIC_FIREBASE_*` values (Project settings → Your apps → Web).

## 2. Admin bootstrap and security rules

The first admin is created automatically the first time their email signs in. The email must be in **both** places:

- `NEXT_PUBLIC_ADMIN_EMAILS` in `.env.local` (and in Vercel), and
- `bootstrapAdmins()` at the top of `firestore.rules`.

(The rules check this so nobody can grant themselves admin by writing to Firestore directly.) Everyone else
starts as a member; promote people from the Admin page.

Deploy the rules and indexes (needs the [Firebase CLI](https://firebase.google.com/docs/cli)):

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes   # project comes from .firebaserc
```

The indexes take a few minutes to build. Until they finish, the Archive and "recently completed" queries fail.

## 3. First run

```bash
npm install
npm run dev
```

Open http://localhost:3000, choose **Create account**, enter your admin email, open the emailed link and choose a password. Then:

1. **Teams → Set up NSDS structure**: creates the Executive Board, Treasury (Grants, Audit, Sponsorship), Operations (the seven Secretary directorates) and Technical (with Technical Team 1–10 placeholders).
2. Rename the technical teams, and add subteams under each (open a team, then *Subteams → Add*).
3. Ask everyone to sign in once so they appear in the people lists.
4. **Admin**: set titles and roles (Admins, Directors). **Teams**: appoint leads and add members to each team.

## 4. Set up email (Announcements)

Announcements and "email the new assignee" run through a server route, `/api/send-email`. It needs two
things; everything else in the app works without them.

**A. A Firebase service account** (lets the server verify who is asking and look up recipients):
Firebase console → Project settings → **Service accounts → Generate new private key**. Put the whole JSON,
on a single line, in `FIREBASE_SERVICE_ACCOUNT`. Treat it like a password.

**B. An SMTP account to send from.** The simplest free option is a club Gmail address:
1. Turn on 2-Step Verification for that Google account.
2. Create an **App Password** (Google Account → Security → App passwords).
3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<the address>`, `SMTP_PASS=<the app password>`, `SMTP_FROM="Purdue NSDS <the address>"`.

Any SMTP provider works (Resend, SendGrid, Mailgun) if the society later gets a domain.
Limits built in: 150 recipients per send, 10 announcements per person per hour. Gmail itself caps at about
500 recipients a day. **Use "Send test to me" first**: messages from a Gmail address to purdue.edu can land in spam.

## 5. Deploy to Vercel

1. Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new).
2. Add every variable from `.env.local` under **Settings → Environment Variables** (including `FIREBASE_SERVICE_ACCOUNT` and the `SMTP_*` values). Set `NEXT_PUBLIC_APP_URL` to your live address.
3. Add the production domain to Firebase **Authentication → Settings → Authorized domains**.
4. Use Node 22 on Vercel (the default). Locally, Node 20.19+ or 22 is recommended.

## 6. Checking the security rules

The rules cannot be exercised without the Firebase emulator (which needs Java), so test them once against
the real project with 3–4 accounts (for example an admin, a director, a lead and a plain member):

- A member cannot create a task, but can change the status/progress of a task assigned to them, and nothing else on it.
- A lead can create and edit tasks in their team and subteams, but not delete them, and cannot touch a sibling team.
- A director can delete tasks and add subteams inside their team, but not elsewhere.
- Nobody but an admin can change roles, and a brand-new account cannot become an admin.
- The Firebase console's **Firestore → Rules → Rules Playground** lets you simulate any of these.

## Notes

- **Read cost.** Everyone's browser keeps one live query on open tasks (plus tasks completed in the last 14 days). Older completed tasks are only fetched by the Archive, page by page.
- **Deleting a team** is blocked while it still has subteams or any tasks (including completed ones).
- **Dates.** A task's due date lasts until the end of that day in the viewer's time zone.

## Project structure

```
src/
  app/            Pages: home, tasks, gantt, calendar, archive, teams, announcements, admin
  app/api/send-email/route.ts   Server route for email (verifies the caller, resolves recipients)
  components/     Shell, team tree, task modal, pickers, table/board, Gantt and calendar views
  lib/            Firestore access, permissions, team-tree helpers, audience + email rendering
  lib/server/     Server-only helpers (Firebase Admin, SMTP)
design/         Original full-size logo artwork (not served; the app uses the resized public/logo.png)
firestore.rules       Server-side enforcement of who can do what
firestore.indexes.json
```
