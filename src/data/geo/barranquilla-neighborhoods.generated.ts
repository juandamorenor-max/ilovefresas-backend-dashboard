export type BarranquillaNeighborhoodSource =
  | "alcaldia_barranquilla_localidades_2024";

export interface BarranquillaNeighborhood {
  id: string;
  name: string;
  normalizedName: string;
  locality: string;
  city: "Barranquilla";
  aliases: string[];
  source: BarranquillaNeighborhoodSource;
  coverageStatus: "review_required";
  deliveryFee: null;
  deliveryFeeStatus: "not_configured";
}

const SOURCE: BarranquillaNeighborhoodSource = "alcaldia_barranquilla_localidades_2024";

export function normalizeBarranquillaZoneText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b1\b|\bi\b/g, "i")
    .replace(/\b2\b|\bii\b/g, "ii")
    .replace(/\b3\b|\biii\b/g, "iii")
    .replace(/[^\p{L}0-9\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const rawNeighborhoods: Array<{ locality: string; names: string[] }> = [
  {
    locality: "Suroccidente",
    names: [
      "Alfonso Lopez",
      "Bernardo Hoyos",
      "Buena Esperanza",
      "California",
      "Caribe Verde",
      "Carlos Meisel",
      "Ciudad Modesto",
      "Ciudadela de la Salud",
      "Ciudadela de Paz",
      "Colina Campestre",
      "Cordialidad",
      "Corregimiento de Juan Mina",
      "Cuchilla de Villate",
      "El Bosque",
      "El Carmen",
      "El Eden",
      "El Pueblo",
      "El Romance",
      "El Rubi",
      "El Silencio",
      "El Valle",
      "Evaristo Sourdis",
      "Gerlein y Villate",
      "Kalamary",
      "La Ceiba",
      "La Esmeralda",
      "La Florida",
      "La Gloria",
      "La Libertad",
      "La Manga",
      "La Paz",
      "La Pradera",
      "Las Colinas",
      "Las Estrellas",
      "Las Malvinas",
      "Las Terrazas",
      "Lipaya",
      "Loma Fresca",
      "Los Andes",
      "Los Angeles I",
      "Los Angeles II",
      "Los Angeles III",
      "Los Olivos I",
      "Los Olivos II",
      "Los Pinos",
      "Los Rosales",
      "Lucero",
      "Me Quejo",
      "Mercedes Sur",
      "Nueva Colombia",
      "Nueva Granada",
      "Olaya",
      "Pinar del Rio",
      "Por Fin",
      "Pumarejo",
      "San Felipe",
      "San Isidro",
      "San Pedro Alejandrino",
      "San Pedro Sector I",
      "Santo Domingo",
      "Siete de Agosto",
      "Villa del Rosario",
      "Villa Flor",
      "Villas de la Cordialidad",
      "Villas de San Pablo"
    ]
  },
  {
    locality: "Metropolitana",
    names: [
      "Buenos Aires",
      "Carrizal",
      "Cevillar",
      "Ciudadela 20 de Julio",
      "El Santuario",
      "Kennedy",
      "La Sierra",
      "La Sierrita",
      "Las Americas",
      "Las Cayenas",
      "Las Gardenias",
      "Las Granjas",
      "Los Continentes",
      "Los Girasoles",
      "San Luis",
      "Santa Maria",
      "Santo Domingo de Guzman",
      "Sevilla Real",
      "Siete de Abril",
      "Sinai",
      "Veinte de Julio",
      "Villa San Carlos",
      "Villa San Pedro",
      "Villa Sevilla",
      "Villa Valery"
    ]
  },
  {
    locality: "Suroriente",
    names: [
      "Atlantico",
      "Bellarena",
      "Boyaca",
      "Chiquinquira",
      "El Campito",
      "El Ferry",
      "El Limon",
      "El Milagro",
      "El Parque Sector Barranquilla",
      "Jose Antonio Galan",
      "La Arboraya",
      "La Chinita",
      "La Luz",
      "La Magdalena",
      "La Union",
      "La Victoria",
      "Las Dunas",
      "Las Nieves",
      "Las Palmas",
      "Las Palmeras",
      "Los Laureles",
      "Los Trupillos",
      "Moderno",
      "Montes",
      "Pasadena",
      "Primero de Mayo",
      "Rebolo",
      "San Jose",
      "San Nicolas",
      "San Roque",
      "Santa Helena",
      "Simon Bolivar",
      "Tayrona",
      "Universal I",
      "Universal II",
      "Villa Blanca",
      "Villa del Carmen"
    ]
  },
  {
    locality: "Norte-Centro Historico",
    names: [
      "Abajo",
      "Alameda del Rio",
      "Altos del Prado",
      "America",
      "Barlovento",
      "Bellavista",
      "Bethania",
      "Boston",
      "Campo Alegre",
      "Centro",
      "Ciudad Jardin",
      "Colombia",
      "El Castillo",
      "El Golf",
      "El Porvenir",
      "El Prado",
      "El Recreo",
      "El Rosario",
      "El Tabor",
      "Granadillo",
      "La Campina",
      "La Concepcion",
      "La Cumbre",
      "La Loma",
      "Las Colinas",
      "Las Delicias",
      "Las Mercedes",
      "Las Nubes",
      "Los Alpes",
      "Los Jobos",
      "Los Nogales",
      "Miramar",
      "Modelo",
      "Montecristo",
      "Nuevo Horizonte",
      "Paraiso",
      "San Francisco",
      "Santa Ana",
      "Villa Country",
      "Villanueva",
      "Zona Franca",
      "Zona Industrial"
    ]
  },
  {
    locality: "Riomar",
    names: [
      "Altamira",
      "Altos de Riomar",
      "Altos del Limon",
      "Andalucia",
      "Corregimiento Eduardo Santos La Playa",
      "El Limoncito",
      "El Poblado",
      "La Floresta",
      "Las Flores",
      "Las Tres Ave Maria",
      "Riomar",
      "San Salvador",
      "San Vicente",
      "Santa Monica",
      "Siape",
      "Solaire Norte",
      "Villa Campestre",
      "Villa Carolina",
      "Villa del Este",
      "Villa Santos"
    ]
  }
];

function toId(name: string) {
  return `baq_${normalizeBarranquillaZoneText(name).replace(/\s+/g, "_")}`;
}

const neighborhoodsByName = new Map<string, BarranquillaNeighborhood>();

for (const group of rawNeighborhoods) {
  for (const name of group.names) {
    const normalizedName = normalizeBarranquillaZoneText(name);
    if (neighborhoodsByName.has(normalizedName)) {
      continue;
    }

    neighborhoodsByName.set(normalizedName, {
      id: toId(`${group.locality} ${name}`),
      name,
      normalizedName,
      locality: group.locality,
      city: "Barranquilla" as const,
      aliases: [],
      source: SOURCE,
      coverageStatus: "review_required" as const,
      deliveryFee: null,
      deliveryFeeStatus: "not_configured" as const
    });
  }
}

export const barranquillaNeighborhoods: BarranquillaNeighborhood[] = [
  ...neighborhoodsByName.values()
];
