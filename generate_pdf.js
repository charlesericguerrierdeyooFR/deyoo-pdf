import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Palette deyoo — couleurs utilisées en accents (pas de fond pleine page pour préserver l'encre en print)
const COLORS = {
  paper:      '#FFFFFF',  // fond de page : blanc (compatible print)
  bgSoft:     '#EDE7D7',  // fond crème pour les encadrés (3 scénarios)
  ink:        '#0D1418',  // texte principal
  inkSoft:    '#3A4048',  // texte secondaire
  mute:       '#8A847A',  // texte discret
  accent:     '#D35A2A',  // terracotta (titres de section, accent verdict, point logo, filet brand)
  accentSoft: '#F6E6DC',  // terracotta très pâle
  border:     '#B8A98A',  // séparateurs
};

// Détecte un scénario "non chiffré" → bascule l'encadré FONDATEUR en mode invitation
const NO_DATA_PATTERN = /(non\s+(calculable|quantifié|évaluable|projeter)|données?\s+insuffisantes?|impossible\s+à\s+(calculer|projeter|évaluer)|nécessite\s+étude\s+de\s+marché|pas\s+(suffisamment|assez)\s+de\s+données)/i;

const FONDATEUR_PROMPT = {
  amount: 'À préciser',
  desc:   'indiquer prix moyen, volume cible mensuel, marge brute estimée et coûts fixes pour calculer ce scénario.',
};

const SECTION_MAP = {
  'INTRODUCTION':            'Introduction',
  'VERDICT':                 'Verdict',
  'VARIABLE CLE ET SEUILS':  'Variable cle et seuils',
  'VARIABLE CLÉ ET SEUILS':  'Variable cle et seuils',
  'LES 5 PILIERS':           'Les 5 piliers',
  'PILIERS':                 'Les 5 piliers',
  'ANALYSE':                 'Analyse',
  'CONCLUSION':              'Conclusion',
  'ACTIONS':                 'Actions',
};

// Chemin vers la police Abhaya Libre (uploadée à la racine du repo depuis Google Fonts)
const __dirname = dirname(fileURLToPath(import.meta.url));
const ABHAYA_PATH = join(__dirname, 'AbhayaLibre-SemiBold.ttf');
const HAS_ABHAYA  = existsSync(ABHAYA_PATH);

function parseSections(text) {
  const sections = {};
  const lines = text.split('\n');
  let current = null;
  let buffer = [];
  for (const line of lines) {
    const trimmed = line.trim();
    let detected = null;
    if (line.startsWith('## ')) {
      const raw = line.replace('## ', '').trim();
      detected = SECTION_MAP[raw.toUpperCase()] || raw;
    } else {
      detected = SECTION_MAP[trimmed.toUpperCase()] || null;
    }
    if (detected) {
      if (current) sections[current] = buffer.join('\n').trim();
      current = detected;
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join('\n').trim();
  return sections;
}

function clean(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
}

export async function generatePDF(data) {
  return new Promise((resolve, reject) => {
    const M = 56;
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: M, bottom: M, left: M, right: M },
      autoFirstPage: false,   // On ajoute la 1ère page manuellement après registerFont
      bufferPages: true,
      info: { Title: 'Étude deyoo', Author: 'deyoo' },
    });

    // Charge Abhaya Libre si présent (upload de la police par l'utilisateur dans /fonts/)
    let LOGO_FONT = 'Times-BoldItalic';
    let LOGO_USE_SKEW = false;
    try {
      if (HAS_ABHAYA) {
        doc.registerFont('Abhaya', ABHAYA_PATH);
        LOGO_FONT = 'Abhaya';
        LOGO_USE_SKEW = true;  // Abhaya n'a pas d'italique natif → faux italique via transform
      }
    } catch (e) {
      // Fallback silencieux sur Times-BoldItalic
    }

    const buffers = [];
    doc.on('data', c => buffers.push(c));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Logo "deyoo" + point terracotta dessiné en haut à droite de chaque page
    function drawTopLogo() {
      const fontSize = 28;
      const dotSize = 6;
      const gap = 5;
      doc.font(LOGO_FONT).fontSize(fontSize).fillColor(COLORS.ink);
      const textW = doc.widthOfString('deyoo');
      const x = doc.page.margins.left + (doc.page.width - doc.page.margins.left - doc.page.margins.right) - textW - gap - dotSize;
      const y = M;

      if (LOGO_USE_SKEW) {
        doc.save();
        doc.translate(x, y);
        doc.transform(1, 0, -0.16, 1, 0, 0);
        doc.text('deyoo', 0, 0, { lineBreak: false });
        doc.restore();
      } else {
        doc.text('deyoo', x, y, { lineBreak: false });
      }

      // Point terracotta dans l'axe du "o" (centré sur la hauteur de la minuscule, pas la baseline)
      const dotX = x + textW + gap;
      const dotY = y + fontSize - 13;  // remonté pour tomber au milieu visuel du "o"
      doc.circle(dotX, dotY, dotSize / 2).fill(COLORS.accent);

      // IMPORTANT : reset complet de la police et de la couleur après le logo
      // sinon les pages auto-créées par overflow continueraient en LOGO_FONT 28pt
      doc.font('Times-Roman').fontSize(11).fillColor(COLORS.ink);

      // Réserve l'espace du logo : le contenu commence au moins 50px en dessous
      doc.y = M + 50;
      doc.x = M;
    }

    // Le logo est dessiné automatiquement à chaque ajout de page
    doc.on('pageAdded', drawTopLogo);
    doc.addPage();  // déclenche drawTopLogo pour la 1ère page

    const W = doc.page.width - M * 2;
    const sections = parseSections(data.details || '');

    const rawProject = data.project;
    const projectName = (rawProject && rawProject !== 'null' && rawProject !== 'undefined' && rawProject.trim() !== '')
      ? rawProject
      : 'Étude de projet';

    // --- HELPERS ---
    function resetX() { doc.x = M; }

    function rule(color = COLORS.border, thickness = 0.5) {
      doc.moveTo(M, doc.y).lineTo(M + W, doc.y)
        .lineWidth(thickness).stroke(color);
      resetX();
    }

    function sectionTitle(label) {
      doc.moveDown(2);
      resetX();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.accent)
        .text(label.toUpperCase(), M, doc.y, { characterSpacing: 2, width: W });
      doc.moveDown(0.5);
      rule();
      doc.moveDown(0.8);
      resetX();
    }

    function body(text, opts = {}) {
      resetX();
      doc.font('Times-Roman').fontSize(11).fillColor(COLORS.ink)
        .text(clean(text), M, doc.y, { lineGap: 5, width: W, ...opts });
      resetX();
    }

    // --- EN-TÊTE PAGE 1 : le logo est déjà dessiné par drawTopLogo (handler pageAdded) ---
    // On laisse plus d'air avant le titre principal
    resetX();
    doc.y = M + 70;

    // --- TITRE PROJET ---
    doc.font('Times-Bold').fontSize(28).fillColor(COLORS.ink)
      .text(projectName, M, doc.y, { align: 'center', width: W });
    resetX();
    doc.moveDown(0.4);

    // --- DATE ---
    doc.font('Times-Italic').fontSize(10).fillColor(COLORS.mute)
      .text(
        new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
        M, doc.y,
        { align: 'center', width: W }
      );
    resetX();
    doc.moveDown(1.5);
    rule(COLORS.border, 1);

    // --- INTRODUCTION ---
    if (sections['Introduction']) {
      sectionTitle('Introduction');
      body(sections['Introduction']);
    }

    // --- VERDICT (barre d'accent terracotta) ---
    if (sections['Verdict']) {
      sectionTitle('Verdict');
      const vy = doc.y;
      doc.font('Times-Roman').fontSize(11).fillColor(COLORS.ink)
        .text(clean(sections['Verdict']), M + 20, vy, { width: W - 20, lineGap: 5 });
      const endY = doc.y;
      doc.rect(M, vy, 3, endY - vy + 4).fill(COLORS.accent);
      doc.y = endY + 20;
      resetX();
    }

    // --- VARIABLE CLE ET SEUILS (avec encadré conditionnel pour FONDATEUR vide) ---
    const vk = sections['Variable cle et seuils'] || sections['Variable cle'] || sections['Variable clé et seuils'] || sections['Variable clé'];
    if (vk) {
      sectionTitle('Variable cle et seuils');
      const vkLines = vk.split('\n');

      const SEUIL_LABELS = ['CONSERVATEUR', 'RÉALISTE', 'REALISTE', 'FONDATEUR'];
      const seuilLines = vkLines.filter(l => SEUIL_LABELS.some(sl => l.toUpperCase().includes(sl)));
      const intro = vkLines.filter(l => !SEUIL_LABELS.some(sl => l.toUpperCase().includes(sl)) && l.trim()).join(' ');

      if (intro) { body(intro); doc.moveDown(1.2); }

      if (seuilLines.length) {
        const bw = (W - 16) / 3;
        const by = doc.y;
        const labels = ['CONSERVATEUR', 'RÉALISTE', 'FONDATEUR'];

        const boxData = seuilLines.slice(0, 3).map((line, i) => {
          const txt = clean(line.replace(/^[A-ZÉÀ]+\s*[:=]\s*/i, ''));
          const parts = txt.split(/\s*[—–]\s*|\s*--\s*/);
          const amount = parts[0]?.trim() || '';
          const desc = parts.slice(1).join(' — ').trim();
          const isEmpty = i === 2 && (NO_DATA_PATTERN.test(amount) || NO_DATA_PATTERN.test(desc));
          return { amount, desc, isEmpty };
        });

        const LABEL_Y = 12;
        const AMOUNT_Y = 30;
        const MAX_AMT_SIZE = 13;
        const SMALL_AMT_SIZE = 11;
        const DESC_GAP = 8;
        const BOT_PAD = 16;

        function fitAmtSize(amount, maxSize = MAX_AMT_SIZE) {
          let size = maxSize;
          while (size > 7) {
            const w = doc.font('Helvetica-Bold').fontSize(size).widthOfString(amount || '');
            if (w <= bw - 20) break;
            size--;
          }
          return size;
        }

        let maxBH = 0;
        boxData.forEach(({ amount, desc, isEmpty }) => {
          const a = isEmpty ? FONDATEUR_PROMPT.amount : amount;
          const d = isEmpty ? FONDATEUR_PROMPT.desc : desc;
          const amtSize = fitAmtSize(a, isEmpty ? SMALL_AMT_SIZE : MAX_AMT_SIZE);
          const amtFont = isEmpty ? 'Times-Italic' : 'Helvetica-Bold';
          let h = AMOUNT_Y;
          h += doc.font(amtFont).fontSize(amtSize).heightOfString(a || ' ', { width: bw - 20 });
          if (d) {
            h += DESC_GAP;
            h += doc.font('Helvetica').fontSize(8).heightOfString(d, { width: bw - 20 });
          }
          h += BOT_PAD;
          if (h > maxBH) maxBH = h;
        });
        const bh = maxBH;

        boxData.forEach(({ amount, desc, isEmpty }, i) => {
          const a = isEmpty ? FONDATEUR_PROMPT.amount : amount;
          const d = isEmpty ? FONDATEUR_PROMPT.desc : desc;
          const bx = M + i * (bw + 8);

          doc.rect(bx, by, bw, bh).fill(COLORS.bgSoft);
          if (isEmpty) {
            doc.save();
            doc.lineWidth(0.8).dash(3, { space: 3 });
            doc.rect(bx + 0.5, by + 0.5, bw - 1, bh - 1).stroke(COLORS.border);
            doc.undash();
            doc.restore();
          }

          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.mute)
            .text(labels[i], bx + 10, by + LABEL_Y, { width: bw - 20, characterSpacing: 1 });

          const amtSize = fitAmtSize(a, isEmpty ? SMALL_AMT_SIZE : MAX_AMT_SIZE);
          const amtFont = isEmpty ? 'Times-Italic' : 'Helvetica-Bold';
          const amtColor = isEmpty ? COLORS.inkSoft : COLORS.ink;
          const amtH = doc.font(amtFont).fontSize(amtSize).heightOfString(a || ' ', { width: bw - 20 });
          doc.font(amtFont).fontSize(amtSize).fillColor(amtColor)
            .text(a || '', bx + 10, by + AMOUNT_Y, { width: bw - 20 });

          if (d) {
            const descY = by + AMOUNT_Y + amtH + DESC_GAP;
            doc.font('Helvetica').fontSize(8).fillColor(isEmpty ? COLORS.mute : COLORS.inkSoft)
              .text(d, bx + 10, descY, { width: bw - 20 });
          }
        });
        doc.y = by + bh + 20;
        resetX();
      }
    }

    // --- LES 5 PILIERS (force le saut de page pour aérer la page 1) ---
    const piliers = sections['Les 5 piliers'];
    if (piliers) {
      doc.addPage();  // Force page break avant Les 5 piliers ; drawTopLogo positionne doc.y = M+40
      sectionTitle('Les 5 piliers');
      const lines = piliers.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const colonIdx = trimmed.indexOf(' : ');
        if (colonIdx > 0 && colonIdx < 70) {
          const t = trimmed.slice(0, colonIdx).trim();
          const d = trimmed.slice(colonIdx + 3).trim();
          resetX();
          // Titre du pilier : taille body, juste en bold pour différencier (hiérarchie sous LES 5 PILIERS)
          doc.font('Times-Bold').fontSize(11).fillColor(COLORS.ink)
            .text(t, M, doc.y, { width: W });
          resetX();
          doc.font('Times-Roman').fontSize(11).fillColor(COLORS.inkSoft)
            .text(clean(d), M, doc.y, { lineGap: 5, width: W });
          doc.moveDown(1);
          resetX();
        } else {
          body(trimmed);
          doc.moveDown(0.5);
        }
      }
    }

    // --- ANALYSE ---
    if (sections['Analyse']) {
      sectionTitle('Analyse');
      const paras = sections['Analyse'].split(/\n{2,}/).filter(p => p.trim());
      paras.forEach((p, i) => {
        body(p);
        if (i < paras.length - 1) doc.moveDown(0.8);
      });
    }

    // --- CONCLUSION ---
    if (sections['Conclusion']) {
      sectionTitle('Conclusion');
      resetX();
      doc.font('Times-Italic').fontSize(11).fillColor(COLORS.ink)
        .text(clean(sections['Conclusion']), M, doc.y, { lineGap: 5, width: W });
      resetX();
    }

    // --- ACTIONS ---
    if (sections['Actions']) {
      sectionTitle('Actions');
      const alines = sections['Actions'].split('\n').filter(l => l.trim());
      let n = 1;
      alines.forEach(line => {
        const trimmed = line.trim();
        const numbered = trimmed.match(/^\d+\.\s+(.+)/);
        if (numbered) {
          const rest = numbered[1];
          const colonIdx = rest.indexOf(' : ');
          if (colonIdx > 0 && colonIdx < 70) {
            // Format "1. Titre : description" — titre en bold, description en body
            const title = rest.slice(0, colonIdx).trim();
            const desc = rest.slice(colonIdx + 3).trim();
            resetX();
            doc.font('Times-Bold').fontSize(11).fillColor(COLORS.ink)
              .text(`${n}. ${clean(title)}`, M, doc.y, { width: W });
            resetX();
            doc.font('Times-Roman').fontSize(11).fillColor(COLORS.ink)
              .text(clean(desc), M, doc.y, { lineGap: 3, width: W });
          } else {
            // Format "1. Verbe complement..." — premier mot en bold, reste en body
            const cleaned = clean(rest);
            const firstSpaceIdx = cleaned.indexOf(' ');
            if (firstSpaceIdx > 0) {
              const firstWord = cleaned.slice(0, firstSpaceIdx);
              const restText = cleaned.slice(firstSpaceIdx);  // garde l'espace de tête
              resetX();
              doc.font('Times-Bold').fontSize(11).fillColor(COLORS.ink)
                .text(`${n}. ${firstWord}`, M, doc.y, { width: W, continued: true, lineGap: 3 });
              doc.font('Times-Roman').fontSize(11).fillColor(COLORS.ink)
                .text(restText, { width: W, lineGap: 3 });
            } else {
              resetX();
              doc.font('Times-Bold').fontSize(11).fillColor(COLORS.ink)
                .text(`${n}. ${cleaned}`, M, doc.y, { width: W });
            }
          }
          doc.moveDown(0.7);
          n++;
        } else if (trimmed) {
          body(trimmed);
          doc.moveDown(0.5);
        }
      });
    }

    // --- FOOTER : "une étude complète deyoo · deyoo.app · page X / Y" ---
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const savedMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Times-Italic').fontSize(8.5).fillColor(COLORS.mute)
        .text(
          `une étude deyoo  ·  deyoo.app  ·  page ${i + 1} / ${totalPages}`,
          M, doc.page.height - 36,
          { width: W, align: 'center', lineBreak: false }
        );
      doc.page.margins.bottom = savedMargin;
      doc.y = M;
    }

    doc.end();
  });
}
