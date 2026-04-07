import fs from "fs";
import PDFDocument from "pdfkit";

export function generatePDF(data, outputPath) {
  const doc = new PDFDocument();

  doc.pipe(fs.createWriteStream(outputPath));

  doc.fontSize(20).text("Deyoo Analysis Report", { align: "center" });

  doc.moveDown();

  doc.fontSize(12).text(`Project: ${data.project}`);
  doc.text(`Score: ${data.score}`);
  doc.text(`Verdict: ${data.verdict}`);

  doc.moveDown();
  doc.text("Details:");
  doc.text(data.details);

  doc.end();
}
