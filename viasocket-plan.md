# viaSocket plan (approved: "go ahead with Slack and Keka")

Skill followed: viasocket-integrations `2026-11-05.1` (installed copy in `.claude/skills/viasocket-integrations/`).
Backend is Node.js, so every call will go through the `viasocket-apps` npm package.

## What people will see

- **Settings → Integrations** gets a **Connect** button for Slack and for Keka. A workspace admin clicks it once; nobody else signs in to anything.
- After that:
  - each person gets their Monday plan, morning check-in, evening "add proof" and rating requests as **Slack DMs**, with buttons that open the right page in the app;
  - managers get a Friday digest by DM;
  - people, reporting lines and leave come from **Keka** every night.
- Serious problems ring a phone through **M91**. M91 is called directly with its own send link, not through viaSocket.

## Actions

Keys and versions are copied from each app's page (`https://viasocket.com/docs/<app>.md`) once that host is reachable. They are never typed from memory. Until then the rows name the action as the catalog lists it.

| app | action or trigger | key of `inputData` | who supplies it | when |
|---|---|---|---|---|
| slack | Get User Information (search by email) | email | the product (each person's work email) | once per person, after Connect; the Slack user id is stored on the person |
| slack | Send Direct Message | user | the product (stored Slack user id) | per run |
| slack | Send Direct Message | message content | the product (fixed templates + the person's own items) | per run |
| slack | Send Message (to a channel) | channel | the admin, from a list of their channels | once, after Connect (only for the optional team digest channel; no individual scores ever go there) |
| slack | Send Message | buttons (label → URL) | the product (links into the app: Rate Work, My Week) | per run |
| keka | Find Employees | fields to return | the product, limited to email + name + only the fields the admin ticked in Settings (reportsTo, groups, jobTitle, mobilePhone) | nightly, only when the company chose "Keka sync" |
| keka | List Employee Leave Requests | from / to dates | the product (this week and next) | nightly, only if "Leave days" is ticked |
| keka | Update Goal Progress *(optional, off by default)* | goal id, value | the admin picks the goal mapping once; the product sends the weekly score | weekly |
| keka | Give Praise To Employee *(optional, off by default)* | employee ids, feedback | the product (from peer coins) | per coin, only if the workspace turns it on |

**Who picks each action:** the product's code, every time. No AI chooses actions. Users never see a list of actions.

**Keka is optional.** Each company chooses its people source in Settings:
- invite links;
- CSV upload (export from Keka or any HR tool; nothing stays connected);
- Keka sync.

With Keka sync, only the ticked fields are requested.

**Never read from Keka:** salary, payroll, bank, tax, documents, attendance.

## Product events (for automations users build later)

These are emitted from the app's own server after each change, with the payload fields in the build prompt:

- Priority Stack Locked
- Work Item Delivered
- Rating Submitted
- Blocker Raised
- Serious Alert Raised
- Peer Coin Given
- Weekly Score Generated

They are wired up only after the Slack and Keka steps above have been tested.

## Status

Checked against the real viaSocket (this project's keys): the setup check answers; `slack` and `keka` exist; the actions
`Get_User_Information` (v9), `Send_Direct_Message` (v3) and `Find_Employees` (v36) exist under those keys at exactly those
versions; the app's token endpoint returns real service ids and action ids; a made-up connection id is refused.

**UNTESTED** (needs a person to sign in to Slack and Keka once, through the Connect button):
- every `runAction` on a real connection: Slack lookup, Slack DM, Keka Find_Employees (the answers' real shapes are read defensively and fail closed until a real run confirms them)
- Keka department: taken from the group whose `groupType` is 2, as in the only documented sample
- reconnecting after a disconnect

**Not built, on purpose:**
- Keka leave days: the action's `status` values (approved or not) are not documented, so nothing is guessed. Leave comes from CSV.
- Channel digest and Slack buttons: DMs only.
- Product events (Stack Locked, Work Item Delivered and so on) for user-built automations.
