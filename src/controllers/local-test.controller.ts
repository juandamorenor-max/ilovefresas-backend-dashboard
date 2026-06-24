import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { ConversationService } from "../services/conversation.service.js";

export class LocalTestController {
  constructor(private readonly conversationService = new ConversationService()) {}

  getPage(_request: Request, response: Response) {
    const welcomeMessage = JSON.stringify(this.conversationService.getWelcomeMessage());

    response.type("html").send(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Simulador Local del Bot</title>
    <style>
      :root {
        --bg: #fff7f1;
        --panel: #ffffff;
        --ink: #2f1c16;
        --accent: #d61f3a;
        --line: #efc8cf;
      }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background: radial-gradient(circle at top, #ffe2dc, var(--bg) 48%);
        color: var(--ink);
      }
      .wrap {
        max-width: 880px;
        margin: 40px auto;
        padding: 0 20px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(92, 43, 48, 0.08);
        overflow: hidden;
      }
      .head {
        padding: 24px;
        border-bottom: 1px solid var(--line);
        background: linear-gradient(135deg, #fff, #fff0f2);
      }
      .head h1 {
        margin: 0 0 8px;
      }
      .meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        font-size: 14px;
      }
      .badge {
        padding: 8px 12px;
        border-radius: 999px;
        background: #fff5f6;
        border: 1px solid var(--line);
      }
      .chat {
        height: 420px;
        overflow: auto;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .msg {
        max-width: 76%;
        padding: 14px 16px;
        border-radius: 18px;
        white-space: pre-wrap;
        line-height: 1.4;
      }
      .user {
        align-self: flex-end;
        background: #d61f3a;
        color: white;
      }
      .bot {
        align-self: flex-start;
        background: #fff7f8;
        border: 1px solid var(--line);
      }
      .debug {
        font-size: 12px;
        opacity: 0.75;
        margin-top: 8px;
      }
      form {
        display: grid;
        grid-template-columns: 180px 1fr auto auto;
        gap: 12px;
        padding: 20px;
        border-top: 1px solid var(--line);
      }
      input, textarea, button {
        font: inherit;
      }
      input, textarea {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px 14px;
      }
      textarea {
        resize: vertical;
        min-height: 54px;
      }
      button {
        border: none;
        border-radius: 14px;
        padding: 0 20px;
        background: var(--accent);
        color: white;
        cursor: pointer;
      }
      button.secondary {
        background: #452422;
      }
      @media (max-width: 720px) {
        form {
          grid-template-columns: 1fr;
        }
        .msg {
          max-width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="head">
          <h1>Simulador Local del Bot</h1>
          <div class="meta">
            <div class="badge">Proveedor IA: ${env.LLM_PROVIDER}</div>
            <div class="badge">Limite por conversacion: ${env.AI_MAX_CALLS_PER_CONVERSATION}</div>
            <div class="badge">Max output tokens: ${env.AI_MAX_OUTPUT_TOKENS}</div>
          </div>
        </div>
        <div id="chat" class="chat"></div>
        <form id="chat-form">
          <input id="phone" name="phone" value="573009998877" />
          <textarea id="message" name="message" placeholder="Escribe aqui como si fueras el cliente..."></textarea>
          <button type="submit">Enviar</button>
          <button class="secondary" id="reset" type="button">Nuevo</button>
        </form>
      </div>
    </div>
    <script>
      const form = document.getElementById("chat-form");
      const chat = document.getElementById("chat");
      const phone = document.getElementById("phone");
      const message = document.getElementById("message");
      const reset = document.getElementById("reset");
      const welcomeMessage = ${welcomeMessage};

      function addMessage(kind, text, debug) {
        const node = document.createElement("div");
        node.className = "msg " + kind;
        node.textContent = text;
        if (debug) {
          const meta = document.createElement("div");
          meta.className = "debug";
          meta.textContent = debug;
          node.appendChild(meta);
        }
        chat.appendChild(node);
        chat.scrollTop = chat.scrollHeight;
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = {
          phone: phone.value.trim(),
          message: message.value.trim()
        };

        if (!payload.phone || !payload.message) {
          return;
        }

        addMessage("user", payload.message);
        message.value = "";

        const response = await fetch("/local-test/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        addMessage(
          "bot",
          data.reply,
          "intentSource=" + data.debug.classificationSource + " | replySource=" + data.debug.replySource + " | state=" + data.debug.state + " | aiUsage=" + data.debug.aiUsageCount
        );
      });

      reset.addEventListener("click", async () => {
        await fetch("/local-test/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone.value.trim() })
        });
        chat.innerHTML = "";
        addMessage("bot", welcomeMessage, "source=stateful | state=idle | aiUsage=0");
      });

      async function startFreshConversation() {
        await fetch("/local-test/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone.value.trim() })
        });
        chat.innerHTML = "";
        addMessage("bot", welcomeMessage, "source=stateful | state=idle | aiUsage=0");
      }

      startFreshConversation();
    </script>
  </body>
</html>`);
  }

  async chat(request: Request, response: Response) {
    const result = await this.conversationService.handleIncomingMessage({
      from: String(request.body.phone ?? "573009998877"),
      to: "local-simulator",
      text: String(request.body.message ?? "")
    });

    response.json({
      reply: result.reply,
      attachments: result.attachments,
      debug: {
        conversationId: result.conversationId,
        state: result.state,
        classificationSource: result.classificationSource,
        replySource: result.replySource,
        aiUsageCount: result.aiUsageCount
      }
    });
  }

  reset(request: Request, response: Response) {
    response.json(
      this.conversationService.resetConversation(String(request.body.phone ?? "573009998877"))
    );
  }
}
