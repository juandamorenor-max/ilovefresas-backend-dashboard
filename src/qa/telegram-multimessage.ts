import { strict as assert } from "node:assert";

process.env.NODE_ENV = "test";
process.env.TELEGRAM_CLIENT_BOT_TOKEN = "qa-telegram-token";

const { TelegramInboundBufferService } = await import(
  "../services/telegram-inbound-buffer.service.js"
);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const batchTurns: Array<Record<string, unknown>> = [];
const batchReplies: string[] = [];
const batchBuffer = new TelegramInboundBufferService(
  {
    handleTurn: async (input: Record<string, unknown>) => {
      batchTurns.push(input);
      return {
        responseText: "Pregunta final del lote",
        shouldSendReply: true,
        source: "qa_batch"
      };
    }
  } as never,
  {
    sendMessage: async (_token: string, _chatId: string | number, text: string) => {
      batchReplies.push(text);
      return {};
    },
    sendChatAction: async () => true
  } as never,
  {
    debounceMs: 5,
    replyGraceMs: 2,
    maxBatchSize: 5,
    seenMessageTtlMs: 60_000
  }
);

batchBuffer.enqueue({
  chatId: "batch-chat",
  externalMessageId: "101",
  sequenceNumber: 101,
  text: "durazno"
});
batchBuffer.enqueue({
  chatId: "batch-chat",
  externalMessageId: "102",
  sequenceNumber: 102,
  text: "chocolate y leche condensada"
});
await batchBuffer.waitForIdle("batch-chat");

assert.equal(batchTurns.length, 1);
assert.equal(
  batchTurns[0]?.text,
  "durazno\nchocolate y leche condensada"
);
assert.deepEqual(batchReplies, ["Pregunta final del lote"]);

const firstTurnStarted = deferred();
const releaseFirstTurn = deferred();
const sequentialTurns: Array<Record<string, unknown>> = [];
const sequentialReplies: string[] = [];
const sequentialBuffer = new TelegramInboundBufferService(
  {
    handleTurn: async (input: Record<string, unknown>) => {
      sequentialTurns.push(input);
      if (sequentialTurns.length === 1) {
        firstTurnStarted.resolve();
        await releaseFirstTurn.promise;
        return {
          responseText: "Respuesta intermedia obsoleta",
          shouldSendReply: true,
          source: "qa_intermediate"
        };
      }

      return {
        responseText: "Respuesta final vigente",
        shouldSendReply: true,
        source: "qa_final"
      };
    }
  } as never,
  {
    sendMessage: async (_token: string, _chatId: string | number, text: string) => {
      sequentialReplies.push(text);
      return {};
    },
    sendChatAction: async () => true
  } as never,
  {
    debounceMs: 5,
    replyGraceMs: 2,
    maxBatchSize: 5,
    seenMessageTtlMs: 60_000
  }
);

sequentialBuffer.enqueue({
  chatId: "sequential-chat",
  externalMessageId: "201",
  sequenceNumber: 201,
  text: "durazno"
});
await firstTurnStarted.promise;
sequentialBuffer.enqueue({
  chatId: "sequential-chat",
  externalMessageId: "202",
  sequenceNumber: 202,
  text: "chocolate y leche condensada"
});
releaseFirstTurn.resolve();
await sequentialBuffer.waitForIdle("sequential-chat");

assert.equal(sequentialTurns.length, 2);
assert.equal(sequentialTurns[0]?.text, "durazno");
assert.equal(sequentialTurns[1]?.text, "chocolate y leche condensada");
assert.deepEqual(sequentialReplies, ["Respuesta final vigente"]);

const duplicate = sequentialBuffer.enqueue({
  chatId: "sequential-chat",
  externalMessageId: "202",
  sequenceNumber: 202,
  text: "chocolate y leche condensada"
});
assert.deepEqual(duplicate, {
  accepted: true,
  duplicate: true,
  queued: false
});

console.log("telegram-multimessage QA OK");
