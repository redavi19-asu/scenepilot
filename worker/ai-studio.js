const NATIVE_APP_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost"
]);

const IMAGE_MODEL = "fal-ai/flux-pro/kontext/max/multi";
const KLING_MODEL = "fal-ai/kling-video/v3/pro/image-to-video";
const VEO_MODEL = "fal-ai/veo3.1/reference-to-video";

const AI_TEMPLATES = [
  {
    id: "lobby-duo",
    title: "Lobby Duo",
    subtitle: "Luxury rap-duo editorial",
    category: "trending",
    kind: "image",
    model: IMAGE_MODEL,
    tokens: 60,
    minImages: 2,
    maxImages: 2,
    aspectRatio: "16:9",
    badge: "TRENDING",
    prompt:
      "Create a premium cinematic music-video still featuring the two uploaded people together in a grand luxury hotel lobby. Preserve each person's recognizable face, skin tone, hairstyle, and identity. Give them confident natural poses, upscale modern streetwear, polished marble floors, warm practical lights, subtle reflections, rich depth, crisp editorial photography, wide cinematic composition, realistic hands, realistic anatomy, no logos, no celebrity likeness substitutions, no text."
  },
  {
    id: "parents-store",
    title: "Turning Into Your Parents: The Store",
    subtitle: "Original awkward-shopping comedy commercial",
    category: "video",
    featured: true,
    kind: "video",
    model: VEO_MODEL,
    tokens: 500,
    minImages: 1,
    maxImages: 3,
    duration: "8s",
    badge: "COMEDY",
    prompt:
      "Create an original eight-second lighthearted fictional commercial in a brightly lit neighborhood store using the uploaded adult actor as the central character. A younger adult starts offering unsolicited advice to a stranger about grocery prices, reusable bags, and coupons as if they have become an overly practical parent. A calm original friend gently interrupts with a funny dry reaction. Build a clear setup, humorous awkward beat, and memorable reaction shot, natural conversational English dialogue with synchronized mouth movement, cinematic multi-shot commercial coverage, crisp production sound, lifelike people. Invent all characters and lines. No existing advertising characters, brand names, insurance mascots, known catchphrases, recognizable celebrities, logos, or copyrighted music."
  },
  {
    id: "parents-neighbor",
    title: "Turning Into Your Parents: The Neighbor",
    subtitle: "Original overfriendly-neighbor comedy commercial",
    category: "video",
    featured: true,
    kind: "video",
    model: VEO_MODEL,
    tokens: 500,
    minImages: 1,
    maxImages: 3,
    duration: "8s",
    badge: "COMEDY",
    prompt:
      "Create an original eight-second observational comedy commercial with the uploaded adult actor in the driveway of a contemporary suburban home. A well-meaning young homeowner enthusiastically starts lecturing a passing neighbor about lawn care, neighborhood parking, and the weather, speaking with a comically parent-like confidence. An original sidekick gently tries to steer them away, ending with a quick deadpan reaction. New original dialogue, characters and visual staging, professional grounded ensemble acting, crisp natural lighting, alternating medium and close-up reaction shots, synced natural dialogue and sound. Do not reference or reproduce any real insurance ad, commercial slogan, mascot, celebrity, brand logo, or copyrighted music."
  },
  {
    id: "lobby-music-video",
    title: "Hotel Lobby — Orange Studio",
    subtitle: "Orange set • two performers • one hanging mic",
    category: "video",
    featured: true,
    kind: "video",
    model: VEO_MODEL,
    tokens: 500,
    minImages: 2,
    maxImages: 2,
    duration: "8s",
    badge: "MUSIC VIDEO",
    prompt:
      "Create an original eight-second two-person rap performance video using the two uploaded consenting adult performers, preserving both identities. Use a minimalist seamless solid orange studio background and matching orange floor, with exactly one silver studio microphone hanging vertically from a thin ceiling cable between the performers. Keep both performers clearly visible on opposite sides of the hanging microphone as they trade relaxed complementary performance gestures, natural head movement and confident eye contact. Frame a steady medium-wide two-shot with subtle cinematic camera movement, even warm studio lighting, realistic skin texture and tasteful casual streetwear. This is an orange studio performance, not a literal hotel interior: no hotel lobby, marble, staircase, chandeliers or luxury architecture. Use an original rhythm and performance, leaving music replacement to the editor. Do not substitute celebrity faces or reproduce existing lyrics, copyrighted recordings, branding or show logos."
  },
  {
    id: "street-freestyle-video",
    title: "Street Freestyle Music Video",
    subtitle: "Raw street performance and crew energy",
    category: "video",
    featured: false,
    kind: "video",
    model: VEO_MODEL,
    tokens: 500,
    minImages: 1,
    maxImages: 3,
    duration: "8s",
    badge: "MUSIC VIDEO",
    prompt:
      "Create an original eight-second raw, kinetic street rap performance video featuring the uploaded adult performer with their identity preserved. Outdoor neighborhood setting at golden hour, friends in the background with natural non-staged reactions, handheld camera with smooth operator control, punchy close-ups and medium shots, authentic confident direct-to-camera delivery, realistic wardrobe and skin texture, polished but spontaneous music-video pacing. Use original performance energy and ambient sound; do not reproduce an existing artist, exact music video shots, lyrics, copyrighted recording, music, logos, or celebrity likenesses."
  },
  {
    id: "dead-fresh-lifestyle-video",
    title: "Dead Fresh — Street Lifestyle",
    subtitle: "Fashion, golf-course energy and cinematic lifestyle shots",
    category: "video",
    featured: true,
    kind: "video",
    model: VEO_MODEL,
    tokens: 500,
    minImages: 1,
    maxImages: 3,
    duration: "8s",
    badge: "LIFESTYLE VIDEO",
    prompt: "Create an original eight-second cinematic street-lifestyle music-video scene using the uploaded consenting adult performer, preserving their identity. Build a confident fashion-forward performance with tailored casual streetwear, expressive direct-to-camera delivery, crisp daylight on a golf course, a tasteful golf cart and lively cutaways to polished lifestyle details. Balance playful golf-course energy with premium editorial fashion framing and rhythmic camera movement. Use an original performance and rhythm, allowing the editor to add their own licensed music. The reference is a lifestyle direction: do not substitute Lil Baby or another celebrity for the uploaded person, reproduce an existing music-video sequence, existing lyrics, logos or copyrighted recordings."
  },
  {
    id: "album-cover",
    title: "Album Cover",
    subtitle: "Bold cover-art portrait",
    category: "photos",
    kind: "image",
    model: IMAGE_MODEL,
    tokens: 45,
    minImages: 1,
    maxImages: 2,
    aspectRatio: "1:1",
    badge: "POPULAR",
    prompt:
      "Transform the uploaded subject or subjects into polished original album-cover photography. Preserve their identities and facial features. Dramatic studio lighting, premium wardrobe styling, deep contrast, clean composition, cinematic texture, tasteful atmosphere, realistic anatomy, no existing artist branding, no copyrighted logos, no text."
  },
  {
    id: "studio-portrait",
    title: "Studio Portrait",
    subtitle: "Clean premium photoshoot",
    category: "photos",
    kind: "image",
    model: IMAGE_MODEL,
    tokens: 30,
    minImages: 1,
    maxImages: 1,
    aspectRatio: "3:4",
    badge: "CLEAN",
    prompt:
      "Create a premium professional studio portrait from the uploaded person. Preserve identity, face, skin tone, hair, and age. Soft key light, controlled rim light, high-end editorial photography, natural skin texture, flattering wardrobe, realistic anatomy, uncluttered studio background, no text, no logos."
  },
  {
    id: "street-campaign",
    title: "Street Campaign",
    subtitle: "Urban fashion campaign",
    category: "photos",
    kind: "image",
    model: IMAGE_MODEL,
    tokens: 45,
    minImages: 1,
    maxImages: 2,
    aspectRatio: "4:3",
    badge: "STYLE",
    prompt:
      "Create an original urban fashion campaign image using the uploaded subject or subjects. Preserve identity. Contemporary city setting, premium streetwear styling, cinematic late-afternoon light, confident candid body language, realistic photography, sharp subject separation, authentic street detail, realistic hands and anatomy, no brand logos, no text."
  },
  {
    id: "luxury-night",
    title: "Luxury Night",
    subtitle: "Nightlife editorial",
    category: "photos",
    kind: "image",
    model: IMAGE_MODEL,
    tokens: 45,
    minImages: 1,
    maxImages: 2,
    aspectRatio: "16:9",
    badge: "NIGHT",
    prompt:
      "Create an upscale nighttime editorial featuring the uploaded subject or subjects. Preserve identity. Modern luxury environment, tasteful city lights, glossy reflections, cinematic lensing, subtle haze, elegant wardrobe, premium photography, realistic anatomy, no visible trademarks, no text."
  },
  {
    id: "movie-poster",
    title: "Movie Poster",
    subtitle: "Cinematic key art",
    category: "photos",
    kind: "image",
    model: IMAGE_MODEL,
    tokens: 50,
    minImages: 1,
    maxImages: 2,
    aspectRatio: "2:3",
    badge: "CINEMA",
    prompt:
      "Create original cinematic key art from the uploaded subject or subjects. Preserve identity and facial features. Dramatic movie lighting, layered depth, atmospheric background, strong hero composition, realistic photography and anatomy. Leave clean negative space for titles but do not generate any text, logos, franchise references, or copyrighted characters."
  },
  {
    id: "cinematic-motion",
    title: "Cinematic Motion",
    subtitle: "5-second premium AI video",
    category: "video",
    kind: "video",
    model: KLING_MODEL,
    tokens: 120,
    minImages: 1,
    maxImages: 1,
    duration: "5",
    badge: "VIDEO",
    prompt:
      "Animate the uploaded image as a premium cinematic shot. Preserve the person's identity and appearance. Natural breathing and subtle body motion, realistic blinking, gentle wardrobe movement, slow stabilized camera push, cinematic depth of field, realistic physics, clean high-end commercial look."
  },
  {
    id: "premium-movie-scene",
    title: "Premium Movie Scene",
    subtitle: "8-second Veo scene with audio",
    category: "video",
    kind: "video",
    model: VEO_MODEL,
    tokens: 500,
    minImages: 1,
    maxImages: 3,
    duration: "8s",
    badge: "PREMIUM",
    prompt:
      "Create an original cinematic movie scene using the uploaded people as visual references. Preserve their appearance and identities. Use natural human movement, realistic facial motion, motivated camera movement, cinematic lighting, coherent environment, premium sound design and ambience, polished 1080p film look. Do not imitate an existing movie or copyrighted character."
  }
];

