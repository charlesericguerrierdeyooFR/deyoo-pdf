import express from "express";
import { generatePDF } from "./generate_pdf.js";
import fs from "fs";

const app = express();
app.use(express.json());

app.post("/generate-pdf", (req, res) => {
  const data = req.body;
  const filePath = "output.pdf";

  generatePDF(data, filePath);

  setTimeout(() => {
    res.download(filePath);
  }, 500);
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
