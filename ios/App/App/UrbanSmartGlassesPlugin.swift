import Foundation
import UIKit
import Capacitor
import MWDATCore
import MWDATCamera

/// Capacitor camera bridge for the existing QR-joined Urban Director operator.
/// This never creates or claims a Director session. Camera permission is
/// requested by Meta AI; live frames remain inside the private operator WebRTC.
@objc(UrbanSmartGlassesPlugin)
public class UrbanSmartGlassesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "UrbanSmartGlassesPlugin"
    public let jsName = "UrbanSmartGlasses"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRegistration", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startStream", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopStream", returnType: CAPPluginReturnPromise)
    ]

    // Meta's DeviceSession and Camera are main-actor lifecycle objects.
    @MainActor private var deviceSession: DeviceSession?
    @MainActor private var activeCamera: MWDATCamera.Camera?
    @MainActor private let sessionTokens = ListenerTokenBag()
    @MainActor private let streamTokens = ListenerTokenBag()
    @MainActor private var streaming = false
    @MainActor private var streamGeneration = 0
    @MainActor private var frameCount = 0

    @objc func getStatus(_ call: CAPPluginCall) {
        Task { @MainActor in
            let wearables = Wearables.shared
            call.resolve([
                "available": true,
                "connected": wearables.registrationState == .registered && !wearables.devices.isEmpty,
                "registered": wearables.registrationState == .registered,
                "streaming": streaming,
                "width": 360,
                "height": 640
            ])
        }
    }

    @objc func startRegistration(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                if Wearables.shared.registrationState != .registered {
                    try await Wearables.shared.startRegistration()
                }
                call.resolve(["started": true])
            } catch {
                call.reject("Could not register Urban Director with Meta AI: \(error.localizedDescription)")
            }
        }
    }

    @objc func startStream(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                guard !streaming else {
                    call.resolve(["started": true, "alreadyStreaming": true])
                    return
                }
                guard Wearables.shared.registrationState == .registered else {
                    call.reject("Register Urban Director in Meta AI before selecting Meta Glasses.")
                    return
                }
                guard !Wearables.shared.devices.isEmpty else {
                    call.reject("No Meta glasses are connected. Check the Meta AI app and wear your glasses.")
                    return
                }

                // The selection is an explicit user action, so permission may
                // redirect to Meta AI. Never silently continue after denial.
                if try await Wearables.shared.checkPermissionStatus(.camera) != .granted {
                    guard try await Wearables.shared.requestPermission(.camera) == .granted else {
                        call.reject("Meta AI camera access was not granted.")
                        return
                    }
                }

                let selector = AutoDeviceSelector(wearables: Wearables.shared)
                let session = try Wearables.shared.createSession(deviceSelector: selector)
                deviceSession = session
                session.statePublisher.listen { [weak self] state in
                    if state == .stopped {
                        Task { @MainActor [weak self] in
                            self?.resetResources()
                        }
                    }
                }.store(in: sessionTokens)
                try session.start()

                // Wait for real device readiness; do not report a camera feed
                // merely because the Meta registration UI opened.
                var attempts = 0
                while session.state != .started && attempts < 80 {
                    try await Task.sleep(for: .milliseconds(250))
                    attempts += 1
                }
                guard session.state == .started else {
                    resetResources()
                    call.reject("Timed out waiting for Meta glasses to connect.")
                    return
                }

                let requestedFPS = call.getInt("fps") ?? 24
                let fps: UInt = UInt([15, 24, 30].min(by: {
                    abs($0 - requestedFPS) < abs($1 - requestedFPS)
                }) ?? 24)
                let config = StreamConfiguration(
                    videoCodec: .raw,
                    resolution: .low,
                    frameRate: fps
                )
                guard let camera = try session.addCamera(config: config) else {
                    resetResources()
                    call.reject("The Meta camera could not start on these glasses.")
                    return
                }
                activeCamera = camera
                frameCount = 0
                streamGeneration += 1
                let currentGeneration = streamGeneration

                camera.stream.videoFramePublisher.listen { [weak self] frame in
                    guard let image = frame.makeUIImage(),
                          let jpeg = image.jpegData(compressionQuality: 0.62)
                    else { return }
                    Task { @MainActor [weak self] in
                        guard let self, self.streaming,
                              self.streamGeneration == currentGeneration else { return }
                        self.frameCount += 1
                        // JPEG-base64 over the WebView bridge is the initial
                        // compatibility path. Limit to ~15 frames/s.
                        if self.frameCount % 2 == 0 {
                            self.notifyListeners("frame", data: [
                                "base64": jpeg.base64EncodedString(),
                                "width": Int(image.size.width),
                                "height": Int(image.size.height)
                            ])
                        }
                    }
                }.store(in: streamTokens)

                camera.stream.errorPublisher.listen { [weak self] error in
                    Task { @MainActor [weak self] in
                        self?.notifyListeners("streamError", data: ["message": error.localizedDescription])
                    }
                }.store(in: streamTokens)
                camera.stream.start()
                streaming = true
                call.resolve(["started": true, "width": 360, "height": 640])
            } catch {
                resetResources()
                call.reject("Meta glasses camera could not start: \(error.localizedDescription)")
            }
        }
    }

    @objc func stopStream(_ call: CAPPluginCall) {
        Task { @MainActor in
            resetResources()
            call.resolve(["stopped": true])
        }
    }

    @MainActor private func resetResources() {
        streaming = false
        streamGeneration += 1
        streamTokens.clear()
        sessionTokens.clear()
        activeCamera?.stop()
        activeCamera = nil
        deviceSession?.stop()
        deviceSession = nil
    }
}
