import Foundation
import StoreKit
import UIKit
import Capacitor

@objc(StoreKitSubscriptionPlugin)
public class StoreKitSubscriptionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitSubscriptionPlugin"
    public let jsName = "StoreKitSubscription"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    private var defaultProductID: String {
        if let value = Bundle.main.object(
            forInfoDictionaryKey: "UrbanDirectorSubscriptionProductID"
        ) as? String, !value.isEmpty {
            return value
        }
        return "com.icomputeranything.scenepilot.pro.monthly"
    }

    private func productID(_ call: CAPPluginCall) -> String {
        let value = call.getString("productId")?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value! : defaultProductID
    }

    private func transactionPayload(
        _ transaction: StoreKit.Transaction,
        jwsRepresentation: String
    ) -> [String: Any] {
        var payload: [String: Any] = [
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            "purchaseDate": Int(transaction.purchaseDate.timeIntervalSince1970 * 1000),
            "jwsRepresentation": jwsRepresentation
        ]

        if let expirationDate = transaction.expirationDate {
            payload["expirationDate"] =
                Int(expirationDate.timeIntervalSince1970 * 1000)
        }

        if let revocationDate = transaction.revocationDate {
            payload["revocationDate"] =
                Int(revocationDate.timeIntervalSince1970 * 1000)
        }

        return payload
    }

    private func currentVerifiedEntitlement(
        for productID: String
    ) async -> (StoreKit.Transaction, String)? {
        for await result in StoreKit.Transaction.currentEntitlements {
            switch result {
            case .verified(let transaction):
                guard transaction.productID == productID else { continue }
                guard transaction.revocationDate == nil else { continue }

                if let expirationDate = transaction.expirationDate,
                   expirationDate <= Date() {
                    continue
                }

                return (transaction, result.jwsRepresentation)

            case .unverified:
                continue
            }
        }

        return nil
    }

    @objc func getProduct(_ call: CAPPluginCall) {
        let requestedID = productID(call)

        Task {
            do {
                let products = try await Product.products(for: [requestedID])
                guard let product = products.first else {
                    call.resolve([
                        "available": false,
                        "productId": requestedID
                    ])
                    return
                }

                var response: [String: Any] = [
                    "available": true,
                    "productId": product.id,
                    "displayName": product.displayName,
                    "description": product.description,
                    "displayPrice": product.displayPrice
                ]

                if let period = product.subscription?.subscriptionPeriod {
                    response["periodValue"] = period.value
                    switch period.unit {
                    case .day:
                        response["periodUnit"] = "day"
                    case .week:
                        response["periodUnit"] = "week"
                    case .month:
                        response["periodUnit"] = "month"
                    case .year:
                        response["periodUnit"] = "year"
                    @unknown default:
                        response["periodUnit"] = "unknown"
                    }
                }

                call.resolve(response)
            } catch {
                call.reject("Apple subscription product could not be loaded: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        let requestedID = productID(call)
        let appAccountToken = call.getString("appAccountToken")

        Task {
            do {
                let products = try await Product.products(for: [requestedID])
                guard let product = products.first else {
                    call.reject("Urban Director Studio Pro is not available from the App Store yet.")
                    return
                }

                var options = Set<Product.PurchaseOption>()
                if let token = appAccountToken,
                   let accountUUID = UUID(uuidString: token) {
                    options.insert(.appAccountToken(accountUUID))
                }

                let result = try await product.purchase(options: options)

                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        let payload = transactionPayload(
                            transaction,
                            jwsRepresentation: verification.jwsRepresentation
                        )
                        await transaction.finish()
                        call.resolve([
                            "status": "purchased",
                            "transaction": payload
                        ])

                    case .unverified:
                        call.reject("Apple could not verify this purchase.")
                    }

                case .pending:
                    call.resolve(["status": "pending"])

                case .userCancelled:
                    call.resolve(["status": "cancelled"])

                @unknown default:
                    call.reject("Apple returned an unknown purchase state.")
                }
            } catch {
                call.reject("Purchase could not be completed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        let requestedID = productID(call)

        Task {
            do {
                try await AppStore.sync()

                if let (transaction, jws) =
                    await currentVerifiedEntitlement(for: requestedID) {
                    call.resolve([
                        "active": true,
                        "transaction": transactionPayload(
                            transaction,
                            jwsRepresentation: jws
                        )
                    ])
                    return
                }

                call.resolve(["active": false])
            } catch {
                call.reject("Purchases could not be restored: \(error.localizedDescription)")
            }
        }
    }

    @objc func currentEntitlement(_ call: CAPPluginCall) {
        let requestedID = productID(call)

        Task {
            if let (transaction, jws) =
                await currentVerifiedEntitlement(for: requestedID) {
                call.resolve([
                    "active": true,
                    "transaction": transactionPayload(
                        transaction,
                        jwsRepresentation: jws
                    )
                ])
                return
            }

            call.resolve(["active": false])
        }
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }) else {
                call.reject("No active iOS window is available.")
                return
            }

            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve(["opened": true])
            } catch {
                call.reject("Apple subscription settings could not open: \(error.localizedDescription)")
            }
        }
    }
}
