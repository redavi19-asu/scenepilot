# Urban Director billing sandbox QC

The API sandbox uses `director-billing-sandbox`, isolated D1 database `ea8a6e9a-bb4e-4963-b393-a0b68d618be0`, and a Stripe test-only restricted key. It has no production user data, mail, streaming, or AI provider credentials.

Verified October 10, 2026:
- Real $39.99 USD monthly checkout creation and price validation.
- Unsigned webhook rejected (400), signed-out checkout rejected (401), wrong-origin request rejected (403), iOS web checkout rejected (400).
- A synthetic Stripe trial subscription created directly through the test API grants Pro access through the actual webhook. It was canceled without invoicing or proration; cancellation removes Pro access.
- Duplicate checkout while access is active rejected (409); authenticated billing portal created (200).
- Cancel/restart previously returned an expired checkout URL. The fix starts a new idempotency cycle after a canceled Director subscription. The deployed sandbox now returns a new URL.
- Five local regression tests pass, including signed webhook replay/current-state retrieval, manual-access preservation, stable retry, and restart behavior.

This does not certify a completed hosted checkout payment, paid renewal, failed-payment recovery, or a live Stripe account. Those require separate verification before enabling live charges.
