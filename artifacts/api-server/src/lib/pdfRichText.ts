/**
 * Minimal rich-text renderer for PDFKit.
 *
 * Template regions support a limited inline markup subset — `<b>`, `<i>` and
 * `<u>` (bold / italic / underline), plus `\n` newlines. Merge tokens have
 * already been resolved to plain text by the template engine before this runs.
 *
 * Only those three tags are recognised; any other `<...>` or `&` in the text is
 * treated as a literal character, so user copy never needs HTML escaping.
 */

interface RichSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

const SEG_RE = /(<\/?[biu]>)/g;

export function parseRichSegments(input: string): RichSegment[] {
  const segs: RichSegment[] = [];
  let bold = 0;
  let italic = 0;
  let underline = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  SEG_RE.lastIndex = 0;

  const push = (text: string) => {
    if (!text) return;
    segs.push({
      text,
      bold: bold > 0,
      italic: italic > 0,
      underline: underline > 0,
    });
  };

  while ((m = SEG_RE.exec(input)) !== null) {
    if (m.index > last) push(input.slice(last, m.index));
    switch (m[0]) {
      case "<b>":
        bold++;
        break;
      case "</b>":
        bold = Math.max(0, bold - 1);
        break;
      case "<i>":
        italic++;
        break;
      case "</i>":
        italic = Math.max(0, italic - 1);
        break;
      case "<u>":
        underline++;
        break;
      case "</u>":
        underline = Math.max(0, underline - 1);
        break;
    }
    last = SEG_RE.lastIndex;
  }
  if (last < input.length) push(input.slice(last));
  return segs;
}

/** Strip the limited markup tags, leaving plain text. */
export function stripRichMarkup(input: string): string {
  return input.replace(SEG_RE, "");
}

export interface RichTextOptions {
  fontSize?: number;
  color?: string;
  baseFont?: string;
  boldFont?: string;
  italicFont?: string;
  boldItalicFont?: string;
  /** Extra options passed through to PDFKit's `.text()` (align, lineGap…). */
  textOptions?: Record<string, unknown>;
}

/**
 * Render `content` (limited markup) into a PDFKit document at the current cursor,
 * switching fonts for bold/italic and underlining where marked. Falls back to a
 * single plain `.text()` call when there is no markup.
 */
export function renderRichText(
  doc: PDFKit.PDFDocument,
  content: string,
  opts: RichTextOptions = {},
): void {
  const {
    fontSize = 9,
    color = "#333333",
    baseFont = "Helvetica",
    boldFont = "Helvetica-Bold",
    italicFont = "Helvetica-Oblique",
    boldItalicFont = "Helvetica-BoldOblique",
    textOptions = {},
  } = opts;

  const segments = parseRichSegments(content);
  if (segments.length === 0) {
    doc.font(baseFont).fontSize(fontSize).fillColor(color).text("", textOptions);
    return;
  }

  segments.forEach((seg, i) => {
    const font =
      seg.bold && seg.italic
        ? boldItalicFont
        : seg.bold
          ? boldFont
          : seg.italic
            ? italicFont
            : baseFont;
    const isLast = i === segments.length - 1;
    doc
      .font(font)
      .fontSize(fontSize)
      .fillColor(color)
      .text(seg.text, {
        ...textOptions,
        underline: seg.underline,
        continued: !isLast,
      });
  });
}
