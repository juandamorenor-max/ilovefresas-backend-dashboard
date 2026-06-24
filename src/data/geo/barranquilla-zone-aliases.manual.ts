export interface BarranquillaZoneAlias {
  neighborhoodName: string;
  aliases: string[];
  reason: "accent" | "common_short_name" | "official_typo" | "roman_number";
}

export const barranquillaZoneAliases: BarranquillaZoneAlias[] = [
  {
    neighborhoodName: "Altos del Prado",
    aliases: ["Alto Prado", "Alto del Prado"],
    reason: "common_short_name"
  },
  {
    neighborhoodName: "Chiquinquira",
    aliases: ["Chiquinquirá"],
    reason: "accent"
  },
  {
    neighborhoodName: "Paraiso",
    aliases: ["Paraíso"],
    reason: "accent"
  },
  {
    neighborhoodName: "Atlantico",
    aliases: ["Atlántico"],
    reason: "accent"
  },
  {
    neighborhoodName: "Boyaca",
    aliases: ["Boyacá"],
    reason: "accent"
  },
  {
    neighborhoodName: "San Jose",
    aliases: ["San José"],
    reason: "accent"
  },
  {
    neighborhoodName: "Simon Bolivar",
    aliases: ["Simón Bolívar"],
    reason: "accent"
  },
  {
    neighborhoodName: "El Eden",
    aliases: ["El Edén"],
    reason: "accent"
  },
  {
    neighborhoodName: "La Concepcion",
    aliases: ["La Concepción"],
    reason: "accent"
  },
  {
    neighborhoodName: "La Campina",
    aliases: ["La Campiña"],
    reason: "accent"
  },
  {
    neighborhoodName: "Andalucia",
    aliases: ["Andalucía"],
    reason: "accent"
  },
  {
    neighborhoodName: "Santa Monica",
    aliases: ["Santa Mónica"],
    reason: "accent"
  },
  {
    neighborhoodName: "La Arboraya",
    aliases: ["La Alboraya"],
    reason: "official_typo"
  },
  {
    neighborhoodName: "Me Quejo",
    aliases: ["Mequejo"],
    reason: "common_short_name"
  },
  {
    neighborhoodName: "Los Angeles I",
    aliases: ["Los Ángeles I", "Los Angeles 1", "Los Ángeles 1"],
    reason: "roman_number"
  },
  {
    neighborhoodName: "Los Angeles II",
    aliases: ["Los Ángeles II", "Los Angeles 2", "Los Ángeles 2"],
    reason: "roman_number"
  },
  {
    neighborhoodName: "Los Angeles III",
    aliases: ["Los Ángeles III", "Los Angeles 3", "Los Ángeles 3"],
    reason: "roman_number"
  },
  {
    neighborhoodName: "Los Olivos I",
    aliases: ["Los Olivos 1"],
    reason: "roman_number"
  },
  {
    neighborhoodName: "Los Olivos II",
    aliases: ["Los Olivos 2"],
    reason: "roman_number"
  },
  {
    neighborhoodName: "Universal I",
    aliases: ["Universal 1"],
    reason: "roman_number"
  },
  {
    neighborhoodName: "Universal II",
    aliases: ["Universal 2"],
    reason: "roman_number"
  }
];

