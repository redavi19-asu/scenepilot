import UIKit
import Capacitor
import MWDATCore

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Meta AI returns after registration or camera-permission approval.
        // Only intercept Meta callback URLs; keep QR/deep-link routing intact.
        for context in URLContexts {
            let url = context.url
            if URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.contains(where: { $0.name == "metaWearablesAction" }) == true {
                Task {
                    do {
                        _ = try await Wearables.shared.handleUrl(url)
                    } catch {
                        NSLog("[UrbanDirector] Meta callback failed: \\(error.localizedDescription)")
                    }
                }
            }
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