const TOKEN_PACKS = [
  { id: "uds_tokens_600", label: "Starter", tokens: 600, priceLabel: "$9.99" },
  { id: "uds_tokens_1500", label: "Creator", tokens: 1500, priceLabel: "$19.99" },
  { id: "uds_tokens_4000", label: "Studio", tokens: 4000, priceLabel: "$39.99" },
  { id: "uds_tokens_10000", label: "Production", tokens: 10000, priceLabel: "$79.99" }
];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function requestOrigin(request) {
  return String(request.headers.get("Origin") || "").trim();
}

function corsHeadersFor(request) {
  const origin = requestOrigin(request);
  if (!NATIVE_APP_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Urban-Director-Platform",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin"
  };
}

function withCors(response, request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeadersFor(request))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function errorText(value, fallback = "AI generation failed.") {
  if (!value) return fallback;
  if (typeof value === "string") return value.slice(0, 1000);
  if (value.message) return String(value.message).slice(0, 1000);
  try {
    return JSON.stringify(value).slice(0, 1000);
  } catch {
    return fallback;
  }
}

async function ensureAiSchema(env) {
  if (!env.DB) throw new Error("Urban Director Studio database is unavailable.");

  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS uds_ai_wallets (
        user_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        lifetime_purchased INTEGER NOT NULL DEFAULT 0,
        lifetime_spent INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS uds_ai_monthly_grants (
        user_id TEXT NOT NULL,
        period_key TEXT NOT NULL,
        amount INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, period_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS uds_ai_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'fal',
        model_id TEXT NOT NULL,
        provider_request_id TEXT,
        status_url TEXT,
        response_url TEXT,
        status TEXT NOT NULL DEFAULT 'submitting',
        token_cost INTEGER NOT NULL,
        tokens_refunded INTEGER NOT NULL DEFAULT 0,
        result_json TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS uds_ai_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        kind TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        job_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES uds_ai_jobs(id) ON DELETE SET NULL
      )`
    ),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uds_ai_reports (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES uds_ai_jobs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(job_id,user_id)
    )`),
    env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS uds_ai_jobs_user_idx
       ON uds_ai_jobs(user_id, created_at DESC)`
    ),
    env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS uds_ai_transactions_user_idx
       ON uds_ai_transactions(user_id, created_at DESC)`
    )
  ]);
}

function periodKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isUnlimitedUser(user) {
  return user?.role === "owner" || user?.role === "admin";
}

function isMonthlyAiPlan(user) {
  return user?.accessStatus === "active" && ["pro", "ambassador", "beta"].includes(user?.plan);
}

async function ensureWallet(env, user) {
  await ensureAiSchema(env);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO uds_ai_wallets (
      user_id, balance, lifetime_purchased, lifetime_spent, created_at, updated_at
    ) VALUES (?, 0, 0, 0, ?, ?)`
  ).bind(user.id, now, now).run();

  if (!isUnlimitedUser(user) && isMonthlyAiPlan(user)) {
    const key = periodKey();
    const monthlyRaw = Number(env.AI_MONTHLY_TOKENS || 2500);
    const amount = Number.isFinite(monthlyRaw)
      ? Math.max(0, Math.min(100000, Math.floor(monthlyRaw)))
      : 2500;

    if (amount > 0) {
      const existing = await env.DB.prepare(
        `SELECT 1 AS ok FROM uds_ai_monthly_grants
         WHERE user_id = ? AND period_key = ? LIMIT 1`
      ).bind(user.id, key).first();

      if (!existing) {
        try {
          await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO uds_ai_monthly_grants (
                user_id, period_key, amount, created_at
              ) VALUES (?, ?, ?, ?)`
            ).bind(user.id, key, amount, now),
            env.DB.prepare(
              `UPDATE uds_ai_wallets
               SET balance = balance + ?, updated_at = ?
               WHERE user_id = ?`
            ).bind(amount, now, user.id),
            env.DB.prepare(
              `INSERT INTO uds_ai_transactions (
                id, user_id, amount, kind, description, created_at
              ) VALUES (?, ?, ?, 'monthly_grant', ?, ?)`
            ).bind(
              crypto.randomUUID(),
              user.id,
              amount,
              `Urban Director Studio monthly AI tokens • ${key}`,
              now
            )
          ]);
        } catch (error) {
          const message = String(error?.message || error || "");
          if (!/unique|constraint/i.test(message)) throw error;
        }
      }
    }
  }

  const row = await env.DB.prepare(
    `SELECT balance, lifetime_purchased, lifetime_spent, updated_at
     FROM uds_ai_wallets WHERE user_id = ? LIMIT 1`
  ).bind(user.id).first();

  return {
    unlimited: isUnlimitedUser(user),
    balance: isUnlimitedUser(user) ? null : Number(row?.balance || 0),
    lifetimePurchased: Number(row?.lifetime_purchased || 0),
    lifetimeSpent: Number(row?.lifetime_spent || 0),
    monthlyAllowance: isMonthlyAiPlan(user)
      ? Math.max(0, Math.floor(Number(env.AI_MONTHLY_TOKENS || 2500) || 2500))
      : 0,
    updatedAt: Number(row?.updated_at || now)
  };
}

