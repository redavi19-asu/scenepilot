# Urban Director Studio — AI Studio setup

Director AI Studio is wired through the Cloudflare Worker. The mobile/web clients never receive the generator API key.

## 1. Generator account

Create one fal.ai account and add billing/credits there. One fal account is enough for the first release because Director is using fal as the gateway for both image and video models.

Current model routing:

- AI image / photoshoot templates: `fal-ai/flux-pro/kontext/max/multi`
- Premium 5-second image-to-video: `fal-ai/kling-video/v3/pro/image-to-video`
- Premium 8-second reference-to-video: `fal-ai/veo3.1/reference-to-video`

Do not put the fal key in Vite variables, Android resources, Capacitor config, GitHub source, or client-side JavaScript.

## 2. Only required generator secret

From the repository root, with Wrangler logged into the same Cloudflare account that hosts ScenePilot / Urban Director Studio:

```bash
npx wrangler secret put FAL_KEY
```

Paste the fal API key when Wrangler prompts for it.

The deployed Worker checks for `FAL_KEY`. Until it exists, AI Studio stays visible but reports `WAITING FOR FAL_KEY` and generation is blocked before any tokens are charged.

## 3. Monthly AI token allowance

`wrangler.jsonc` currently sets:

```json
"AI_MONTHLY_TOKENS": 2500
```

Active Pro / Ambassador / Beta accounts receive that allowance once per UTC calendar month. Owner/Admin accounts are unlimited for development and support testing. Failed provider generations automatically refund reserved tokens.

The first launch token costs are deliberately stored server-side so clients cannot lower their own generation price.

## 4. Google Play token products

The UI already exposes the intended product IDs and pack sizes. Create these as managed one-time in-app products in the existing Urban Director Studio app in Google Play Console before enabling purchases:

- `uds_tokens_600` — 600 tokens — suggested $9.99
- `uds_tokens_1500` — 1,500 tokens — suggested $19.99
- `uds_tokens_4000` — 4,000 tokens — suggested $39.99
- `uds_tokens_10000` — 10,000 tokens — suggested $79.99

These prices are launch placeholders and can be changed before store submission. The current AI Studio build shows the packs but intentionally does not credit a wallet from a client-only button. The next billing pass must verify the Google Play purchase server-side before adding purchased tokens.

## 5. Launch templates

The initial templates are original Director presets, not copied branded assets:

- Lobby Duo — 2 people, luxury hotel-lobby music-video energy
- Album Cover
- Studio Portrait
- Street Campaign
- Luxury Night
- Movie Poster
- Cinematic Motion — Kling premium video
- Premium Movie Scene — Veo 3.1 1080p video with audio

The Lobby Duo preset intentionally captures the easy viral two-person hotel-lobby concept without using artist names, copyrighted music, or another app's branded template assets.

## 6. Editor integration

When a generation finishes, `SEND TO EDITOR` securely proxies the generated file through Director's authenticated Worker route and injects it into the existing Director Edit media import flow. It lands on the editor timeline as regular editable media.

## 7. Security behavior

- The provider key exists only as a Cloudflare Worker secret.
- Generation templates and token costs are enforced on the server.
- Users must be signed in with active Director access.
- Uploaded reference images are compressed in the client before generation.
- Generator result files are proxied only to the owner of the matching AI job.
- Failed generations are refunded once.

## Release note

The generator feature itself needs one new external account: fal.ai. Cloudflare and Google Play are the existing Director infrastructure. Google Play token purchasing still requires creation of the four in-app product IDs above and a verified billing hookup before the Buy Tokens buttons should be made live for customers.
