# Flowise Agentflow V3

Flowise sigue siendo la superficie visual de orquestacion. Postgres y el backend
son la fuente de verdad de estado, catalogo, precios, disponibilidad y ordenes.

## Regla de ejecucion

1. Backend carga `TurnContextV3`.
2. Supervisor elige como maximo un especialista en un turno normal.
3. El especialista propone operaciones, nunca estado final.
4. Supervisor devuelve `TurnDecisionV3` estricto.
5. Backend valida, aplica y compone cualquier mensaje determinista.

Flow State no se usa como memoria entre mensajes. El contexto se rehidrata en
cada prediccion mediante `overrideConfig.vars`.

## Archivos

- `agentflow-v3.spec.json`: contrato versionado del canvas a construir.
- `prompts/`: instrucciones pequenas por responsabilidad.
- `current-agentflow-export.json`: fotografia real del V2 antes de activar V3.
- `v3-shadow-agentflow-import.json`: copia V3 separada, lista para importar.

Regenera el import desde la fotografia actual con:

```bash
npm run flowise:build-v3
```

Importa el archivo V3 como un Agentflow nuevo. No reemplaces el ID productivo.
Configura su ID en `FLOWISE_V3_AGENTFLOW_ID` y activa
`FLOWISE_V3_SHADOW=true`. El backend validara y guardara sus decisiones, pero no
las aplicara ni se las enviara al cliente mientras siga en shadow mode.

## Modelos

- Normal: `gpt-5.4-mini`.
- Caso ambiguo/eval: `gpt-5.5` desde backend, no como segundo redactor.
- Maximo normal: supervisor + un especialista.
