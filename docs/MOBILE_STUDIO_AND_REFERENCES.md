# Mobile studio and original reference previews

On phones the camera bank and technical production sections start collapsed. Collapse All also closes graphics, broadcast, editor and AI panels without stopping Program, recording, ingest or an active generation. Desktop monitor windows retain their desktop behavior.

The phone header labels use a correctly sized Show/Hide indicator. Standby, Take and Walkie-Talkie occupy a bottom control row above the status footer, with content padding so the last controls remain reachable. Secondary comms remain in the menu.

AI Studio uses one full-width template card per row on phones. Preview and Use Template are different actions. Creating a clip starts in a collapsed panel until the operator chooses a template. A reference preview shows the credited original performers and a Play Original Video link to the official YouTube upload. No generation request or Studio token reservation is made for viewing a reference. Embedded playback was unavailable in browser testing, so the player action opens YouTube instead of leaving an unavailable embedded player.

Original references were verified through the publisher pages and YouTube's oEmbed metadata:

- Progressive Insurance, Dr. Rick — Let It Out: https://www.youtube.com/watch?v=Bk4JjtbNaRs
- Progressive Insurance, Dr. Rick — The Plan: https://www.youtube.com/watch?v=9rcgh4MjNk8
- Quavo & Takeoff — HOTEL LOBBY, COLORS: https://www.youtube.com/watch?v=x9yop0nYR9g
- Lil Baby — Dead Fresh, LilBabyVEVO: https://www.youtube.com/watch?v=PXxbEfhtDiM

Dr. Rick examples are references from the original campaign; the Store and Neighbor templates generate original comedy with uploaded actors. The Hotel Lobby generation uses the uploaded duo on the orange hanging-microphone set. Dead Fresh — Street Lifestyle is a new featured template with fashion and golf-course lifestyle direction. The generic Street Freestyle template remains under AI Video. Source videos are linked on their original host, rather than downloaded or repackaged as generated output.

My Creations is a collapsed job history, with status, Check for Updates, and links to completed saved results. Owner Tools separately contains content moderation reports. Neither is a video-preview control. The result-report form remains available when explicitly requested.

Browser QA uses phone-sized viewports with fixture data before deployment and the actual authenticated live app after deployment. This does not claim a physical iPhone test or a paid model generation test.


## Featured clip duration

The two parents commercials, Hotel Lobby orange studio and Dead Fresh lifestyle templates request **12 seconds** with sound through `fal-ai/kling-video/o3/pro/reference-to-video`. All uploaded photo references are sent and identified as `@Image1`, etc. Existing nonfeatured Veo templates keep their previous duration. The cards and creation form show the generated length separately from the original reference video.

Cost remains 500 Director tokens per featured clip. At the published fal rate of $0.14/second with audio, a 12-second request is $1.68 before any account-specific changes. Reference: https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video (checked October 28, 2026). Mocked submission/ledger tests verify duration, routing, all references and debit; no paid generation was run for this change.
