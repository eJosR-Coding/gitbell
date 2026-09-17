# Changelog

## 0.2.1

- Sound works in packaged Linux builds (WebKitGTK couldn't play from the app's own protocol)
- Push toasts show the real commit count and message again (GitHub slimmed PushEvent payloads)
- Poller can't freeze on a hung request anymore (20 s timeout); failing targets stay visible in the status
- Your real avatar instead of a stale identicon
- Toast links to the packaged desktop entry; menu category Development

## 0.2.0

- Spanish and English UI
- `gitbell notify` for scripts and agents
- Three-step onboarding with the mascot
- Activity-first window, identity strip, one-row notifications table
- Glass window with compositor blur and an opacity slider
- Unread badge on the tray icon
- Coding-agent detection with a link to the agent's session
- Token stored in the OS keyring; least-privilege capabilities

## 0.1.0

- First release: tray app, native toasts, sounds, bell animation

