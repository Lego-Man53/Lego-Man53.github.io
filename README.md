# Yusuf's website

Personal portfolio at [yusufmm.com](https://yusufmm.com/), hosted with GitHub Pages. Plain HTML, CSS, and JavaScript; no build step.

## Pages

- `/`: photography, featured projects, and social profiles.
- `/photos/`: the full on-site photo journal, with a keyboard-accessible full-size viewer.
- `/admin/`: email/password login and photo management.
- `/flappycar/`: the Flappy Car — Night Drive game, synchronized from [Car-Sim-FlappyBird](https://github.com/Lego-Man53/Car-Sim-FlappyBird).

## Edit

- Homepage content and featured public repositories: `index.html`.
- Instagram and YouTube profile URLs: `socials.js`. Empty values are hidden, never linked to guessed accounts.
- Styling: `styles.css`.
- Photos: managed on `/admin/` after the one-time Supabase connection below. Originals belong to Yusuf; the starting photos are from his [Adobe Portfolio gallery](https://iyusuf515253.myportfolio.com/photos). See `assets/PHOTO-SOURCES.md`.
- Domain: `CNAME`; preserve this when updating.

Serve locally with `python3 -m http.server 8000`. Google Fonts has local system-font fallbacks. Existing photos and illustrations are served locally; new photo uploads live in Supabase. The Connect section embeds the official Buy Me a Coffee button for `legoman53`, with a direct support link as a fallback if the widget cannot load.

## One-time photo studio connection

1. Create a Supabase project. In its SQL editor, run `supabase/setup.sql`. This creates the gallery, its private photo bucket, and the access rules; it seeds the four existing photos only on first setup.
2. Under **Authentication → Users**, add your admin user with an email and a strong password. Do not add public signup to this site. Disable **Allow new users to sign up** in the project's authentication settings.
3. Copy that user's UUID and run this SQL, replacing the UUID with your actual user ID:

   ```sql
   insert into public.photo_admins (user_id)
   values ('YOUR-ADMIN-USER-UUID') on conflict do nothing;
   ```

   Admin membership can only be granted through a trusted database connection; signing up or editing browser data cannot grant access.
4. Under **Authentication → URL Configuration**, use `https://yusufmm.com` as the Site URL and allow `https://yusufmm.com/admin/` for password reset redirects. For local testing, also allow `http://localhost:8000/admin/`. Password reset emails require Supabase email delivery to be configured for your account.
5. Put the Project URL and **publishable** (or legacy `anon`) key into `photo-config.js`. These public values are intended for browsers. Never use a secret or `service_role` key. Publish the site files to GitHub Pages.
6. Open `https://yusufmm.com/admin/` and log in. Add photos, edit their title/accessibility description/caption, move them with the arrows, set their visibility and homepage placement, choose the cover photo, and adjust crop focus. Choose an editorial layout or clean grid, with two to four desktop columns. Click **Save changes** to publish; updates do not require a website rebuild.

Until connected, visitors see the starting gallery and `/admin/` clearly reports that setup is still needed. Once connected, a service error never falls back to photos that you have hidden or deleted. An empty gallery remains empty.

New uploads use a private bucket. Published images receive signed download links valid for one hour, so a link already issued before hiding a photo can remain valid for up to one hour. The original files in `assets/` were already public and remain directly accessible at their existing URLs even if removed from the journal. The studio hides them from the gallery; removing those original public files requires removing them from the repository.

Uploads accept JPEG, PNG, WebP and AVIF up to 15 MB each. Uploaded files are kept private until you save. Discarding edits or logging out removes unsaved uploads. Closing a tab with unsaved uploads may leave an unreferenced private file in the bucket; it is never listed publicly. Delete removes photo records when saved and then cleans up their uploaded files. Existing source assets are retained. Saves are transactional, and a revision check stops one admin session from overwriting newer changes from another.

The bundled browser library in `vendor/supabase.js` is `@supabase/supabase-js` 2.117.3 (MIT; see `vendor/SUPABASE-LICENSE`). Login sessions use session storage and end when the browser tab closes.

## Photo checks

Run `node tests/photos.test.mjs` for upload validation and ordering checks. `tests/permissions.test.mjs` runs the real schema in PostgreSQL via PGlite and tests visitors, non-admin users, admins, private file access, publish/hide/delete, failed-save rollback, repeatable setup, and revision conflicts. Install `@electric-sql/pglite` in a temporary test folder, then run with `PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite/dist/index.js node tests/permissions.test.mjs`. Test dependencies are not shipped to visitors.

To update the game, copy its `index.html`, `styles.css`, `game-core.js`, and `game.js` from the game repository into `flappycar/` together. Run the simulation tests in that repository before copying.
