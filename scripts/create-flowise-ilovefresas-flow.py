import datetime
import json
import sqlite3

WORKSPACE_ID = "034ce6e8-3f54-432c-a46d-4e9078200309"
FLOW_ID = "2f2c7f3a-9a8d-4b70-9bbd-3d3833f78df7"

prompt_template = """Ejecuta exactamente las instrucciones operativas recibidas en el input.

El input ya contiene: mensaje actual, historial, draft, catalogo, pending selections, reglas y contrato JSON.

Tu salida debe ser solamente JSON valido, sin markdown, sin explicaciones externas y sin texto fuera del objeto JSON.

INPUT:
{question}"""

flow = {
    "nodes": [
        {
            "width": 300,
            "height": 513,
            "id": "promptTemplate_0",
            "position": {"x": 520, "y": 220},
            "type": "customNode",
            "data": {
                "id": "promptTemplate_0",
                "label": "Prompt Template",
                "version": 1,
                "name": "promptTemplate",
                "type": "PromptTemplate",
                "baseClasses": ["PromptTemplate", "BaseStringPromptTemplate", "BasePromptTemplate"],
                "category": "Prompts",
                "description": "Schema to represent a basic prompt for an LLM",
                "inputParams": [
                    {
                        "label": "Template",
                        "name": "template",
                        "type": "string",
                        "rows": 4,
                        "placeholder": "What is a good name for a company that makes {product}?",
                        "id": "promptTemplate_0-input-template-string",
                    },
                    {
                        "label": "Format Prompt Values",
                        "name": "promptValues",
                        "type": "json",
                        "optional": True,
                        "acceptVariable": True,
                        "list": True,
                        "id": "promptTemplate_0-input-promptValues-json",
                    },
                ],
                "inputAnchors": [],
                "inputs": {
                    "template": prompt_template,
                    "promptValues": '{"question":"{{question}}"}',
                },
                "outputAnchors": [
                    {
                        "id": "promptTemplate_0-output-promptTemplate-PromptTemplate|BaseStringPromptTemplate|BasePromptTemplate",
                        "name": "promptTemplate",
                        "label": "PromptTemplate",
                        "type": "PromptTemplate | BaseStringPromptTemplate | BasePromptTemplate",
                    }
                ],
                "outputs": {},
                "selected": False,
            },
            "selected": False,
            "positionAbsolute": {"x": 520, "y": 220},
            "dragging": False,
        },
        {
            "id": "chatOpenAI_0",
            "position": {"x": 160, "y": 120},
            "type": "customNode",
            "data": {
                "id": "chatOpenAI_0",
                "label": "OpenAI",
                "version": 8.3,
                "name": "chatOpenAI",
                "type": "ChatOpenAI",
                "baseClasses": ["ChatOpenAI", "BaseChatModel", "BaseLanguageModel", "Runnable"],
                "category": "Chat Models",
                "description": "Wrapper around OpenAI large language models that use the Chat endpoint",
                "inputParams": [
                    {
                        "label": "Connect Credential",
                        "name": "credential",
                        "type": "credential",
                        "credentialNames": ["openAIApi"],
                        "id": "chatOpenAI_0-input-credential-credential",
                    },
                    {
                        "label": "Model Name",
                        "name": "modelName",
                        "type": "asyncOptions",
                        "loadMethod": "listModels",
                        "default": "gpt-4o-mini",
                        "id": "chatOpenAI_0-input-modelName-asyncOptions",
                    },
                    {
                        "label": "Temperature",
                        "name": "temperature",
                        "type": "number",
                        "step": 0.1,
                        "default": 0.9,
                        "optional": True,
                        "id": "chatOpenAI_0-input-temperature-number",
                    },
                    {
                        "label": "Streaming",
                        "name": "streaming",
                        "type": "boolean",
                        "default": True,
                        "optional": True,
                        "additionalParams": True,
                        "id": "chatOpenAI_0-input-streaming-boolean",
                    },
                    {
                        "label": "Max Tokens",
                        "name": "maxTokens",
                        "type": "number",
                        "step": 1,
                        "optional": True,
                        "additionalParams": True,
                        "id": "chatOpenAI_0-input-maxTokens-number",
                    },
                ],
                "inputAnchors": [
                    {
                        "label": "Cache",
                        "name": "cache",
                        "type": "BaseCache",
                        "optional": True,
                        "id": "chatOpenAI_0-input-cache-BaseCache",
                    }
                ],
                "inputs": {
                    "cache": "",
                    "modelName": "gpt-4o-mini",
                    "temperature": 0.2,
                    "streaming": False,
                    "maxTokens": "1400",
                },
                "outputAnchors": [
                    {
                        "id": "chatOpenAI_0-output-chatOpenAI-ChatOpenAI|BaseChatModel|BaseLanguageModel|Runnable",
                        "name": "chatOpenAI",
                        "label": "OpenAI",
                        "description": "Wrapper around OpenAI large language models that use the Chat endpoint",
                        "type": "ChatOpenAI | BaseChatModel | BaseLanguageModel | Runnable",
                    }
                ],
                "outputs": {},
                "selected": False,
            },
            "width": 300,
            "height": 500,
            "selected": False,
            "positionAbsolute": {"x": 160, "y": 120},
            "dragging": False,
        },
        {
            "width": 300,
            "height": 508,
            "id": "llmChain_0",
            "position": {"x": 900, "y": 250},
            "type": "customNode",
            "data": {
                "id": "llmChain_0",
                "label": "LLM Chain",
                "version": 3,
                "name": "llmChain",
                "type": "LLMChain",
                "baseClasses": ["LLMChain", "BaseChain", "Runnable"],
                "category": "Chains",
                "description": "Chain to run queries against LLMs",
                "inputParams": [
                    {
                        "label": "Chain Name",
                        "name": "chainName",
                        "type": "string",
                        "placeholder": "Name Your Chain",
                        "optional": True,
                        "id": "llmChain_0-input-chainName-string",
                    }
                ],
                "inputAnchors": [
                    {
                        "label": "Language Model",
                        "name": "model",
                        "type": "BaseLanguageModel",
                        "id": "llmChain_0-input-model-BaseLanguageModel",
                    },
                    {
                        "label": "Prompt",
                        "name": "prompt",
                        "type": "BasePromptTemplate",
                        "id": "llmChain_0-input-prompt-BasePromptTemplate",
                    },
                    {
                        "label": "Output Parser",
                        "name": "outputParser",
                        "type": "BaseLLMOutputParser",
                        "optional": True,
                        "id": "llmChain_0-input-outputParser-BaseLLMOutputParser",
                    },
                ],
                "inputs": {
                    "model": "{{chatOpenAI_0.data.instance}}",
                    "prompt": "{{promptTemplate_0.data.instance}}",
                    "outputParser": "",
                    "chainName": "I Love Fresas JSON Engine",
                },
                "outputAnchors": [
                    {
                        "name": "output",
                        "label": "Output",
                        "type": "options",
                        "options": [
                            {
                                "id": "llmChain_0-output-llmChain-LLMChain|BaseChain|Runnable",
                                "name": "llmChain",
                                "label": "LLM Chain",
                                "type": "LLMChain | BaseChain | Runnable",
                            },
                            {
                                "id": "llmChain_0-output-outputPrediction-string|json",
                                "name": "outputPrediction",
                                "label": "Output Prediction",
                                "type": "string | json",
                            },
                        ],
                        "default": "llmChain",
                    }
                ],
                "outputs": {"output": "llmChain"},
                "selected": False,
            },
            "selected": False,
            "positionAbsolute": {"x": 900, "y": 250},
            "dragging": False,
        },
    ],
    "edges": [
        {
            "source": "promptTemplate_0",
            "sourceHandle": "promptTemplate_0-output-promptTemplate-PromptTemplate|BaseStringPromptTemplate|BasePromptTemplate",
            "target": "llmChain_0",
            "targetHandle": "llmChain_0-input-prompt-BasePromptTemplate",
            "type": "buttonedge",
            "id": "promptTemplate_0-promptTemplate_0-output-promptTemplate-PromptTemplate|BaseStringPromptTemplate|BasePromptTemplate-llmChain_0-llmChain_0-input-prompt-BasePromptTemplate",
            "data": {"label": ""},
        },
        {
            "source": "chatOpenAI_0",
            "sourceHandle": "chatOpenAI_0-output-chatOpenAI-ChatOpenAI|BaseChatModel|BaseLanguageModel|Runnable",
            "target": "llmChain_0",
            "targetHandle": "llmChain_0-input-model-BaseLanguageModel",
            "type": "buttonedge",
            "id": "chatOpenAI_0-chatOpenAI_0-output-chatOpenAI-ChatOpenAI|BaseChatModel|BaseLanguageModel|Runnable-llmChain_0-llmChain_0-input-model-BaseLanguageModel",
        },
    ],
}

conn = sqlite3.connect("/root/.flowise/database.sqlite")
cur = conn.cursor()
now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
cur.execute("DELETE FROM chat_flow WHERE id = ?", (FLOW_ID,))
cur.execute(
    """
    INSERT INTO chat_flow (
        id, name, flowData, deployed, isPublic, apikeyid, chatbotConfig,
        createdDate, updatedDate, apiConfig, analytic, category, speechToText,
        type, workspaceId, followUpPrompts, textToSpeech
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    (
        FLOW_ID,
        "I Love Fresas - Cerebro Conversacional",
        json.dumps(flow, ensure_ascii=False),
        1,
        0,
        None,
        "{}",
        now,
        now,
        "{}",
        "{}",
        "I Love Fresas",
        None,
        "CHATFLOW",
        WORKSPACE_ID,
        None,
        None,
    ),
)
conn.commit()
conn.close()
print(FLOW_ID)
