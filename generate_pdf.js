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

// Les 3 scénarios sont TOUJOURS chiffrés par le modèle (CONSERVATEUR / RÉALISTE / AMBITIEUX
// calculés sur ratios bas / médians / hauts du secteur). Pas de placeholder conditionnel.

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
      const fontSize = 22;
      const dotSize = 5;
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

      // Point terracotta dans l'axe du "o" — triangulation entre trop bas et trop haut
      const dotX = x + textW + gap;
      const dotY = y + fontSize - 8;  // valeur médiane entre baseline et milieu de x-height
      doc.circle(dotX, dotY, dotSize / 2).fill(COLORS.accent);

      // Reset complet de la police et de la couleur après le logo (sinon overflow casse les fonts)
      doc.font('Times-Roman').fontSize(11).fillColor(COLORS.ink);

      // Réserve l'espace du logo : le contenu commence au moins 40px en dessous
      doc.y = M + 40;
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
      // Anti-orphelin : si moins de ~120px disponibles avant le bas de la page,
      // on force un saut de page pour ne pas laisser le titre seul en bas.
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 50; // marge de sécurité footer
      if (doc.y + 120 > bottomLimit) {
        doc.addPage();
      }
      doc.moveDown(2.5);
      resetX();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.accent)
        .text(label.toUpperCase(), M, doc.y, { characterSpacing: 2, width: W });
      doc.moveDown(0.6);
      rule();
      doc.moveDown(1.1);
      resetX();
    }

    function body(text, opts = {}) {
      resetX();
      doc.font('Times-Roman').fontSize(11).fillColor(COLORS.ink)
        .text(clean(text), M, doc.y, { lineGap: 6, width: W, ...opts });
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

    // --- VARIABLE CLE ET SEUILS (3 boxes uniformes : CONSERVATEUR / RÉALISTE / AMBITIEUX) ---
    const vk = sections['Variable cle et seuils'] || sections['Variable cle'] || sections['Variable clé et seuils'] || sections['Variable clé'];
    if (vk) {
      sectionTitle('Variable cle et seuils');
      const vkLines = vk.split('\n');

      const SEUIL_LABELS = ['CONSERVATEUR', 'RÉALISTE', 'REALISTE', 'AMBITIEUX', 'FONDATEUR'];
      // Une ligne valide de scénario doit : (1) commencer par le label dans les 30 premiers chars,
      // (2) être de longueur raisonnable (< 280 chars). Sinon, c'est probablement l'intro mergée
      // avec le label par erreur de Claude — on la traite comme intro.
      const isValidScenarioLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        const upper = trimmed.toUpperCase();
        const labelMatch = SEUIL_LABELS.find(sl => {
          const idx = upper.indexOf(sl);
          return idx >= 0 && idx < 30;
        });
        if (!labelMatch) return false;
        if (trimmed.length > 280) return false;
        return true;
      };
      const seuilLines = vkLines.filter(isValidScenarioLine);
      const intro = vkLines.filter(l => !isValidScenarioLine(l) && l.trim()).join(' ');

      if (intro) { body(intro); doc.moveDown(1.2); }

      if (seuilLines.length) {
        const bw = (W - 16) / 3;
        const labels = ['CONSERVATEUR', 'RÉALISTE', 'AMBITIEUX'];

        const boxData = seuilLines.slice(0, 3).map((line) => {
          const txt = clean(line.replace(/^[A-ZÉÀ]+\s*[:=]\s*/i, ''));
          const parts = txt.split(/\s*[—–]\s*|\s*--\s*/);
          const amount = parts[0]?.trim() || '';
          const desc = parts.slice(1).join(' — ').trim();
          return { amount, desc };
        });

        const LABEL_Y = 12;
        const AMOUNT_Y = 30;
        const MAX_AMT_SIZE = 13;
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
        boxData.forEach(({ amount, desc }) => {
          const amtSize = fitAmtSize(amount);
          let h = AMOUNT_Y;
          h += doc.font('Helvetica-Bold').fontSize(amtSize).heightOfString(amount || ' ', { width: bw - 20 });
          if (desc) {
            h += DESC_GAP;
            h += doc.font('Helvetica').fontSize(8).heightOfString(desc, { width: bw - 20 });
          }
          h += BOT_PAD;
          if (h > maxBH) maxBH = h;
        });
        const bh = maxBH;

        // FIX 2026-05-15 : garantir que les 3 boxes scenarios tiennent sur la même page.
        // Sans ce check, si doc.y est bas en page courante, le texte déborde, pdfkit fait
        // un saut de page auto, et les boxes suivantes sont dessinées en bas de page (orphelines).
        // Bug observé sur le PDF "Service de jardiniers" du 2026-05-15.
        const PAGE_BOTTOM = doc.page.height - doc.page.margins.bottom;
        if (doc.y + bh > PAGE_BOTTOM) {
          doc.addPage();
        }
        const by = doc.y;

        boxData.forEach(({ amount, desc }, i) => {
          const bx = M + i * (bw + 8);

          doc.rect(bx, by, bw, bh).fill(COLORS.bgSoft);

          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.mute)
            .text(labels[i], bx + 10, by + LABEL_Y, { width: bw - 20, characterSpacing: 1 });

          const amtSize = fitAmtSize(amount);
          const amtH = doc.font('Helvetica-Bold').fontSize(amtSize).heightOfString(amount || ' ', { width: bw - 20 });
          doc.font('Helvetica-Bold').fontSize(amtSize).fillColor(COLORS.ink)
            .text(amount || '', bx + 10, by + AMOUNT_Y, { width: bw - 20 });

          if (desc) {
            const descY = by + AMOUNT_Y + amtH + DESC_GAP;
            doc.font('Helvetica').fontSize(8).fillColor(COLORS.inkSoft)
              .text(desc, bx + 10, descY, { width: bw - 20 });
          }
        });
        doc.y = by + bh + 20;
        resetX();
      }
    }

    // --- LES 5 PILIERS ---
    // FIX 2026-05-21 : plus de saut de page forcé. L'ancien doc.addPage() inconditionnel
    // rejetait "Les 5 piliers" en page suivante même quand les 3 boxes scénarios venaient
    // juste de basculer en page 2 → page 2 à ~80% vide (bug "Camion" de Diana, 20/05).
    // On laisse sectionTitle() gérer l'anti-orphelin (saut uniquement s'il reste <120px avant
    // le footer), ce qui enchaîne "Les 5 piliers" juste après les boxes quand la place le permet.
    const piliers = sections['Les 5 piliers'];
    if (piliers) {
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
            .text(clean(d), M, doc.y, { lineGap: 6, width: W });
          doc.moveDown(1.3);
          resetX();
        } else {
          body(trimmed);
          doc.moveDown(0.7);
        }
      }
    }

    // --- ANALYSE ---
    if (sections['Analyse']) {
      sectionTitle('Analyse');
      const paras = sections['Analyse'].split(/\n{2,}/).filter(p => p.trim());
      paras.forEach((p, i) => {
        body(p);
        if (i < paras.length - 1) doc.moveDown(1.1);
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
          doc.moveDown(1);
          n++;
        } else if (trimmed) {
          body(trimmed);
          doc.moveDown(0.5);
        }
      });
    }

    // --- NOTE MÉTHODOLOGIQUE en fin de document (sur la dernière page de contenu) ---
    const methodNote = "Note méthodologique : les benchmarks sectoriels cités dans cette étude s'appuient sur les standards reconnus du secteur et servent de références indicatives pour situer le projet dans son écosystème. Ils méritent une validation terrain spécifique avant toute décision d'investissement.";

    // FIX 2026-05-21 : on ne saute de page que si la note (filet + texte) ne tient
    // réellement pas au-dessus du footer. L'ancien seuil fixe (80+50px réservés) était
    // trop conservateur et orphelinait la note sur une dernière page quasi-vide.
    const footerTop = doc.page.height - 50;  // le footer est dessiné à height-36
    const noteH = doc.font('Times-Italic').fontSize(8).heightOfString(methodNote, { width: W, lineGap: 2 });
    const noteBlock = 16 + noteH;            // filet + petits espacements + texte
    if (doc.y + 30 + noteBlock > footerTop) {
      doc.addPage();
    } else {
      doc.moveDown(2.5);
    }
    resetX();

    // Petit filet discret centré, légèrement plus court que la largeur totale
    const filetWidth = W * 0.5;
    const filetX = M + (W - filetWidth) / 2;
    doc.moveTo(filetX, doc.y).lineTo(filetX + filetWidth, doc.y)
      .lineWidth(0.5).stroke(COLORS.border);
    doc.moveDown(0.6);
    resetX();

    // Note méthodologique en italique discret
    doc.font('Times-Italic').fontSize(8).fillColor(COLORS.mute)
      .text(methodNote, M, doc.y, { width: W, align: 'center', lineGap: 2 });
    resetX();

    // --- FOOTER : "une étude deyoo · deyoo.app · page X / Y" ---
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
