<!-- coderabbit-ai-generated:v1 -->

# Hands-free Mia

## Behaviour

Enable Hands-free Mia in the Consumer app, read the microphone explanation, and grant access. Say “Hey Mia, what can I cook?” The wake detector and English transcription run on the device. After Mia speaks, follow-up questions do not require another wake phrase or button press. After 25 seconds without a question, or “thanks Mia”, the session returns to wake listening. “Mute Mia”, “microphone off”, “stop listening”, or the visible Mute control stop capture. A question ends after about 1.2 seconds of silence, with a 30-second maximum turn.

The visible bar reports loading, waiting, listening, thinking, speaking, paused, muted, denied, or error. It remains across Consumer navigation. Mic permission is never requested on launch or during onboarding. Onboarding explains the optional feature; each explicit enabling session asks for informed consent. Resuming after backgrounding requires enabling again. Hub does not mount the voice provider.

## Audio, consent and context

- Vosk's constrained local grammar detects the wake phrase. Only after activation does full English dictation begin. A rolling buffer of at most about four seconds stays in RAM so a question spoken immediately after the wake phrase is preserved; its wake audio is trimmed using local word timestamps. No audio files are recorded, and microphone audio is not uploaded.
- Activated question text and bounded conversation history go to the existing authenticated `/api/mia` endpoint. Existing Firebase, Premium verification, AI credit and rate limits still apply. Ordinary room speech is discarded locally.
- Voice requests use the signed-in user's saved food preferences and pantry through the scoped server adapter. The currently open cooking screen supplies its recipe and zero-based step as data. “Next step”, “previous step”, and “repeat step” navigate/speak the current recipe locally. Suggestions do not silently save meal plans or modify pantry data.
- Conversation history is in memory, shared with existing text chat and cleared on account change. Existing visual answers remain available for typed questions in Visual Mode.
- Browser replies use device speech synthesis, preferring a local English voice. Android uses the native TextToSpeech plugin. The user's configured device speech service may process reply text. There is no cloud microphone recognizer fallback.
- Microphone tracks, worklet/context and model worker are released on mute, permission failure, page hide, hidden document, Android app backgrounding, logout or loss of eligible Consumer access. Spoken output and pending client AI requests are cancelled. Android's App plugin supplies an explicit native activity listener. No foreground service or closed-app wake listening is implemented.
- Echo cancellation and local comparison against the spoken reply reduce self-triggering; real device acoustics, accents, noise, battery use and interruption reliability still need field testing. This is an English-only first implementation, not a recognition accuracy benchmark.

## Build and model distribution

`bun install --frozen-lockfile` uses pinned `vosk-browser` 0.0.8, `@capacitor-community/text-to-speech` 8.0.2 and `@capacitor/app` 8.1.2. `bun run dev` and `bun run build` first run `scripts/prepare-mia-voice.mjs`. The script downloads the official English small0.15 ZIP, validates SHA-256 `30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498`, and packages it for same-origin hosting at `/mia/vosk-model-small-en-us-0.15.tar.gz`. GNU tar is required by this build script; the verified sandbox and Vercel Linux build environment supply it. An existing verified archive is reused. Failed download or integrity validation fails preparation rather than substituting another recognizer. `bun run voice:prepare` prepares only these assets; an optional first argument points to a previously downloaded ZIP and is still checksum-checked.

The roughly 40 MB model downloads to the browser after enabling and is cached by Vosk in IndexedDB. Model archives are generated build inputs, ignored by Git, and included in the Vercel static output. No access key is needed. Static model and PCM worklet must be served without authentication and without rewriting their paths to HTML.

The Consumer response policy now allows `microphone=(self)` and `worker-src 'self' blob:` to support permission prompts and Vosk's local worker. Hub host/path responses retain `microphone=()` and their previous worker policy. The Android manifest adds RECORD_AUDIO and MODIFY_AUDIO_SETTINGS, and Capacitor handles the runtime permission request.

After dependency changes, run `bunx cap sync android`, then the existing Java21/SDK36 Gradle build. **The installed Android/Play app needs an updated native binary** with the microphone permissions, App and TTS plugins. Shipping web JavaScript alone cannot add them to an old installed wrapper. A wrapper without the required plugins displays an update message.

Sources: [Vosk browser implementation and API](https://github.com/ccoreilly/vosk-browser), [official Vosk model catalog and Apache2.0 licence](https://alphacephei.com/vosk/models), [native TTS plugin](https://github.com/capacitor-community/text-to-speech), [Capacitor app lifecycle API](https://capacitorjs.com/docs/apis/app).

## Verification and remaining release work

- Run `bun run test` and `bunx tsc --noEmit`; voice tests cover activation, pauses, follow-ups, interruption, echo suppression, cancellation, resource cleanup, consent, native backgrounding, history, scoped pantry and Hub policy.
- With `bun run dev` ready and registered in the shared cloud Preview, `bun run test:voice:browser` feeds checked-in synthetic WAV files through the actual WASM decoder and session at real-time pace. It checks negative speech, wake-plus-question, a follow-up, returning to wake, and mute. AI/TTS callbacks in this probe are deterministic; this is not a paid AI, physical microphone or audible playback test.
- WAVs were generated from synthetic example phrases using Google's public text-to-speech endpoint and processed by FFmpeg, with an embedded synthetic/provenance comment. That endpoint is used only to create fixtures, never by the application. The phrase “what can I cook” was decoded as “where can I cook” in the observed fixture run; ingredient words and follow-up were preserved.
- Native compilation and unit tests do not prove Android device speech or Play behaviour. No Android device is available in this sandbox; cloud Chromium has no installed TTS voices. Verify on an authorized signed-in subscriber: grant/deny/revoke mic, wake with an inline question, pantry/allergy answer, multiple follow-ups, barge-in on speaker and headset, recipe navigation, instant mute, lock/background/resume and logout. Verify typed chat and Visual Mode as well.
- This work is a draft, not deployed. Before production release, reconcile the newer production source and existing RevenueCat identity/entitlement differences documented in `subscription-gate.md`, deploy the web changes through the authorized Vercel flow, release the updated Android wrapper, and perform real-device/live-provider tests. The original production reconciliation and account-access blockers remain unresolved.
