import fs from "fs";
import PDFDocument from "pdfkit";

export function generatePDF(data, outputPath) {
  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: 50,
      bottom: 50,
      left: 50,
      right: 50
    }
  });

  doc.pipe(fs.createWriteStream(outputPath));

  doc.fontSize(18).text("deyoo analysis report", {
    align: "center",
    underline: true
  });

  doc.moveDown();

  doc.fontSize(12).text(`Project: ${data.project}`);
  doc.text(`Score: ${data.score}`);
  doc.text(`Verdict: ${data.verdict}`);

  doc.moveDown();
  doc.text("Details:");
  doc.text(data.details);

  doc.end();
}
