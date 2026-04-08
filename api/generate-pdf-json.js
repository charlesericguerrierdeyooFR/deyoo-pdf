import { generatePDF } from '../generate_pdf.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = await getRawBody(req);

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      const sanitized = rawBody.replace(
        /"((?:[^"\\]|\\.)*)"/g,
        (match, content) => {
          const fixed = content
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
          return `"${fixed}"`;
        }
      );
      body = JSON.parse(sanitized);
    }

    const { project = 'Projet', verdict = '', details = '' } = body;

    if (!details) {
      return res.status(400).json({ error: 'PDF generation failed', details: 'No details provided' });
    }

    const pdfBuffer = await generatePDF({ project, verdict, details });

    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const random = Math.random().toString(36).substring(2, 8);
    const key = `analyses/${Date.now()}-${random}.pdf`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;
    return res.status(200).json({ url, success: true });

  } catch (err) {
    console.error('PDF generation error:', err);
    return res.status(500).json({ error: 'PDF generation failed', details: err.message });
  }
}
