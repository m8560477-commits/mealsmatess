import OpenAI from "openai";

export async function generateOpenAIImage(prompt: string) {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 });
  const result = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
  });
  const image = result.data?.[0]?.b64_json;
  if (!image) throw new Error("OpenAI returned no recipe image.");

  return {
    bytes: Buffer.from(image, "base64"),
    mediaType: "image/png",
    model: "gpt-image-1",
  };
}
