/** Decode bounded newline-delimited JSON across arbitrary UTF-8/network chunk boundaries. */
export async function* readJsonLines(
  body: ReadableStream<Uint8Array>,
  maxChars = 256_000,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let received = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      const text = decoder.decode(value, { stream: !done });
      received += text.length;
      if (received > maxChars)
        throw new Error("The AI response was too large. Please try a shorter question.");
      buffer += text;
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (line) yield JSON.parse(line);
      }
      if (done) {
        if (buffer.trim()) yield JSON.parse(buffer);
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
