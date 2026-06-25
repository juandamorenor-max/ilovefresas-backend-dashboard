import { strict as assert } from "node:assert";

process.env.OPENAI_API_KEY = "test-key";
process.env.TELEGRAM_CLIENT_BOT_TOKEN = "test-token";
process.env.OPENAI_VISION_MODEL = "gpt-4o-mini";

const { PaymentProofValidationService } = await import(
  "../services/payment-proof-validation.service.js"
);

interface CaseResult {
  name: string;
  ok: boolean;
  error?: string;
}

const results: CaseResult[] = [];

async function check(name: string, assertion: () => Promise<void>) {
  try {
    await assertion();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown assertion error"
    });
  }
}

class TelegramMock {
  constructor(private readonly mimeType: string) {}

  async downloadFileById() {
    return {
      bytes: new Uint8Array([1, 2, 3, 4]),
      mimeType: this.mimeType
    };
  }
}

async function withFetchMock(outputText: string, assertion: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const text = body.input?.[0]?.content?.find((entry: { type?: string }) => entry.type === "input_text");
    const image = body.input?.[0]?.content?.find((entry: { type?: string }) => entry.type === "input_image");
    assert(
      typeof text?.text === "string" &&
        text.text.includes("No rechaces solo porque el valor no coincide"),
      "vision prompt should not reject proof only because amount differs from expected total"
    );
    assert(
      typeof image?.image_url === "string" && image.image_url.startsWith("data:image/jpeg;base64,"),
      "vision request should receive Telegram photo as image/jpeg data URL"
    );

    return new Response(JSON.stringify({ output_text: outputText }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    await assertion();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await check("acepta foto Telegram octet-stream cuando vision detecta comprobante", async () => {
  await withFetchMock(
    JSON.stringify({
      is_payment_proof: true,
      confidence: 0.92,
      reason: "Se ve pago exitoso, valor y referencia.",
      amount: 10000,
      payment_method: "Nequi",
      status: "exitoso",
      reference: "M9246408"
    }),
    async () => {
      const service = new PaymentProofValidationService(
        new TelegramMock("application/octet-stream") as never
      );
      const result = await service.validate({
        channel: "telegram",
        text: "",
        attachmentType: "image",
        attachmentFileId: "telegram-photo",
        mimeType: "image/telegram-photo",
        expectedPaymentMethod: "Nequi",
        expectedTotal: 10000
      });

      assert.equal(result.source, "openai_vision");
      assert.equal(result.isLikelyPaymentProof, true);
      assert.equal(result.extracted.amount, 10000);
      assert.equal(result.extracted.paymentMethod, "Nequi");
    }
  );
});

await check("rechaza foto random aunque Telegram la descargue como imagen", async () => {
  await withFetchMock(
    JSON.stringify({
      is_payment_proof: false,
      confidence: 0.18,
      reason: "No contiene datos de pago.",
      amount: null,
      payment_method: null,
      status: null,
      reference: null
    }),
    async () => {
      const service = new PaymentProofValidationService(new TelegramMock("image/jpeg") as never);
      const result = await service.validate({
        channel: "telegram",
        text: "",
        attachmentType: "image",
        attachmentFileId: "telegram-photo",
        mimeType: "image/jpeg",
        expectedPaymentMethod: "Nequi",
        expectedTotal: 10000
      });

      assert.equal(result.source, "openai_vision");
      assert.equal(result.isLikelyPaymentProof, false);
    }
  );
});

await check("no envia documentos no imagen a vision", async () => {
  const service = new PaymentProofValidationService(
    new TelegramMock("application/pdf") as never
  );
  const result = await service.validate({
    channel: "telegram",
    text: "",
    attachmentType: "document",
    attachmentFileId: "telegram-doc",
    mimeType: "application/pdf",
    expectedPaymentMethod: "Nequi",
    expectedTotal: 10000
  });

  assert.equal(result.source, "unavailable");
  assert.equal(result.isLikelyPaymentProof, false);
});

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

console.log(
  JSON.stringify(
    {
      total: results.length,
      passed,
      failed,
      results
    },
    null,
    2
  )
);

if (failed > 0) {
  process.exitCode = 1;
}
