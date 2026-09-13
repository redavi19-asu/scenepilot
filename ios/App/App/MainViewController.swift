import Capacitor

@objc(MainViewController)
public class MainViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(StoreKitSubscriptionPlugin())
    }
}
