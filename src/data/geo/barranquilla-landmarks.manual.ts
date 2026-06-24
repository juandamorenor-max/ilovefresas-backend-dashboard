export interface BarranquillaLandmark {
  id: string;
  name: string;
  aliases: string[];
  city: "Barranquilla";
  assignedNeighborhoodId: null;
  confidencePolicy: "landmark_only_review_required";
}

export const barranquillaLandmarks: BarranquillaLandmark[] = [
  {
    id: "landmark_buenavista",
    name: "Buenavista",
    aliases: ["Buenavista", "Centro Comercial Buenavista", "CC Buenavista", "por Buenavista"],
    city: "Barranquilla",
    assignedNeighborhoodId: null,
    confidencePolicy: "landmark_only_review_required"
  },
  {
    id: "landmark_exito",
    name: "Exito",
    aliases: ["Exito", "Éxito", "por el Exito", "por el Éxito"],
    city: "Barranquilla",
    assignedNeighborhoodId: null,
    confidencePolicy: "landmark_only_review_required"
  }
];

