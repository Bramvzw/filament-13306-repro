# Reproduction for filamentphp/filament#13306

Reproduction environment for the `FileUpload` parallel-upload race described in
[filamentphp/filament#13306](https://github.com/filamentphp/filament/issues/13306),
used to produce the before/after recordings on
[filamentphp/filament#20121](https://github.com/filamentphp/filament/pull/20121).

## What this demonstrates

Two things, separately:

1. **The race window (fully organic).** With the default `maxParallelUploads: 2`, `shouldUpdateState`
   flips back to `true` as soon as the *first* file finishes uploading, while the other file is still
   in flight. In this setup that window is ~9 seconds long. This part involves no scripting at all —
   it is observable by watching the Alpine component's state while two files upload.
2. **The wipe (fully organic user action).** While that window is open, remove the *completed* file
   with its ✕ ("tap to undo") button. The removal deletes the file's temporary `livewire-file:` value
   from the state, so the resulting state update passes the guard in the `$watch('state')` handler,
   which then rebuilds the FilePond list from server-confirmed uploads only — wiping the file that is
   still uploading. No scripting involved: upload two files, remove the finished one while the other
   is still busy, and the busy one disappears with it. With the fix applied, the same action removes
   only the file you clicked; the in-flight upload survives and completes.

## Requirements

- PHP 8.4, Composer
- **A multi-worker web server (php-fpm), e.g. Laravel Herd or Valet.**
  Do **not** use `php artisan serve`: it is single-threaded, so the two "parallel" uploads are
  serialized server-side and the race window never opens. This is likely why this issue has been
  hard to reproduce.

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed
./make-testfiles.sh
herd link filament-13306-repro   # or valet link
```

Login: `demo@example.com` / `password`

The app contains:

- A `Document` resource with an `AttachmentsRelationManager` (`->poll('3s')`) whose create-modal has
  `FileUpload::make('files')->multiple()` — mirroring the setup reported in #13306.
- `App\Http\Middleware\SlowDownLivewireUploads`: delays `livewire/upload-file` requests
  (>1MB → 12s, otherwise 3s) so the upload timing is deterministic instead of depending on a slow
  connection. The test files (1.5MB / 300KB) stay under PHP's default 2M `post_max_size`.

## Observing the race window (no scripting)

1. Go to `/admin/documents/1/edit`, click **New attachment**.
2. Select `testfiles/big-file.pdf` **and** `testfiles/small-file.pdf` together.
3. In the browser console, watch the component:

```js
const component = (() => {
    for (const el of document.querySelectorAll('[role="dialog"] [x-data]')) {
        for (const data of (el._x_dataStack ?? [])) {
            if ('shouldUpdateState' in data && data.pond) return data
        }
    }
})()

setInterval(() => console.log(
    'shouldUpdateState:', component.shouldUpdateState,
    '| files:', component.pond.getFiles().map((f) => `${f.filename}:${f.status}`).join(', '),
), 1000)
```

Unpatched, you will see `shouldUpdateState: true` from the moment `small-file.pdf` reaches status `5`
(complete) while `big-file.pdf` is still status `3` (processing) — for the remaining ~9 seconds of its
upload. With the PR applied, it stays `false` until both are done.

## Triggering the wipe during the window (organic)

While the window is open (small done, big still uploading), click the ✕ ("tap to undo") button on
the **completed** `small-file.pdf`. Unpatched: `big-file.pdf` disappears from the list mid-upload
along with it — the file is lost. Patched: only `small-file.pdf` is removed and `big-file.pdf`
completes normally.

Any other state update without `livewire-file:` values delivered during the window has the same
effect, which can also be shown deterministically from the console:

```js
component.state = { 'some-uuid': 'attachments/small-file.pdf' }
```

## Recordings

`record.js` is the Playwright script used to produce the before/after videos on the PR
(`npm install playwright`, then `node record.js before` / `node record.js after`). It swaps the
served `file-upload.js` bundle between the pristine packagist build and the PR build — adjust the
paths at the top of the script to your environment.

## Applying the fix

```bash
gh pr checkout 20121   # in a filament clone
```

or copy the patched `packages/forms/dist/components/file-upload.js` from the PR branch over
`public/js/filament/forms/components/file-upload.js` in this app.
