import { generatePDF } from "./generate_pdf.js";

const data = {
  project: "test project deyoo",
  score: 72,
  verdict: "Projet intéressant mais à structurer",
  details: "Le projet montre un potentiel réel mais nécessite une meilleure structuration économique et une validation marché plus poussée."
};

generatePDF(data, "output.pdf");
