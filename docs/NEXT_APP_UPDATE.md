# Urban Director Studio: prepared next update

User decision, November 9, 2026: leave the current Apple review submission untouched. Do not withdraw, replace, or resubmit the currently reviewed build. Prepare changes for the next update after Apple responds.

Prepared changes:
- Customer accounts cannot publish or broadcast to DC Live. Preserve their ordinary recording and broadcast tools.
- ICA owner: visible Publish to DC Live recording control; completed uploads publish directly as replays.
- ICA owner: Go Live on DC Live, with show title, dedicated protected server room, and DC Live viewing link. Customer Preview/Program monitors and owner Preview/Program monitors remain in their own production rooms; audiences see Program output.
- DC Live live broadcasts start free. Payment readiness and a real owner camera-to-viewer test remain required before selling live access.
- Customer temporary server recording retention: 48 hours. Owner archive directory remains outside temporary cleanup.

Required before calling the release ready:
1. Check Apple's actual decision and the latest iOS workflow result in redavi19-asu/scenepilot. Build upload is not App Review submission, approval, release, or installation.
2. On the physical encoder host, update the running code and set SCENEPILOT_RECORDING_RETENTION_HOURS=48 in the service's actual environment file. The known user-service path is ~/.config/urban-director-studio/encoder.env. Verify the actual service configuration before editing; do not expose its secrets.
3. Restart only when no production is active. Verify encoder /health reports temporaryRetentionHours:48 and ownerRetention:permanent. Repository defaults do not prove the running server setting.
4. Verify real customer replay retrieval and expiration. File cleanup retention alone does not prove a customer-facing replay feature works.
5. Test a short owner live camera broadcast through Director -> encoder -> DC Live viewer, and confirm reserved direct media URLs are denied. Local tests and deployed route readback passed; live camera playback has not been verified.
6. After Apple's response, choose the new build for the next app update and submit through normal review. Do not change current review/release settings without user direction.

An hourly Apple-decision follow-up could not be created: the account already has five scheduled tasks. No existing task was changed or removed.
