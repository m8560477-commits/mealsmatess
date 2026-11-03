<!-- coderabbit-ai-generated:v1 -->

# Hands-free Mia

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:97e3feecaa9883c287fab5f4ad6229079dd2ec911a82969f2ab15b200f22f236 -->

## Behaviour

For a signed-in Premium user, Mia automatically requests microphone access and listens while the Consumer app is in the foreground. Say “Hey Mia”, “Hi Mia” or “Mia”, followed by a question. If only the name is spoken, Mia acknowledges it and waits for a question. Follow-up questions need no button or repeated name. After 25 seconds without a question, or “thanks Mia”, Mia returns to wake listening. “Mute Mia”, “microphone off”, “stop listening”, or the visible Mute control stop capture; a user's choice to mute is remembered on this device. Re-enable it with the visible control.

The visible bar reports loading, waiting, listening, thinking, speaking, paused, muted, denied, or error. The operating system or browser requests microphone permission; some browsers also need any normal screen interaction before audio can start. Mia resumes automatically after the app returns to the foreground or reconnects unless the user muted her. Permission denials and engine errors do not trigger repeated permission prompts. Hub does not mount the voice provider. This automatic foreground behavior replaces the earlier per-session opt-in at the user's request. It does not keep listening in the background or while the app is closed.



<!-- /coderabbit-ai-generated:v1 -->

## Audio, consent and context

- Vosk's constrained local grammar detects the wake phrase. Only after activation does full English dictation begin. A rolling buffer of at most about four seconds stays in RAM so a question spoken immediately after the wake phrase is preserved; its wake audio is trimmed using local word timestamps. No audio files are recorded, and microphone audio is not uploaded.
- Activated question text and bounded conversation history go to the existing authenticated `/api/mia` endpoint. Existing Firebase, Premium verification, AI credit and rate limits still apply. Ordinary room speech is discarded locally.
- Voice requests use the signed-in user's saved food preferences and pantry through the scoped server adapter. The currently open cooking screen supplies its recipe and zero-based step as data. “Next step”, “previous step”, and “repeat step” navigate/speak the current recipe locally. Suggestions do not silently save meal plans or modify pantry data.
- Conversation history is in memory, shared with existing text chat and cleared on account change. Existing visual answers remain available for typed questions in Visual Mode.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:5e8864284430754ec7699bce5010b698b9983d6a1fa043eb0b9a2dfc1fef09c4 -->

- Spoken replies use ElevenLabs: the server sends Mia’s response text to ElevenLabs and returns audio for browser or Android playback. Microphone audio remains on the device. The authenticated Premium endpoint is rate-limited, limits reply and audio sizes, never exposes the API key, and cancels playback on mute or interruption. Configure server-only `ELEVENLABS_API_KEY`; optionally set `ELEVENLABS_VOICE_ID` to a voice available in that account. The default voice ID is the example in [ElevenLabs’ speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert). If the key, voice, network or playback is unavailable, Mia shows an error and the text answer remains in chat; no device-voice fallback is used.

<!-- /coderabbit-ai-generated:v1 -->
- Microphone tracks, worklet/context and model worker are released on mute, permission failure, page hide, hidden document, Android app backgrounding, logout or loss of eligible Consumer access. Spoken output and pending client AI requests are cancelled. Android's App plugin supplies an explicit native activity listener. No foreground service or closed-app wake listening is implemented.
- Echo cancellation and local comparison against the spoken reply reduce self-triggering; real device acoustics, accents, noise, battery use and interruption reliability still need field testing. This is an English-only first implementation, not a recognition accuracy benchmark.

## Build and model distribution

`bun install --frozen-lockfile` uses pinned `vosk-browser` 0.0.8, `@capacitor-community/text-to-speech` 8.0.2 and `@capacitor/app` 8.1.2. `bun run dev` and `bun run build` first run `scripts/prepare-mia-voice.mjs`. The script downloads the official English small0.15 ZIP, validates SHA-256 `30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498`, and packages it for same-origin hosting at `/mia/vosk-model-small-en-us-0.15.tar.gz`. GNU tar is required by this build script; the verified sandbox and Vercel Linux build environment supply it. An existing verified archive is reused. Failed download or integrity validation fails preparation rather than substituting another recognizer. `bun run voice:prepare` prepares only these assets; an optional first argument points to a previously downloaded ZIP and is still checksum-checked.

The roughly 40 MB model downloads to the browser after enabling and is cached by Vosk in IndexedDB. Model archives are generated build inputs, ignored by Git, and included in the Vercel static output. No access key is needed. Static model and PCM worklet must be served without authentication and without rewriting their paths to HTML.

The Consumer response policy now allows `microphone=(self)` and `worker-src 'self' blob:` to support permission prompts and Vosk's local worker. Hub host/path responses retain `microphone=()` and their previous worker policy. The Android manifest adds RECORD_AUDIO and MODIFY_AUDIO_SETTINGS, and Capacitor handles the runtime permission request.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a4458a087cf54da284c66ba0668b5f8a6c301f64f8533e4378e073de0a3bea0b -->

After native dependency changes, run `bunx cap sync android`, then the existing Java21/SDK36 Gradle build. **The installed Android/Play app needs an updated native binary** with the microphone permissions and App plugin. ElevenLabs audio plays through the WebView; its API key remains on the server. Shipping web JavaScript alone cannot add microphone permission or native lifecycle support to an old installed wrapper. A wrapper without the required lifecycle plugin displays an update message.

<!-- /coderabbit-ai-generated:v1 -->

Sources: [Vosk browser implementation and API](https://github.com/ccoreilly/vosk-browser), [official Vosk model catalog and Apache2.0 licence](https://alphacephei.com/vosk/models), [native TTS plugin](https://github.com/capacitor-community/text-to-speech), [Capacitor app lifecycle API](https://capacitorjs.com/docs/apis/app).

## Verification and remaining release work

- Run `bun run test` and `bunx tsc --noEmit`; voice tests cover activation, pauses, follow-ups, interruption, echo suppression, cancellation, resource cleanup, consent, native backgrounding, history, scoped pantry and Hub policy.
- With `bun run dev` ready and registered in the shared cloud Preview, `bun run test:voice:browser` feeds checked-in synthetic WAV files through the actual WASM decoder and session at real-time pace. It checks negative speech, wake-plus-question, a follow-up, returning to wake, and mute. AI/TTS callbacks in this probe are deterministic; this is not a paid AI, physical microphone or audible playback test.
- WAVs were generated from synthetic example phrases using Google's public text-to-speech endpoint and processed by FFmpeg, with an embedded synthetic/provenance comment. That endpoint is used only to create fixtures, never by the application. The phrase “what can I cook” was decoded as “where can I cook” in the observed fixture run; ingredient words and follow-up were preserved.
- Native compilation and unit tests do not prove Android device speech or Play behaviour. No Android device is available in this sandbox; cloud Chromium has no installed TTS voices. Verify on an authorized signed-in subscriber: grant/deny/revoke mic, wake with an inline question, pantry/allergy answer, multiple follow-ups, barge-in on speaker and headset, recipe navigation, instant mute, lock/background/resume and logout. Verify typed chat and Visual Mode as well.
- This work is a draft, not deployed. Before production release, reconcile the newer production source and existing RevenueCat identity/entitlement differences documented in `subscription-gate.md`, deploy the web changes through the authorized Vercel flow, release the updated Android wrapper, and perform real-device/live-provider tests. The original production reconciliation and account-access blockers remain unresolved.
