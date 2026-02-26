export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { Langfuse } = await import("langfuse");

    const langfuse = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    });

    console.log("Langfuse initialized");

    (global as Record<string, unknown>).langfuse = langfuse;
  }
}
