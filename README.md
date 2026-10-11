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

Uploads accept JPEG, PNG, WebP and AVIF up to 30 MB each. Uploaded files are kept private until you save. Discarding edits or logging out removes unsaved uploads. Closing a tab with unsaved uploads may leave an unreferenced private file in the bucket; it is never listed publicly. Delete removes photo records when saved and then cleans up their uploaded files. Existing source assets are retained. Saves are transactional, and a revision check stops one admin session from overwriting newer changes from another.

The bundled browser library in `vendor/supabase.js` is `@supabase/supabase-js` 2.117.3 (MIT; see `vendor/SUPABASE-LICENSE`). Login sessions use session storage and end when the browser tab closes.

## AI photo assistant

Each photo in the studio has **Suggest with AI**. Add optional notes about the place, memory, or preferred voice, generate a draft, then choose **Use these suggestions** or **Keep my details**. Suggestions cover the title, accessibility description, caption, and display shape (portrait 4:5, landscape 3:2, square, or original). Using a suggestion only edits the local draft; **Save changes** still publishes it. New uploads can be analyzed before being published. AI does not change the original file, visibility, homepage selection, order, or crop position.

For mass uploads, choose **New uploads** and **Suggest for batch**. The studio selects this scope after an upload; **All photos without drafts** also handles existing photos. Completed suggestion drafts are skipped when continuing a batch. Requests run sequentially with a progress indicator and **Stop after this photo**; stopping or a request failure keeps completed drafts. There are no automatic retries. Review individually or select **Use all drafts**, then edit and save when ready. Batch requests use the same inexpensive model and existing 30/hour and 100/day limits; a batch pauses when a limit is reached. Generating drafts does not mark the gallery for publication or change any photo details until you apply them.

One-time setup after the gallery is connected:

1. Run `supabase/ai-setup.sql` in the project's SQL editor. Only photo admins can reserve requests. The database atomically limits attempts to 30 per hour and 100 per rolling 24 hours per admin; users cannot reset their counters. Failed provider attempts also count.
2. In **Edge Functions → Secrets**, save `OPENAI_API_KEY`. The key stays server-side and must never appear in `photo-config.js`, browser storage, or the repository. API usage is billed to that key's OpenAI project. Photo suggestions use the economical `gpt-6-luna`, which supports image input and structured outputs, with reasoning explicitly set to `none` and output capped at 1000 tokens. The function never falls back to a pricier model; an old `OPENAI_PHOTO_MODEL` secret is ignored.
3. Deploy the `photo-assist` function from `supabase/functions/photo-assist/`. The CLI uses `supabase/config.toml`; for the dashboard editor, paste `handler.js` followed by `Deno.serve(createHandler(Deno.env.toObject()));` into `index.ts`. Keep the gateway's legacy JWT verifier enabled for this project's current login tokens. The handler also validates each session with Supabase Auth and checks photo admin membership through the user's RLS-scoped connection; neither a publishable key nor an ordinary user account can use AI. No service-role credential is used. If using the CLI, run `supabase functions deploy photo-assist --project-ref YOUR-PROJECT-REF`. Projects using newer JWT signing keys may need to replace the legacy gateway verifier with the handler's explicit session validation, as described in the Supabase authentication docs.
4. Refresh `/admin/` and confirm **Ready when you are**. Try an existing photo and review the draft. Missing setup, an expired login, a provider failure, or a usage limit leaves all photo edits intact.

The browser sends a JPEG preview with its longest side at most 1280 pixels, re-encoded without file metadata, plus the notes you enter. The original uploaded image stays in Supabase. OpenAI Responses requests use `store: false`; this does not replace OpenAI's API data-retention rules. The function permits browser origins `https://yusufmm.com` and `https://www.yusufmm.com`; for local testing, explicitly add the local origin to the server-side `PHOTO_AI_ORIGINS` comma-separated secret. No photo is sent just by uploading or opening the studio. Connection checks do not use API credits.

See [OpenAI image input documentation](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [Supabase function authentication](https://supabase.com/docs/guides/functions/auth).

## Photo checks

Run `node tests/photos.test.mjs` for upload validation and ordering checks. `tests/permissions.test.mjs` runs the real schema in PostgreSQL via PGlite and tests visitors, non-admin users, admins, private file access, publish/hide/delete, failed-save rollback, repeatable setup, and revision conflicts. Install `@electric-sql/pglite` in a temporary test folder, then run with `PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite/dist/index.js node tests/permissions.test.mjs`. Test dependencies are not shipped to visitors.

Run `node tests/ai.test.mjs` for AI authorization, preview bounds, secret isolation, structured output and provider errors. Run `tests/ai-permissions.test.mjs` with the same `PGLITE_MODULE` to verify database usage permissions and hourly/daily limits. These checks use simulated provider responses and disposable data; they never call OpenAI or alter the live gallery.

Run `node tests/ai-batch.test.mjs` for sequential requests, progress, cancellation after the current request, and preservation of completed drafts on failure.

To update the game, copy its `index.html`, `styles.css`, `game-core.js`, and `game.js` from the game repository into `flappycar/` together. Run the simulation tests in that repository before copying.
