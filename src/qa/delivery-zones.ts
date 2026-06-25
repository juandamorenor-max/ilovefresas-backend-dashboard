import { strict as assert } from "node:assert";
import { barranquillaNeighborhoods } from "../data/geo/barranquilla-neighborhoods.generated.js";
import { resolveBarranquillaZone } from "../data/geo/barranquilla-zone-resolver.js";

interface CaseResult {
  name: string;
  ok: boolean;
  error?: string;
}

const results: CaseResult[] = [];

async function check(name: string, assertion: () => void) {
  try {
    assertion();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown assertion error"
    });
  }
}

function expectMatch(input: string, expectedName: string) {
  const resolution = resolveBarranquillaZone(input);
  assert.equal(resolution.status, "match");
  if (resolution.status === "match") {
    assert.equal(resolution.zone.name, expectedName);
    assert.equal(resolution.coverageStatus, "review_required");
    assert.equal(resolution.deliveryFee, null);
    assert.equal(resolution.deliveryFeeStatus, "not_configured");
  }
}

function expectStatus(input: string, status: ReturnType<typeof resolveBarranquillaZone>["status"]) {
  const resolution = resolveBarranquillaZone(input);
  assert.equal(resolution.status, status);
}

await check("carga barrios oficiales de Alcaldia", () => {
  assert(barranquillaNeighborhoods.length >= 180);
});

await check("Alto Prado resuelve por alias conservador", () => {
  expectMatch("Alto Prado", "Altos del Prado");
});

await check("Villa Country exacto", () => {
  expectMatch("Villa Country", "Villa Country");
});

await check("Riomar exacto", () => {
  expectMatch("Riomar", "Riomar");
});

await check("Chiquinquira sin tilde", () => {
  expectMatch("Chiquinquira", "Chiquinquira");
});

await check("Chiquinquirá con tilde", () => {
  expectMatch("Chiquinquirá", "Chiquinquira");
});

await check("Paraiso sin tilde", () => {
  expectMatch("Paraiso", "Paraiso");
});

await check("Paraíso con tilde", () => {
  expectMatch("Paraíso", "Paraiso");
});

await check("barrio con typo conservador", () => {
  expectMatch("Altos del Praddo", "Altos del Prado");
});

await check("barrio real publico Riomar La Castellana", () => {
  expectMatch("La Castellana", "La Castellana");
});

await check("barrio real publico Norte Centro Historico El Country", () => {
  expectMatch("El Country", "El Country");
});

await check("barrio real publico Metropolitana Realengo", () => {
  expectMatch("Realengo", "Realengo");
});

await check("barrio real publico Suroccidente Pastoral Social", () => {
  expectMatch("Pastoral Social", "Pastoral Social");
});

await check("barrio real publico Suroriente Ciudad Cisneros", () => {
  expectMatch("Ciudad Cisneros", "Ciudad Cisneros");
});

await check("variante publica Ciudadela Veinte de Julio", () => {
  expectMatch("Ciudadela Veinte de Julio", "Ciudadela 20 de Julio");
});

await check("variante publica Bella Arena", () => {
  expectMatch("Bella Arena", "Bellarena");
});

await check("por Buenavista es landmark, no barrio definitivo", () => {
  expectStatus("por Buenavista", "landmark_only");
});

await check("por el Exito es landmark, no barrio definitivo", () => {
  expectStatus("por el Éxito", "landmark_only");
});

await check("norte de Barranquilla no es barrio final", () => {
  expectStatus("norte de Barranquilla", "not_found");
});

await check("Barranquilla no es barrio final", () => {
  expectStatus("Barranquilla", "not_found");
});

await check("direccion sin barrio no asigna zona", () => {
  expectStatus("Cra 45 #82-100", "not_found");
});

await check("barrio mas pago extrae barrio conocido", () => {
  expectMatch("La Paz y Nequi", "La Paz");
});

await check("direccion mas pago sin barrio no asigna zona", () => {
  expectStatus("Cra 45 #82-100 pago Nequi", "not_found");
});

await check("zona desconocida no asigna barrio", () => {
  expectStatus("barrio Las Flores del Norte", "not_found");
});

await check("municipio cercano no configurado queda fuera de ciudad", () => {
  expectStatus("Soledad", "outside_city");
});

await check("cambio de direccion reconoce ultima zona fuerte", () => {
  expectMatch("cambia direccion a carrera 10 #20-30 La Paz", "La Paz");
});

await check("Los Angeles numero arabigo resuelve romano", () => {
  expectMatch("Los Angeles 2", "Los Angeles II");
});

await check("Las Colinas existe como barrio y se acepta", () => {
  expectMatch("Las Colinas", "Las Colinas");
});

await check("Cabecera del Llano no es barrio de Barranquilla", () => {
  expectStatus("Cabecera del Llano", "not_found");
});

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

console.log(
  JSON.stringify(
    {
      total: results.length,
      passed,
      failed,
      neighborhoodsLoaded: barranquillaNeighborhoods.length,
      results
    },
    null,
    2
  )
);

if (failed > 0) {
  process.exitCode = 1;
}
