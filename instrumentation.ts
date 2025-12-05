export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { Langfuse } = await import("langfuse");

    const langfuse = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    });

    // Verify connection
    console.log("Langfuse initialized");

    // Store the instance globally for use in API routes
    (global as any).langfuse = langfuse;
  }
}
