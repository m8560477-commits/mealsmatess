// Synthetic audio only. This exercises the real local decoder and voice session,
// with deterministic AI/TTS callbacks; it does not use a microphone or a paid API.
window.miaVoiceProbe = { phase: "loading", questions: [], states: [], spoken: [] };
void (async () => {
  const probe = window.miaVoiceProbe;
  const stamp = Date.now();
  const { LocalRecognizer } = await import(`/src/lib/mia/local-recognizer.ts?t=${stamp}`);
  const { MiaVoiceSession } = await import(`/src/lib/mia/voice-session.ts?t=${stamp}`);
  let decoder;
  let events;
  const session = new MiaVoiceSession({
    microphone: async (next, signal) => {
      events = next;
      decoder = await LocalRecognizer.load(16000, next.transcript, signal, next.failed);
      return {
        reset: (mode) => decoder.reset(mode),
        finish: () => decoder.finish(),
        dispose: () => decoder.dispose(),
      };
    },
    changed: (value) => {
      probe.state = value.state;
      probe.states.push(value.state);
    },
    respond: async (text) => {
      probe.questions.push(text);
      return "What ingredients do you have today?";
    },
    speak: async (text) => {
      probe.spoken.push(text);
    },
  });
  try {
    await session.start();
    if (probe.state !== "waiting") throw new Error(`Engine did not start: ${probe.state}`);
    const context = new OfflineAudioContext(1, 16000, 16000);
    const feed = async (name) => {
      const response = await fetch(`/src/test/fixtures/mia/${name}.wav`);
      const audio = await context.decodeAudioData(await response.arrayBuffer());
      const pcm = audio.getChannelData(0);
      for (let i = 0; i < pcm.length; i += 2048) {
        const chunk = pcm.slice(i, i + 2048);
        if (
          Math.sqrt(chunk.reduce((sum, sample) => sum + sample * sample, 0) / chunk.length) > 0.012
        )
          events.activity();
        decoder.accept(chunk);
        await new Promise((resolve) => setTimeout(resolve, 128));
      }
      await new Promise((resolve) => setTimeout(resolve, 1600));
    };
    probe.phase = "decoding";
    await feed("negative");
    if (probe.questions.length !== 0) throw new Error("Ordinary speech activated Mia");
    await feed("wake");
    if (
      probe.questions.length !== 1 ||
      !/chicken/.test(probe.questions[0]) ||
      !/rice/.test(probe.questions[0])
    )
      throw new Error("Wake question was lost");
    await feed("followup");
    if (probe.questions.length !== 2 || !/tomatoes/.test(probe.questions[1]))
      throw new Error("Hands-free follow-up was lost");
    session.endConversation();
    if (probe.state !== "waiting") throw new Error("Did not return to wake listening");
    session.stop();
    probe.phase = "done";
  } finally {
    session.stop();
  }
})().catch((error) => {
  window.miaVoiceProbe.phase = "failed";
  window.miaVoiceProbe.error = error.message;
});
("Local voice probe started");