async function reserveTokens(env, user, template, jobId, description) {
  const unlimited = isUnlimitedUser(user);
  if (!unlimited) await ensureWallet(env, user);
  const now = Date.now();
  const amount = template.tokens;
  // D1 executes the job, debit and ledger entry in one transaction.
  // Create the job before its ledger reference, including on older schemas.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO uds_ai_jobs (
      id, user_id, template_id, provider, model_id, status, token_cost, created_at, updated_at
    ) SELECT ?, ?, ?, 'fal', ?, 'submitting', ?, ?, ?
      WHERE ? = 1 OR EXISTS (SELECT 1 FROM uds_ai_wallets WHERE user_id = ? AND balance >= ?)`
    ).bind(jobId, user.id, template.id, template.model, amount, now, now, unlimited ? 1 : 0, user.id, amount),
    env.DB.prepare(`UPDATE uds_ai_wallets
      SET balance = balance - ?, lifetime_spent = lifetime_spent + ?, updated_at = ?
      WHERE user_id = ? AND ? = 0 AND EXISTS (SELECT 1 FROM uds_ai_jobs WHERE id = ?)`
    ).bind(amount, amount, now, user.id, unlimited ? 1 : 0, jobId),
    env.DB.prepare(`INSERT INTO uds_ai_transactions (
      id, user_id, amount, kind, description, job_id, created_at
    ) SELECT ?, ?, ?, 'generation', ?, ?, ?
      WHERE ? = 0 AND EXISTS (SELECT 1 FROM uds_ai_jobs WHERE id = ?)`
    ).bind(crypto.randomUUID(), user.id, -amount, description, jobId, now, unlimited ? 1 : 0, jobId)
  ]);
  return Number(results[0]?.meta?.changes || 0) === 1;
}

async function refundJob(env, row, user) {
  if (!row || Number(row.tokens_refunded || 0) === 1 || isUnlimitedUser(user)) return;
  const now = Date.now();
  // Keep the refund marker in the same transaction as the balance and ledger.
  // A failed write is retryable, and concurrent status polls cannot double-refund.
  await env.DB.batch([
    env.DB.prepare(`UPDATE uds_ai_wallets
      SET balance = balance + ?, lifetime_spent = MAX(0, lifetime_spent - ?), updated_at = ?
      WHERE user_id = ? AND EXISTS (
        SELECT 1 FROM uds_ai_jobs WHERE id = ? AND user_id = ? AND tokens_refunded = 0
      )`
    ).bind(row.token_cost, row.token_cost, now, user.id, row.id, user.id),
    env.DB.prepare(`INSERT INTO uds_ai_transactions (
      id, user_id, amount, kind, description, job_id, created_at
    ) SELECT ?, ?, ?, 'refund', 'AI generation refund', ?, ?
      WHERE EXISTS (SELECT 1 FROM uds_ai_jobs WHERE id = ? AND user_id = ? AND tokens_refunded = 0)`
    ).bind(crypto.randomUUID(), user.id, row.token_cost, row.id, now, row.id, user.id),
    env.DB.prepare(`UPDATE uds_ai_jobs SET tokens_refunded = 1, updated_at = ?
      WHERE id = ? AND user_id = ? AND tokens_refunded = 0`
    ).bind(now, row.id, user.id)
  ]);
}

function templateForId(id) {
  return AI_TEMPLATES.find(item => item.id === id) || null;
}

function publicTemplate(template) {
  const { prompt, model, ...safe } = template;
  return safe;
}

function sanitizeImages(value, maxImages) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxImages)
    .map(item => String(item || "").trim())
    .filter(item => {
      if (/^https:\/\//i.test(item)) return item.length <= 3000;
      return /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(item) && item.length <= 8_500_000;
    });
}

function buildProviderInput(template, images, customPrompt = "") {
  const extra = String(customPrompt || "").trim().slice(0, 600);
  const prompt = extra
    ? `${template.prompt}\nCreative direction from the user: ${extra}`
    : template.prompt;

  if (template.model === KLING_MODEL) {
    return {
      prompt,
      start_image_url: images[0],
      duration: template.duration || "5",
      generate_audio: true,
      shot_type: "intelligent",
      negative_prompt: "blur, distortion, deformed hands, extra fingers, duplicate people, low quality, identity drift",
      cfg_scale: 0.5
    };
  }

  if (template.model === VEO_MODEL) {
    return {
      prompt,
      image_urls: images,
      aspect_ratio: "16:9",
      duration: template.duration || "8s",
      resolution: "1080p",
      generate_audio: true,
      auto_fix: true,
      safety_tolerance: "4"
    };
  }

  return {
    prompt,
    image_urls: images,
    guidance_scale: 3.5,
    num_images: 1,
    output_format: "jpeg",
    safety_tolerance: "2",
    enhance_prompt: true,
    aspect_ratio: template.aspectRatio || "1:1"
  };
}

async function falRequest(env, url, options = {}) {
  const key = String(env.FAL_KEY || "").trim();
  if (!key) {
    return {
      ok: false,
      status: 503,
      data: { error: "Director AI generator is waiting for the FAL_KEY Cloudflare secret." }
    };
  }

  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Key ${key}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function extractAsset(result, template) {
  const data = result?.data && typeof result.data === "object" ? result.data : result;
  if (template.kind === "video") {
    const url = String(data?.video?.url || "").trim();
    return url ? { url, kind: "video", contentType: data?.video?.content_type || "video/mp4" } : null;
  }
  const first = Array.isArray(data?.images) ? data.images[0] : null;
  const url = String(first?.url || "").trim();
  return url ? { url, kind: "image", contentType: first?.content_type || "image/jpeg" } : null;
}

async function studioPayload(env, user) {
  const wallet = await ensureWallet(env, user);
  const rows = await env.DB.prepare(
    `SELECT id, template_id, status, token_cost, result_json, error, created_at, updated_at
     FROM uds_ai_jobs
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 12`
  ).bind(user.id).all();

  return {
    provider: {
      id: "fal",
      ready: Boolean(String(env.FAL_KEY || "").trim()),
      imageModel: IMAGE_MODEL,
      videoModels: [KLING_MODEL, VEO_MODEL]
    },
    wallet,
    templates: AI_TEMPLATES.map(publicTemplate),
    tokenPacks: TOKEN_PACKS,
    tokenStoreReady: false,
    jobs: (rows.results || []).map(row => ({
      id: row.id,
      templateId: row.template_id,
      status: row.status,
      tokenCost: Number(row.token_cost || 0),
      result: row.result_json ? JSON.parse(row.result_json) : null,
      error: row.error || "",
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0)
    }))
  };
}

async function handleGenerate(request, env, user) {
  const body = await request.json().catch(() => ({}));
  if (body.aiSharingConsent !== "fal-ai-v1") {
    return json({
      error: "Agree to share your photos and instructions with fal.ai and its generation providers before generating. Update your app if this consent option is missing.",
      code: "ai_sharing_consent_required"
    }, 400);
  }

  if (!String(env.FAL_KEY || "").trim()) {
    return json({
      error: "Director AI is wired but the FAL_KEY Cloudflare secret has not been added yet.",
      code: "generator_not_configured"
    }, 503);
  }

  const template = templateForId(String(body.templateId || ""));
  if (!template) return json({ error: "Choose a valid AI template." }, 400);

  const images = sanitizeImages(body.images, template.maxImages);
  if (images.length < template.minImages) {
    return json({
      error: `${template.title} needs ${template.minImages} photo${template.minImages === 1 ? "" : "s"}.`
    }, 400);
  }

  const jobId = crypto.randomUUID();
  const reserved = await reserveTokens(
    env,
    user,
    template,
    jobId,
    `${template.title} generation`
  );

  if (!reserved) {
    const wallet = await ensureWallet(env, user);
    return json({
      error: "Not enough Director AI tokens for this generation.",
      code: "insufficient_tokens",
      wallet,
      required: template.tokens
    }, 402);
  }

  const input = buildProviderInput(template, images, body.customPrompt);
  let provider;
  try {
    provider = await falRequest(
      env,
      `https://queue.fal.run/${template.model}`,
      { method: "POST", body: JSON.stringify(input) }
    );
  } catch {
    provider = { ok: false, status: 502, data: { error: "The generator connection failed. Your tokens were returned." } };
  }

  if (!provider.ok || !provider.data?.request_id) {
    const failure = errorText(provider.data?.detail || provider.data?.error, "Generator did not accept the request.");
    await env.DB.prepare(
      `UPDATE uds_ai_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`
    ).bind(failure, Date.now(), jobId).run();
    const row = await env.DB.prepare("SELECT * FROM uds_ai_jobs WHERE id = ?").bind(jobId).first();
    await refundJob(env, row, user);
    return json({ error: failure, code: "provider_submit_failed" }, provider.status || 502);
  }

  await env.DB.prepare(
    `UPDATE uds_ai_jobs
     SET provider_request_id = ?, status_url = ?, response_url = ?, status = 'queued', updated_at = ?
     WHERE id = ?`
  ).bind(
    provider.data.request_id,
    String(provider.data.status_url || ""),
    String(provider.data.response_url || ""),
    Date.now(),
    jobId
  ).run();

  return json({
    ok: true,
    job: {
      id: jobId,
      templateId: template.id,
      title: template.title,
      status: "queued",
      tokenCost: template.tokens,
      kind: template.kind
    },
    wallet: await ensureWallet(env, user)
  }, 202);
}

