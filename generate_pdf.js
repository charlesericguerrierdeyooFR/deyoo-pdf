import fs from "fs";
import PDFDocument from "pdfkit";

export async function generatePDF(data, filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // --- TON CONTENU EXISTANT ---
    doc.fontSize(20).text("deyoo", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Projet : ${data.project || ""}`);
    doc.text(`Score : ${data.score || ""}`);
    doc.text(`Verdict : ${data.verdict || ""}`);
    doc.moveDown();
    doc.text(data.details || "");
    // --- FIN CONTENU ---

    doc.end();

    stream.on("finish", () => resolve(filePath));
    stream.on("error", (err) => reject(err));
  });
}
