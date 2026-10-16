# Platform admin dashboard

`/dashboard/platform` is for the programme operator: everything across all
schools. It replaces the SQL-editor jobs.

| Tab              | What it does                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview         | Totals, active people (7/30 days), the last 8 weeks, quiet schools (no activity for 14 days), and schools compared by submission rate and average grade                      |
| Schools          | Every school with its admins, contact, people, classes and last activity; open one for its departments and classes, or suspend/reactivate it                                 |
| Tutors           | Every tutor's delivery: sessions logged, attendance, marking time, work waiting review (and overdue), written feedback, missed deadlines, with flags for who needs attention |
| People           | Search anyone by name or email; change their role, move them to a school, send a password reset, disable or enable their account                                             |
| Rubric templates | Programme-wide marking guides: build one with the rubric builder and it is published to every tutor; withdraw or republish it; see how many assignments and schools use it   |
| Admin invites    | Create one-time school-admin codes (with a note), copy a ready-made invitation message, see who used each code, cancel unused ones                                           |
| Announcements    | Send a notification to school admins, teachers, students or everyone, at one school or all; history of what was sent                                                         |
| Health           | Database and file storage against the free plan's limits, the classes using the most storage, and the last daily backup                                                      |

Suspending a school stops its student and teacher codes; its members keep
their accounts and work. Announcements arrive as "general messages", so
people who turned those off in their notification settings don't get them.

## Becoming a platform admin

Platform admins can see every school, so the role can only be given in the
Supabase **SQL Editor**, never from the website:

```sql
update public.users
set role = 'system_admin', onboarding_completed = true
where email = 'you@example.com';
```

Use an account that already exists (sign up normally first). Then sign out and
back in, and you land on the platform dashboard.

To remove someone's platform access, set their role back:

```sql
update public.users set role = 'student' where email = 'someone@example.com';
```

## Programme viewers

Programme staff (for example NueLuks programme managers) can be given the
**programme viewer** role from **People → Manage → Role**. They sign in with
two-factor like platform admins and see `/dashboard/programme`: programme
totals, the last 8 weeks, and results and delivery per school (sessions,
attendance, marking time, overdue reviews, missed deadlines, tutors flagged).
They never see names, emails, the people search or any admin tools.

## Two-factor sign-in

The dashboard asks for a code from an authenticator app (Google
Authenticator, Microsoft Authenticator, Authy, 1Password). The first visit
shows a QR code to scan; after that, one 6-digit code per sign-in. The
database refuses platform actions from sessions that skipped this step.

This uses Supabase's TOTP multi-factor authentication, which is free and on
by default. If the dashboard says it can't start two-factor sign-in, check
**Authentication → Multi-factor** in Supabase.

Lost your phone? Remove the factor in Supabase (**Authentication → Users →**
your user → **Multi-factor**), then set it up again on your next visit.

## Activity log

Every change made from the dashboard (invites, suspensions, role changes,
moves, account disable/enable, password resets, announcements) is recorded
with who did it and when:

```sql
select a.created_at, u.email as by, a.action, a.target_type, a.target_id, a.details
from app_private.platform_audit a
left join public.users u on u.id = a.actor_id
order by a.created_at desc
limit 100;
```