async function loadOwnedJob(env, user, jobId) {
  return env.DB.prepare(
    `SELECT * FROM uds_ai_jobs WHERE id = ? AND user_id = ? LIMIT 1`
  ).bind(jobId, user.id).first();
}

async function handleJobStatus(env, user, jobId) {
  let row = await loadOwnedJob(env, user, jobId);
  if (!row) return json({ error: "AI job not found." }, 404);
  const template = templateForId(row.template_id);
  if (!template) return json({ error: "AI template no longer exists." }, 410);

  if (row.status === "complete") {
    return json({
      job: {
        id: row.id,
        templateId: row.template_id,
        status: row.status,
        tokenCost: Number(row.token_cost || 0),
        result: row.result_json ? JSON.parse(row.result_json) : null,
        error: row.error || ""
      },
      wallet: await ensureWallet(env, user)
    });
  }

  if (row.status === "submitting" && !row.provider_request_id && Date.now() - row.created_at > 120000) {
    await env.DB.prepare(`UPDATE uds_ai_jobs SET status = 'failed', error = ?, updated_at = ?
      WHERE id = ? AND status = 'submitting' AND provider_request_id IS NULL`
    ).bind("The generator connection was interrupted. Your tokens were returned.", Date.now(), row.id).run();
    row = await loadOwnedJob(env, user, jobId);
  }

  if (row.status === "failed") {
    await refundJob(env, row, user);
    row = await loadOwnedJob(env, user, jobId);
    return json({
      job: {
        id: row.id,
        templateId: row.template_id,
        status: "failed",
        tokenCost: Number(row.token_cost || 0),
        error: row.error || "Generation failed. Tokens were returned."
      },
      wallet: await ensureWallet(env, user)
    });
  }

  if (!row.status_url) {
    return json({ error: "Generator status link is missing." }, 502);
  }

  const statusResponse = await falRequest(env, row.status_url, { method: "GET" });
  if (!statusResponse.ok) {
    return json({
      job: {
        id: row.id,
        templateId: row.template_id,
        status: row.status,
        tokenCost: Number(row.token_cost || 0)
      },
      providerPending: true
    }, 202);
  }

  const providerStatus = String(statusResponse.data?.status || "").toUpperCase();
  if (providerStatus === "FAILED" || providerStatus === "ERROR") {
    const failure = errorText(statusResponse.data?.error || statusResponse.data?.detail);
    await env.DB.prepare(
      `UPDATE uds_ai_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`
    ).bind(failure, Date.now(), row.id).run();
    row = await loadOwnedJob(env, user, jobId);
    await refundJob(env, row, user);
    return json({
      job: { id: row.id, templateId: row.template_id, status: "failed", error: failure },
      wallet: await ensureWallet(env, user)
    });
  }

  if (providerStatus !== "COMPLETED") {
    const nextStatus = providerStatus === "IN_PROGRESS" ? "generating" : "queued";
    await env.DB.prepare(
      `UPDATE uds_ai_jobs SET status = ?, updated_at = ? WHERE id = ?`
    ).bind(nextStatus, Date.now(), row.id).run();
    return json({
      job: {
        id: row.id,
        templateId: row.template_id,
        status: nextStatus,
        tokenCost: Number(row.token_cost || 0),
        queuePosition: statusResponse.data?.queue_position ?? null
      },
      wallet: await ensureWallet(env, user)
    }, 202);
  }

  const resultResponse = await falRequest(env, row.response_url, { method: "GET" });
  if (!resultResponse.ok) {
    return json({
      job: { id: row.id, templateId: row.template_id, status: "generating" }
    }, 202);
  }

  const asset = extractAsset(resultResponse.data, template);
  if (!asset) {
    const failure = "Generator completed but did not return a usable media file.";
    await env.DB.prepare(
      `UPDATE uds_ai_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`
    ).bind(failure, Date.now(), row.id).run();
    row = await loadOwnedJob(env, user, jobId);
    await refundJob(env, row, user);
    return json({ error: failure }, 502);
  }

  const result = {
    ...asset,
    title: template.title,
    generatedAt: Date.now()
  };
  await env.DB.prepare(
    `UPDATE uds_ai_jobs
     SET status = 'complete', result_json = ?, error = NULL, updated_at = ?
     WHERE id = ?`
  ).bind(JSON.stringify(result), Date.now(), row.id).run();

  return json({
    job: {
      id: row.id,
      templateId: row.template_id,
      status: "complete",
      tokenCost: Number(row.token_cost || 0),
      result
    },
    wallet: await ensureWallet(env, user)
  });
}

