import fs from "fs";
import path from "path";
import os from "os";
import { generatePDF } from "../generate_pdf.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let filePath = null;

  try {
    const data = req.body || {};
    filePath = path.join(os.tmpdir(), `output-${Date.now()}.pdf`);

    await generatePDF(data, filePath);

    const fileBuffer = fs.readFileSync(filePath);
    const pdfBase64 = fileBuffer.toString("base64");

    return res.status(200).json({
      success: true,
      filename: "deyoo-report.pdf",
      mime_type: "application/pdf",
      pdf_base64: pdfBase64
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "PDF generation failed",
      details: error.message
    });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
