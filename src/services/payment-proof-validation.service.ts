import { env } from "../config/env.js";
import { parseJsonFromText } from "../utils/json.js";
import { logger } from "../utils/logger.js";
import { TelegramService } from "./telegram.service.js";

type BotChannel = "telegram" | "whatsapp";

export interface PaymentProofValidationInput {
  channel: BotChannel;
  text: string;
  caption?: string | null;
  attachmentType?: "image" | "document" | null;
  attachmentFileId?: string | null;
  mimeType?: string | null;
  expectedPaymentMethod?: string | null;
  expectedTotal?: number | null;
}

export interface PaymentProofValidationResult {
  isLikelyPaymentProof: boolean;
  confidence: number;
  reason: string;
  source: "heuristic" | "openai_vision" | "unavailable";
  extracted: {
    amount?: number | null;
    paymentMethod?: string | null;
    status?: string | null;
    reference?: string | null;
  };
}

interface VisionProofOutput {
  is_payment_proof?: boolean;
  confidence?: number;
  reason?: string;
  amount?: number | null;
  payment_method?: string | null;
  status?: string | null;
  reference?: string | null;
}

interface DownloadedAttachment {
  dataUrl: string;
  mimeType: string;
}

export class PaymentProofValidationService {
  constructor(private readonly telegramService = new TelegramService()) {}

  async validate(input: PaymentProofValidationInput): Promise<PaymentProofValidationResult> {
    const heuristic = this.validateTextSignal(input);
    if (!input.attachmentType) {
      return heuristic;
    }

    if (heuristic.isLikelyPaymentProof && heuristic.confidence >= 0.78) {
      return heuristic;
    }

    const downloaded = await this.downloadAttachment(input);
    if (!downloaded) {
      return {
        isLikelyPaymentProof: false,
        confidence: 0.2,
        reason: "No se pudo leer el archivo adjunto para validar visualmente el comprobante.",
        source: "unavailable",
        extracted: {}
      };
    }

    const vision = await this.validateWithVision(input, downloaded);
    return vision ?? {
      isLikelyPaymentProof: false,
      confidence: 0.2,
      reason: "La validacion visual no estuvo disponible.",
      source: "unavailable",
      extracted: {}
    };
  }

  private validateTextSignal(input: PaymentProofValidationInput): PaymentProofValidationResult {
    const text = [input.text, input.caption].filter(Boolean).join(" ").toLowerCase();
    const proofTerms = [
      "comprobante",
      "transferencia",
      "transaccion",
      "transacción",
      "pago exitoso",
      "exitosa",
      "aprobada",
      "recibo",
      "soporte",
      "referencia"
    ];
    const methodTerms = ["nequi", "bancolombia", "bre-b", "breb", "banco"];
    const amountPattern = /\$?\s?\d{2,3}(?:[.,]\d{3})+|\$?\s?\d{5,7}/;
    const hasProofTerm = proofTerms.some((term) => text.includes(term));
    const hasMethod = methodTerms.some((term) => text.includes(term));
    const hasAmount = amountPattern.test(text);

    if (hasProofTerm && (hasMethod || hasAmount || input.attachmentType)) {
      return {
        isLikelyPaymentProof: true,
        confidence: hasMethod && hasAmount ? 0.88 : 0.8,
        reason: "El texto/caption contiene señales claras de comprobante de pago.",
        source: "heuristic",
        extracted: {
          paymentMethod: this.extractPaymentMethod(text),
          amount: this.extractAmount(text)
        }
      };
    }

    return {
      isLikelyPaymentProof: false,
      confidence: 0.35,
      reason: input.attachmentType
        ? "Hay adjunto, pero no contiene señales suficientes de comprobante sin validacion visual."
        : "No hay señales suficientes de comprobante de pago.",
      source: "heuristic",
      extracted: {}
    };
  }

