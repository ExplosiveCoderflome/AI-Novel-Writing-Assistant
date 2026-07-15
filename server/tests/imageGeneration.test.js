const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { prisma } = require("../dist/db/prisma.js");
const {
  buildImageGenerationRequestBody,
  generateImagesByProvider
} = require("../dist/services/image/provider.js");

test("buildImageGenerationRequestBody constructs correct payload for various providers", () => {
  // Test OpenAI / Standard format
  const standardInput = {
    provider: "openai",
    model: "dall-e-3",
    prompt: "A beautiful scenery",
    negativePrompt: "low quality",
    size: "1024x1024",
    count: 1,
    quality: "hd",
    background: "vibrant",
    moderation: "strict",
    outputFormat: "webp",
    outputCompression: 85
  };
  const standardBody = buildImageGenerationRequestBody(standardInput);
  assert.equal(standardBody.model, "dall-e-3");
  assert.equal(standardBody.prompt, "A beautiful scenery\n\nAvoid: low quality");
  assert.equal(standardBody.n, 1);
  assert.equal(standardBody.size, "1024x1024");
  assert.equal(standardBody.quality, "hd");
  assert.equal(standardBody.background, "vibrant");
  assert.equal(standardBody.moderation, "strict");
  assert.equal(standardBody.output_format, "webp");
  assert.equal(standardBody.output_compression, 85);

  // Test Grok format (requires aspect_ratio mapping)
  const grokInput = {
    provider: "grok",
    model: "grok-imagine-image",
    prompt: "A futuristic city",
    negativePrompt: "",
    size: "1024x1536",
    count: 1
  };
  const grokBody = buildImageGenerationRequestBody(grokInput);
  assert.equal(grokBody.model, "grok-imagine-image");
  assert.equal(grokBody.prompt, "A futuristic city");
  assert.equal(grokBody.n, 1);
  assert.equal(grokBody.aspect_ratio, "2:3");
  assert.equal(grokBody.resolution, "1k");
  assert.equal(grokBody.size, undefined);

  // Test reference images injection
  const refInput = {
    provider: "openai",
    model: "dall-e-3",
    prompt: "Draw character",
    size: "1024x1024",
    count: 1,
    refImages: ["https://example.com/character.png"]
  };
  const refBody = buildImageGenerationRequestBody(refInput);
  assert.equal(refBody.input_image_url, "https://example.com/character.png");
});

test("generateImagesByProvider handles normal URL response, base64 response, and custom Ollama local endpoint", async () => {
  const originalFindUnique = prisma.aPIKey.findUnique;
  const originalFetch = global.fetch;

  try {
    // 1. Test standard OpenAI provider with URL
    prisma.aPIKey.findUnique = async () => ({
      id: "api-key-openai",
      provider: "openai",
      key: "fake-openai-key",
      baseURL: "https://api.openai.com/v1",
      isActive: true
    });

    global.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/images/generations");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Authorization"], "Bearer fake-openai-key");
      const body = JSON.parse(options.body);
      assert.equal(body.prompt, "A majestic cat");

      return new Response(
        JSON.stringify({
          data: [
            { url: "https://example.com/image1.png" },
            { url: "https://example.com/image2.png" }
          ]
        }),
        { status: 200 }
      );
    };

    const urlResult = await generateImagesByProvider({
      provider: "openai",
      model: "dall-e-3",
      prompt: "A majestic cat",
      size: "1024x1024",
      count: 2
    });

    assert.equal(urlResult.provider, "openai");
    assert.equal(urlResult.model, "dall-e-3");
    assert.equal(urlResult.images.length, 2);
    assert.equal(urlResult.images[0].url, "https://example.com/image1.png");
    assert.equal(urlResult.images[1].url, "https://example.com/image2.png");

    // 2. Test base64 format response
    global.fetch = async () => {
      return new Response(
        JSON.stringify({
          data: [
            { b64_json: "iVBORw0KGgoAAAANSUhEUgAA..." }
          ]
        }),
        { status: 200 }
      );
    };

    const b64Result = await generateImagesByProvider({
      provider: "openai",
      model: "dall-e-3",
      prompt: "A majestic cat",
      size: "1024x1024",
      count: 1
    });
    assert.equal(b64Result.images[0].url, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...");

    // 3. Test local Ollama endpoint simulation
    // Ollama is set up with requiresApiKey: false, and default base URL is http://127.0.0.1:11434/v1
    prisma.aPIKey.findUnique = async () => ({
      id: "api-key-ollama",
      provider: "ollama",
      key: "", // Ollama doesn't require API key
      baseURL: "http://127.0.0.1:11434/v1",
      isActive: true
    });

    global.fetch = async (url, options) => {
      assert.equal(url, "http://127.0.0.1:11434/v1/images/generations");
      assert.equal(options.headers["Authorization"], undefined); // No auth token required for Ollama
      return new Response(
        JSON.stringify({
          data: [{ url: "http://localhost:11434/saved/image.png" }]
        }),
        { status: 200 }
      );
    };

    const ollamaResult = await generateImagesByProvider({
      provider: "ollama",
      model: "flux-local",
      prompt: "Ollama styled drawing",
      size: "1024x1024",
      count: 1
    });

    assert.equal(ollamaResult.provider, "ollama");
    assert.equal(ollamaResult.model, "flux-local");
    assert.equal(ollamaResult.images[0].url, "http://localhost:11434/saved/image.png");

  } finally {
    prisma.aPIKey.findUnique = originalFindUnique;
    global.fetch = originalFetch;
  }
});

test("generateImagesByProvider handles API errors appropriately", async () => {
  const originalFindUnique = prisma.aPIKey.findUnique;
  const originalFetch = global.fetch;

  try {
    prisma.aPIKey.findUnique = async () => ({
      id: "api-key-openai",
      provider: "openai",
      key: "fake-openai-key",
      baseURL: "https://api.openai.com/v1",
      isActive: true
    });

    // 1. Error status code
    global.fetch = async () => {
      return new Response("Invalid model chosen", { status: 400 });
    };

    await assert.rejects(
      generateImagesByProvider({
        provider: "openai",
        model: "invalid-model",
        prompt: "A error cat",
        size: "1024x1024",
        count: 1
      }),
      /Image API request failed \(400\): Invalid model chosen/
    );

    // 2. Empty data error
    global.fetch = async () => {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };

    await assert.rejects(
      generateImagesByProvider({
        provider: "openai",
        model: "dall-e-3",
        prompt: "A majestic cat",
        size: "1024x1024",
        count: 1
      }),
      /Image API returned empty data/
    );

  } finally {
    prisma.aPIKey.findUnique = originalFindUnique;
    global.fetch = originalFetch;
  }
});
