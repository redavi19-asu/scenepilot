export const PROFIT_SAFE_TOKEN_PACKS = Object.freeze([
  Object.freeze({ id: "uds_tokens_600", label: "Starter", tokens: 600, priceLabel: "$9.99" }),
  Object.freeze({ id: "uds_tokens_1250", label: "Creator", tokens: 1250, priceLabel: "$19.99" }),
  Object.freeze({ id: "uds_tokens_2600", label: "Studio", tokens: 2600, priceLabel: "$39.99" }),
  Object.freeze({ id: "uds_tokens_5500", label: "Production", tokens: 5500, priceLabel: "$79.99" })
]);

export const AI_PRICING_POLICY = Object.freeze({
  modelRouting: "automatic",
  customerModelSelector: false,
  pricingVersion: "2026-09-profit-safe-v1",
  note: "Customers choose a creative template. Urban Director Studio chooses the generation engine server-side and prices the template in Director tokens."
});

export function applyProfitSafeAiPricing(data) {
  if (!data || typeof data !== "object") return data;
  return {
    ...data,
    tokenPacks: PROFIT_SAFE_TOKEN_PACKS.map(pack => ({ ...pack })),
    pricingPolicy: AI_PRICING_POLICY
  };
}