  private async downloadAttachment(
    input: PaymentProofValidationInput
  ): Promise<DownloadedAttachment | null> {
    if (!input.attachmentFileId) {
      return null;
    }

    if (input.channel === "telegram") {
      if (!env.TELEGRAM_CLIENT_BOT_TOKEN) {
        return null;
      }

      try {
        const file = await this.telegramService.downloadFileById(
          env.TELEGRAM_CLIENT_BOT_TOKEN,
          input.attachmentFileId
        );
        const mimeType = this.resolveDownloadedImageMimeType(input, file.mimeType);
        if (!mimeType) {
          return null;
        }

        return {
          mimeType,
          dataUrl: `data:${mimeType};base64,${Buffer.from(file.bytes).toString("base64")}`
        };
      } catch (error) {
        logger.warn("Telegram proof attachment download failed", {
          error: error instanceof Error ? error.message : "unknown"
        });
        return null;
      }
    }

    // WhatsApp Business support is intentionally centralized here. The order
    // flow does not change when we add Graph media download for this branch.
    return null;
  }

  private resolveDownloadedImageMimeType(
    input: PaymentProofValidationInput,
    downloadedMimeType: string
  ) {
    if (downloadedMimeType.startsWith("image/")) {
      return downloadedMimeType;
    }

    const declaredMimeType = input.mimeType?.toLowerCase() ?? "";
    if (declaredMimeType.startsWith("image/")) {
      return declaredMimeType === "image/telegram-photo" ? "image/jpeg" : declaredMimeType;
    }

    if (input.attachmentType === "image" && downloadedMimeType === "application/octet-stream") {
      return "image/jpeg";
    }

    return null;
  }

  private async validateWithVision(
    input: PaymentProofValidationInput,
    attachment: DownloadedAttachment
  ): Promise<PaymentProofValidationResult | null> {
    if (!env.OPENAI_API_KEY) {
      return null;
    }

    const prompt = [
      "Analiza la imagen y decide si parece un comprobante de pago real enviado por un cliente.",
      "No verifiques si el dinero entro al banco. Solo valida si visualmente parece comprobante.",
      "Debe tener señales como app/banco, estado exitoso/aprobado, valor, referencia, destinatario o fecha.",
      "Si parece selfie, foto de comida, captura irrelevante, meme, menu o imagen borrosa sin datos de pago, rechaza.",
      `Metodo esperado: ${input.expectedPaymentMethod ?? "desconocido"}.`,
      `Total esperado: ${input.expectedTotal ?? "desconocido"}.`,
      "Devuelve solo JSON con estos campos:",
      '{"is_payment_proof":true,"confidence":0.0,"reason":"razon corta","amount":null,"payment_method":null,"status":null,"reference":null}'
    ].join("\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: env.OPENAI_VISION_MODEL,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: prompt },
                { type: "input_image", image_url: attachment.dataUrl }
              ]
            }
          ],
          max_output_tokens: 500
        })
      });

      if (!response.ok) {
        logger.warn("OpenAI payment proof vision request failed", {
          status: response.status,
          body: (await response.text()).slice(0, 500)
        });
        return null;
      }

      const data = (await response.json()) as {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
      };
      const outputText =
        data.output_text ??
        data.output
          ?.flatMap((item) => item.content ?? [])
          .map((content) => content.text)
          .find((text) => Boolean(text));
      const parsed = outputText ? parseJsonFromText<VisionProofOutput>(outputText) : null;
      if (!parsed) {
        return null;
      }

      return {
        isLikelyPaymentProof: Boolean(parsed.is_payment_proof) && Number(parsed.confidence ?? 0) >= 0.65,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
        reason: parsed.reason ?? "Validacion visual de comprobante.",
        source: "openai_vision",
        extracted: {
          amount: parsed.amount ?? null,
          paymentMethod: parsed.payment_method ?? null,
          status: parsed.status ?? null,
          reference: parsed.reference ?? null
        }
      };
    } catch (error) {
      logger.warn("OpenAI payment proof vision request errored", {
        error: error instanceof Error ? error.message : "unknown"
      });
      return null;
    }
  }

  private extractPaymentMethod(text: string) {
    if (text.includes("nequi")) return "Nequi";
    if (text.includes("bancolombia") || text.includes("banco")) return "Bancolombia";
    if (text.includes("bre-b") || text.includes("breb")) return "Bre-B";
    return null;
  }

  private extractAmount(text: string) {
    const match = text.match(/\$?\s?(\d{2,3}(?:[.,]\d{3})+|\d{5,7})/);
    if (!match) {
      return null;
    }

    const amount = Number(match[1].replace(/[.,]/g, ""));
    return Number.isFinite(amount) ? amount : null;
  }
}
