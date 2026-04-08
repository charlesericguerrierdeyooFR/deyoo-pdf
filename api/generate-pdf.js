import fs from "fs";
import path from "path";
import os from "os";
import { generatePDF } from "../generate_pdf.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};
    const filePath = path.join(os.tmpdir(), `output-${Date.now()}.pdf`);

    await generatePDF(data, filePath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="deyoo-report.pdf"`
    );

    const fileBuffer = fs.readFileSync(filePath);
    res.status(200).send(fileBuffer);
  } catch (error) {
    res.status(500).json({
      error: "PDF generation failed",
      details: error.message
    });
  }
}