async function handleAssetProxy(env, user, jobId) {
  const row = await loadOwnedJob(env, user, jobId);
  if (!row || row.status !== "complete" || !row.result_json) {
    return json({ error: "Generated media is not ready." }, 404);
  }

  const result = JSON.parse(row.result_json);
  const url = String(result?.url || "");
  if (!/^https:\/\//i.test(url)) {
    return json({ error: "Generated media URL is invalid." }, 400);
  }

  const remote = await fetch(url);
  if (!remote.ok || !remote.body) {
    return json({ error: "Generated media could not be loaded." }, 502);
  }

  const headers = new Headers();
  headers.set("Content-Type", remote.headers.get("Content-Type") || result.contentType || "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=300");
  headers.set(
    "Content-Disposition",
    `inline; filename="${result.kind === "video" ? "director-ai-video.mp4" : "director-ai-image.jpg"}"`
  );
  return new Response(remote.body, { status: 200, headers });
}

export async function handleAiStudio(request, env, user) {
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }), request);
  }

  if (!user || user.status !== "active" || user.accessStatus !== "active") {
    return withCors(json({ error: "Sign in to use Director AI Studio." }, 401), request);
  }

  try {
    await ensureAiSchema(env);
    const url = new URL(request.url);

    if (url.pathname === "/api/ai/studio" && request.method === "GET") {
      return withCors(json(await studioPayload(env, user)), request);
    }

    if (url.pathname === "/api/ai/generate" && request.method === "POST") {
      return withCors(await handleGenerate(request, env, user), request);
    }

    if (url.pathname === "/api/ai/reports" && request.method === "GET") {
      if (!isUnlimitedUser(user)) return withCors(json({ error: "Admin access required." }, 403), request);
      const rows = await env.DB.prepare(`SELECT r.id,r.job_id,r.reason,r.created_at,j.result_json
        FROM uds_ai_reports r JOIN uds_ai_jobs j ON j.id=r.job_id ORDER BY r.created_at DESC LIMIT 50`).all();
      return withCors(json({ reports: (rows.results || []).map(row => ({
        id: row.id, jobId: row.job_id, reason: row.reason, createdAt: row.created_at,
        result: row.result_json ? JSON.parse(row.result_json) : null
      })) }), request);
    }
    const reportMatch = url.pathname.match(/^\/api\/ai\/jobs\/([^/]+)\/report$/);
    if (reportMatch && request.method === "POST") {
      const job = await loadOwnedJob(env, user, decodeURIComponent(reportMatch[1]));
      if (!job) return withCors(json({ error: "Generation not found." }, 404), request);
      const body = await request.json().catch(() => ({}));
      const reason = String(body.reason || "").trim();
      if (reason.length < 5 || reason.length > 1000) return withCors(json({ error: "Describe the issue in 5 to 1,000 characters." }, 400), request);
      await env.DB.prepare(`INSERT INTO uds_ai_reports(id,job_id,user_id,reason,created_at)
        VALUES(?,?,?,?,?) ON CONFLICT(job_id,user_id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at`
      ).bind(crypto.randomUUID(), job.id, user.id, reason, Date.now()).run();
      return withCors(json({ ok: true }), request);
    }

    const assetMatch = url.pathname.match(/^\/api\/ai\/jobs\/([^/]+)\/asset$/);
    if (assetMatch && request.method === "GET") {
      return withCors(await handleAssetProxy(env, user, decodeURIComponent(assetMatch[1])), request);
    }

    const jobMatch = url.pathname.match(/^\/api\/ai\/jobs\/([^/]+)$/);
    if (jobMatch && request.method === "GET") {
      return withCors(await handleJobStatus(env, user, decodeURIComponent(jobMatch[1])), request);
    }

    return withCors(json({ error: "Director AI route not found." }, 404), request);
  } catch (error) {
    console.error("Urban Director AI Studio error", error);
    return withCors(json({
      error: error instanceof Error ? error.message : String(error)
    }, 500), request);
  }
}
