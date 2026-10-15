package com.icomputeranything.scenepilot;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.android.billingclient.api.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;
import java.util.ArrayList;
import java.util.function.Consumer;

@CapacitorPlugin(name = "GooglePlaySubscription")
public class GooglePlaySubscriptionPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String PRODUCT = "director_pro_monthly";
    private static final String BASE_PLAN = "monthly";
    private BillingClient billing;
    private volatile PluginCall purchaseCall;
    private boolean connecting;
    private static class Pending {
        final PluginCall call; final Runnable task;
        Pending(PluginCall call, Runnable task) { this.call = call; this.task = task; }
    }
    private final List<Pending> waiting = new ArrayList<>();
    private void reject(PluginCall call, String message) {
        if (purchaseCall == call) purchaseCall = null;
        call.reject(message);
    }

    @Override public void load() {
        billing = BillingClient.newBuilder(getContext()).setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection().build();
    }
    private void connected(PluginCall call, Runnable operation) {
        getActivity().runOnUiThread(() -> {
            if (billing.isReady()) { operation.run(); return; }
            waiting.add(new Pending(call, operation));
            if (connecting) return;
            connecting = true;
            billing.startConnection(new BillingClientStateListener() {
                @Override public void onBillingSetupFinished(BillingResult result) {
                    connecting = false;
                    List<Pending> pending = new ArrayList<>(waiting); waiting.clear();
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        for (Pending task : pending) task.task.run();
                    } else {
                        for (Pending task : pending) reject(task.call, "Google Play is unavailable. Install the app through its Play testing link.");
                    }
                }
                @Override public void onBillingServiceDisconnected() {
                    connecting = false;
                    for (Pending task : new ArrayList<>(waiting)) reject(task.call, "Google Play disconnected. Please try again.");
                    waiting.clear();
                }
            });
        });
    }
    private void product(PluginCall call, Consumer<ProductDetails> callback) {
        connected(call, () -> billing.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder().setProductId(PRODUCT)
                    .setProductType(BillingClient.ProductType.SUBS).build())).build(),
            (result, details) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || details.getProductDetailsList().isEmpty()) {
                    reject(call, "Director Pro is not available on Google Play yet."); return;
                }
                callback.accept(details.getProductDetailsList().get(0));
            }));
    }
    private ProductDetails.SubscriptionOfferDetails basePlan(ProductDetails details) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers != null) for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (BASE_PLAN.equals(offer.getBasePlanId()) && offer.getOfferId() == null) return offer;
        }
        return null;
    }
    @PluginMethod public void getProduct(PluginCall call) {
        product(call, details -> {
            ProductDetails.SubscriptionOfferDetails offer = basePlan(details);
            if (offer == null) { call.reject("The Director Pro monthly plan is not configured."); return; }
            List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
            ProductDetails.PricingPhase phase = phases.get(phases.size()-1);
            JSObject value = new JSObject(); value.put("available", true);
            value.put("productId", PRODUCT); value.put("displayPrice", phase.getFormattedPrice());
            value.put("billingPeriod", phase.getBillingPeriod()); call.resolve(value);
        });
    }
    private String accountHash(String account) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(account.getBytes(StandardCharsets.UTF_8));
        StringBuilder value = new StringBuilder(); for (byte b : digest) value.append(String.format("%02x", b & 0xff));
        return value.toString();
    }
    @PluginMethod public synchronized void purchase(PluginCall call) {
        if (purchaseCall != null) { call.reject("A Google Play purchase is already in progress."); return; }
        String account = call.getString("appAccountToken", "");
        if (account.isEmpty()) { call.reject("Sign in before purchasing."); return; }
        purchaseCall = call;
        product(call, details -> {
            ProductDetails.SubscriptionOfferDetails offer = basePlan(details);
            if (offer == null) { purchaseCall = null; call.reject("The monthly plan is unavailable."); return; }
            try {
                BillingFlowParams params = BillingFlowParams.newBuilder()
                    .setObfuscatedAccountId(accountHash(account))
                    .setProductDetailsParamsList(Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details)
                            .setOfferToken(offer.getOfferToken()).build())).build();
                getActivity().runOnUiThread(() -> {
                    BillingResult result = billing.launchBillingFlow(getActivity(), params);
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        purchaseCall = null; call.reject("Google Play could not start the purchase. Try Restore Purchases if already subscribed.");
                    }
                });
            } catch (Exception error) { purchaseCall = null; call.reject("Google Play purchase could not start."); }
        });
    }
    private JSArray purchases(List<Purchase> list) {
        JSArray rows = new JSArray();
        if (list != null) for (Purchase purchase : list) {
            if (!purchase.getProducts().contains(PRODUCT)) continue;
            JSObject row = new JSObject(); row.put("purchaseToken", purchase.getPurchaseToken());
            row.put("status", purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased" : "pending");
            rows.put(row);
        }
        return rows;
    }
    @Override public void onPurchasesUpdated(BillingResult result, List<Purchase> list) {
        PluginCall call = purchaseCall; purchaseCall = null;
        JSObject value = new JSObject(); value.put("purchases", purchases(list));
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
            value.put("status", "updated"); if (call == null) notifyListeners("purchasesUpdated", value);
            if (call != null) call.resolve(value);
        } else if (call != null && result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            value.put("status", "cancelled"); call.resolve(value);
        } else if (call != null) call.reject("Google Play purchase was not completed. Try Restore Purchases if already subscribed.");
    }
    @PluginMethod public void restore(PluginCall call) {
        connected(call, () -> billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS).build(), (result, list) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("Google Play purchases could not be restored."); return; }
                JSObject value = new JSObject(); value.put("purchases", purchases(list)); call.resolve(value);
            }));
    }
    @PluginMethod public void manageSubscriptions(PluginCall call) {
        Uri uri = Uri.parse("https://play.google.com/store/account/subscriptions").buildUpon()
            .appendQueryParameter("sku", PRODUCT).appendQueryParameter("package", getContext().getPackageName()).build();
        try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri)); call.resolve(); }
        catch (Exception error) { call.reject("Open Google Play to manage your subscription."); }
    }
    @Override protected void handleOnDestroy() {
        if (billing != null) billing.endConnection();
        if (purchaseCall != null) { purchaseCall.reject("Purchase interrupted. Use Restore Purchases after reopening."); purchaseCall = null; }
        super.handleOnDestroy();
    }
}
