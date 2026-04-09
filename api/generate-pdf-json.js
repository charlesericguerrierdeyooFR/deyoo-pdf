import { generatePDF } from '../generate_pdf.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { jsonrepair } from 'jsonrepair';

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
    const contentType = req.headers['content-type'] || '';
    let body;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody);
      body = {
        project: params.get('project') || 'Projet',
        verdict: params.get('verdict') || '',
        details: params.get('details') || '',
      };
    } else if (contentType.includes('multipart/form-data')) {
      const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
      if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const parts = {};
        const delimiter = `--${boundary}`;
        const chunks = rawBody.split(delimiter);
        for (const chunk of chunks) {
          if (!chunk || chunk.trim() === '--' || chunk.trim() === '') continue;
          const separatorIdx = chunk.indexOf('\r\n\r\n');
          if (separatorIdx === -1) continue;
          const headers = chunk.slice(0, separatorIdx);
          const value = chunk.slice(separatorIdx + 4).replace(/\r\n$/, '');
          const nameMatch = headers.match(/name="([^"]+)"/);
          if (nameMatch) parts[nameMatch[1]] = value;
        }
        body = {
          project: parts.project || 'Projet',
          verdict: parts.verdict || '',
          details: parts.details || '',
        };
      } else {
        return res.status(400).json({ error: 'Missing multipart boundary' });
      }
    } else {
      try {
        body = JSON.parse(rawBody);
      } catch (e) {
        try {
          body = JSON.parse(jsonrepair(rawBody));
        } catch (e2) {
          return res.status(400).json({ error: 'Invalid JSON', details: e2.message });
        }
      }
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
