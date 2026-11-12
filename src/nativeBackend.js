export const PRODUCTION_NATIVE_ORIGIN = 'https://scenepilot.ryanedavis.workers.dev';
export const BILLING_QC_ORIGIN = 'https://director-billing-sandbox.ryanedavis.workers.dev';

export function nativeBackendOrigin(value = '') {
  if (!value || value === PRODUCTION_NATIVE_ORIGIN) return PRODUCTION_NATIVE_ORIGIN;
  if (value === BILLING_QC_ORIGIN) return BILLING_QC_ORIGIN;
  throw new Error('Unsupported native API origin.');
}
