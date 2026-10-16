# Accounts and sign-up codes

Anyone can create a **student** account without a sign-up code. Teacher and
school-admin accounts need one, so nobody can make themselves staff. Joining a
class always needs the class code and the teacher's approval.

| Who          | How they get their role                                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student      | Signs up with no sign-up code. To join a class they enter the teacher's **class code**; the teacher gets a notification and accepts or declines the request. Once accepted they also join the teacher's school (or they join a school with its student code). |
| Teacher      | Signs up with their school's **teacher code**, shown to the school admin on the Institution dashboard. They join that school as a teacher straight away.                                                                                                      |
| School admin | Signs up with a one-time **admin invite** from the programme operator, then creates their school on the Institution dashboard.                                                                                                                                |

Existing accounts keep their roles. A member can still ask for a different
role from their profile page, and their school's admin approves it under
Role Requests.

## Creating an admin invite (programme operator)

In the Supabase dashboard, open **SQL Editor** and run:

```sql
select public.create_admin_invite();      -- valid for 14 days
select public.create_admin_invite(30);    -- or choose the number of days
```

It returns an 8-character code. Send it to the new school's admin. Each code
works once; make a new one for each admin.

Only the SQL editor (or the service-role key) can create invites. Signed-in
users, including school admins, can't.

To see invites and who used them:

```sql
select code, created_at, expires_at, used_at,
       (select email from auth.users where id = used_by) as used_by
from app_private.admin_invites
order by created_at desc;
```

## Codes on the Institution dashboard

- **Student code**: students and existing teachers enter it on their profile
  page to join the school.
- **Teacher code**: new teachers enter it when they sign up. Keep it to staff.

Either can be replaced with **New code**; the old one stops working at once and
people who already joined keep their access.

## Confirmation emails

Everyone who signs up themselves confirms their email first (bulk-imported
accounts are confirmed already). Two things in the Supabase dashboard make
this reliable:

### 1. Email templates (links that work on any device)

Supabase's default links only work in the browser the person signed up in,
so signing up on a school computer and opening the email on a phone fails.
Our templates send people to `/auth/confirm` with a one-time token instead.

1. **Authentication → URL Configuration:** set **Site URL** to the live
   address (for example `https://your-app.vercel.app`, no trailing slash),
   and add `https://your-app.vercel.app/**` under **Redirect URLs**.
2. **Authentication → Emails → Templates:** paste these in and save:
   - **Confirm signup:** `supabase/templates/confirmation.html`
     (subject "Confirm your ProjectNest account")
   - **Reset password:** `supabase/templates/recovery.html`
     (subject "Reset your ProjectNest password")
   - **Change email address:** `supabase/templates/email_change.html`
     (subject "Confirm your new email address")

Links already sent with the old template keep working in the browser they
were requested from.

### 2. An email sender (needed for real numbers of sign-ups)

Supabase's built-in sender is for testing: it sends only a few emails an
hour, so most people in a big sign-up day get nothing. Connect a free
sender instead:

1. Create a free account with an email service such as
   [Resend](https://resend.com) or [Brevo](https://www.brevo.com), and verify
   a domain you own (they show the DNS records to add).
2. Copy its SMTP details (host, port, username, password).
3. **Authentication → Emails → SMTP Settings:** turn on custom SMTP, paste
   them, and set the sender to something like
   `ProjectNest <no-reply@your-domain>`.
4. **Authentication → Rate Limits:** raise "emails sent per hour" to suit
   (for example 100).

People who don't get an email can send it again from the "Check your
email" page, from the sign-in form (when it says their email isn't
confirmed), or from an expired link's page.
