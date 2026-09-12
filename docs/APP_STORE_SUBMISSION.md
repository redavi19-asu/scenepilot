# Urban Director Studio — App Store Submission Checklist

## App identity

- **App name:** Urban Director Studio
- **Version:** 1.0
- **Build:** 1
- **Bundle ID:** com.icomputeranything.scenepilot
- **Primary category:** Photo & Video
- **Suggested subtitle:** Multi-Camera Live Production
- **Marketing URL:** https://scenepilot.ryanedavis.workers.dev/
- **Privacy Policy URL:** https://scenepilot.ryanedavis.workers.dev/privacy
- **Support URL:** https://scenepilot.ryanedavis.workers.dev/support

## App Store description draft

Urban Director Studio is a multi-camera live production platform built for mobile crews, independent producers, events, interviews, podcasts, sports, and field production.

Connect compatible phones, tablets, cameras, capture devices, and external audio sources to a coordinated production room. The Director can monitor sources, prepare Preview, switch Program, communicate with camera operators, manage production audio, trigger graphics, record, use instant replay, and publish the live Program feed.

Key capabilities include:

- Multi-camera Director console
- Wireless phone and tablet camera operators
- Preview and Program switching
- Private crew messaging and walkie-talkie intercom
- External audio and capture-device support
- Production graphics and overlays
- Recording and instant replay workflow
- Broadcast destination controls
- Dedicated live viewer experience

Urban Director Studio is built by I Computer Anything.

## Subscription

**Urban Director Studio Pro — $29.99/month**

For iPhone and iPad, the subscription must be configured as an Apple auto-renewable subscription through App Store Connect / StoreKit. Do not place Stripe checkout inside the iOS app.

StoreKit configuration and sandbox purchase testing are intentionally held until the Apple Developer account is fully activated.

## App Review account

Before submitting for review, create a permanent active reviewer account that does not require manual approval during Apple's review.

Enter the final credentials in App Store Connect under App Review Information.

- Username: **TO BE CREATED**
- Password: **TO BE CREATED**

Do not store the reviewer password in this repository.

## Suggested App Review notes

Urban Director Studio is a live multi-camera production application.

The app requests camera and microphone permission only when the reviewer starts camera or production features that require those inputs. It does not request precise location.

To test Director mode:
1. Sign in using the review account supplied in App Store Connect.
2. Open the Director console.
3. Use the displayed camera-link / QR workflow to connect a second compatible device as a camera operator.
4. Approve camera and microphone permission on the camera device.
5. The connected camera will appear in the Director multiview.
6. The reviewer can use Preview / Program switching, crew messaging, intercom, recording, graphics, replay, and broadcast controls.

The app intentionally pauses camera transmission when iOS backgrounds the camera app and provides a reconnect/resume workflow when the app becomes active again.

If testing a configured external broadcast destination requires credentials that cannot safely be shared with review, explain that limitation in the final review notes and provide a testable self-hosted or review destination if available.

## Privacy / data review

Before submission, complete App Privacy in App Store Connect based on the production behavior of the final build.

Current code uses:
- account name and email
- account/user identifiers
- authentication/session information
- optional product-update consent
- camera and microphone media when the user starts production features
- limited battery/network-quality telemetry when the camera operator permits it
- user-selected broadcast destination settings
- live production media routed through production infrastructure when the user chooses to transmit/broadcast

No advertising SDK, IDFA use, or app-tracking permission is currently present in the project.

## Final pre-submit steps

1. Confirm Apple Developer Program enrollment/payment is active.
2. Create the App Store Connect app using the existing bundle ID.
3. Configure Urban Director Studio Pro at **$29.99/month** as an auto-renewable subscription.
4. Run subscription sandbox tests including purchase, renewal, cancellation/expiration, restore, and entitlement recovery.
5. Run `npm ci`.
6. Run `npm run lint`.
7. Run `npm run build`.
8. Run `npm run mobile:sync`.
9. Open the iOS project in Xcode.
10. Confirm signing team, bundle ID, version 1.0, and build 1.
11. Inspect the installed 1024×1024 App Store icon visually.
12. Test on a physical iPhone and, because the target includes iPad, a supported iPad or iPad simulator/device.
13. Test camera and microphone permission prompts.
14. Test account creation, login, logout, and permanent account deletion.
15. Test Director + camera connection on different networks, including cellular where practical.
16. Test live production after Wi-Fi/cellular transitions and app foreground/background transitions.
17. Verify Privacy and Support URLs are publicly reachable.
18. Capture final App Store screenshots from the release build.
19. Archive the Release build in Xcode and run Xcode validation.
20. Upload to App Store Connect / TestFlight and perform a final TestFlight pass.
21. Add the permanent review account and complete App Review notes.
22. Submit for review.

## Current code-readiness notes

The production iOS configuration bundles the built web application inside the native app instead of loading the application code from a remote `server.url`.

The native app talks to the hosted Urban Director Studio backend for account, realtime, signaling, and production services. Native API authentication uses a bearer session and short-lived signaling tickets. Camera-operator links continue to use controlled production join tokens.

The app includes in-app account deletion, an Urban Director Studio privacy page, an Urban Director Studio support page, camera/microphone usage descriptions, scoped native CORS support, and an iOS 15+ deployment target.
