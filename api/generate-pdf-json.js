import { generatePDF } from '../generate_pdf.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const R2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body || {};
    const pdfBuffer = await generatePDF(data);

    const key = `analyses/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;

    await R2.send(new PutObjectCommand({
      Bucket:      process.env.R2_BUCKET_NAME,
      Key:         key,
      Body:        pdfBuffer,
      ContentType: 'application/pdf',
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;
    return res.status(200).json({ url, success: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'PDF generation failed', details: error.message });
  }
}
