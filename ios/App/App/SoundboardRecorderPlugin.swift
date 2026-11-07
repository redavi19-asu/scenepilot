import Foundation
import AVFoundation
import Capacitor

// Capture directly through Apple audio APIs. MediaRecorder is not exposed in
// every WKWebView environment, including iPad apps running on a Mac.
@objc(SoundboardRecorderPlugin)
public class SoundboardRecorderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SoundboardRecorderPlugin"
    public let jsName = "SoundboardRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "inputs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "meter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]
    private var recorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var starting = false
    private var generation = 0
    private var previousCategory: AVAudioSession.Category?
    private var previousMode: AVAudioSession.Mode?
    private var previousOptions: AVAudioSession.CategoryOptions?
    private var previousInput: AVAudioSessionPortDescription?

    private func inputList() -> [[String: String]] {
        let session = AVAudioSession.sharedInstance()
        return (session.availableInputs ?? session.currentRoute.inputs).map {
            ["deviceId": $0.uid, "label": $0.portName]
        }
    }

    @objc func inputs(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["devices": self.inputList()]) }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.recorder == nil && !self.starting else {
                call.reject("A microphone sample is already recording.", "MIC_BUSY")
                return
            }
            self.starting = true
            self.generation += 1
            let requestGeneration = self.generation
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async {
                    guard self.generation == requestGeneration else {
                        call.reject("Microphone recording was canceled.", "MIC_CANCELED")
                        return
                    }
                    self.starting = false
                    guard granted else {
                        call.reject("Allow Urban Director Studio to use the microphone in System Settings > Privacy & Security > Microphone (Mac), or Settings > Apps > Urban Director Studio (iPhone/iPad).", "MIC_PERMISSION")
                        return
                    }
                    do {
                        let session = AVAudioSession.sharedInstance()
                        self.previousCategory = session.category
                        self.previousMode = session.mode
                        self.previousOptions = session.categoryOptions
                        self.previousInput = session.preferredInput
                        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
                        try session.setActive(true)
                        let inputId = call.getString("inputId") ?? ""
                        if !inputId.isEmpty {
                            guard let input = session.availableInputs?.first(where: { $0.uid == inputId }) else {
                                throw NSError(domain: "Soundboard", code: 1, userInfo: [NSLocalizedDescriptionKey: "That microphone is disconnected. Choose System default or reconnect it."])
                            }
                            try session.setPreferredInput(input)
                        }
                        let url = FileManager.default.temporaryDirectory.appendingPathComponent("uds-sample-\(UUID().uuidString).wav")
                        self.recordingURL = url
                        let settings: [String: Any] = [
                            AVFormatIDKey: kAudioFormatLinearPCM,
                            AVSampleRateKey: 44100.0,
                            AVNumberOfChannelsKey: 1,
                            AVLinearPCMBitDepthKey: 16,
                            AVLinearPCMIsFloatKey: false,
                            AVLinearPCMIsBigEndianKey: false
                        ]
                        let capture = try AVAudioRecorder(url: url, settings: settings)
                        capture.isMeteringEnabled = true
                        guard capture.prepareToRecord(), capture.record(forDuration: 30) else {
                            throw NSError(domain: "Soundboard", code: 2, userInfo: [NSLocalizedDescriptionKey: "The microphone could not start. Check its connection and microphone permission."])
                        }
                        self.recorder = capture
                        call.resolve(["inputLabel": session.currentRoute.inputs.first?.portName ?? "System microphone", "devices": self.inputList()])
                    } catch {
                        self.cleanup()
                        call.reject(error.localizedDescription, "MIC_START")
                    }
                }
            }
        }
    }

    @objc func meter(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let capture = self.recorder else { call.resolve(["level": 0, "elapsed": 0]); return }
            capture.updateMeters()
            let level = pow(10.0, Double(capture.averagePower(forChannel: 0)) / 20.0)
            call.resolve(["level": min(1, max(0, level)), "elapsed": capture.currentTime])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let capture = self.recorder, let url = self.recordingURL else {
                call.reject("No microphone recording is active.", "MIC_NOT_RECORDING")
                return
            }
            capture.stop()
            do {
                let data = try Data(contentsOf: url)
                guard data.count > 44 else {
                    throw NSError(domain: "Soundboard", code: 3, userInfo: [NSLocalizedDescriptionKey: "No microphone audio was captured. Your previous pad was kept."])
                }
                let payload: [String: Any] = ["audioBase64": data.base64EncodedString(), "mimeType": "audio/wav"]
                self.cleanup()
                call.resolve(payload)
            } catch {
                self.cleanup()
                call.reject(error.localizedDescription, "MIC_EMPTY")
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.cleanup(); call.resolve() }
    }

    private func cleanup() {
        generation += 1
        starting = false
        recorder?.stop()
        recorder = nil
        if let url = recordingURL { try? FileManager.default.removeItem(at: url) }
        recordingURL = nil
        let session = AVAudioSession.sharedInstance()
        if let category = previousCategory, let mode = previousMode, let options = previousOptions {
            try? session.setCategory(category, mode: mode, options: options)
            try? session.setPreferredInput(previousInput)
        }
        previousCategory = nil
        previousMode = nil
        previousOptions = nil
        previousInput = nil
        // Do not deactivate the shared session: live camera/Program may use it.
    }
}
