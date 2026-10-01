import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, type DocumentProps } from "@react-pdf/renderer";
import { APP_NAME, DOCUMENT_TITLE } from "@/lib/branding";
import { COMPANY_LOGO, type CompanyDetails, type CompanyImages } from "@/lib/company";
import { amountInWords, formatQuantity, formatQuotationDate, formatRupees } from "@/lib/quotation/format";
import { COLUMN_WIDTHS, amountOrDash, lineTaxRates, spanWidth } from "@/lib/quotation/layout";
import { toHundredths, type QuotationRow } from "@/lib/quotation/queries";

// Arimo has the same metrics as Arial (used by the reference) and is OFL licensed.
const FONT_DIR = path.join(process.cwd(), "lib/quotation/pdf/fonts");
Font.register({
  family: "Arimo",
  fonts: [
    { src: path.join(FONT_DIR, "Arimo-Regular.ttf") },
    { src: path.join(FONT_DIR, "Arimo-Bold.ttf"), fontWeight: "bold" },
    { src: path.join(FONT_DIR, "Arimo-Italic.ttf"), fontStyle: "italic" },
    { src: path.join(FONT_DIR, "Arimo-BoldItalic.ttf"), fontWeight: "bold", fontStyle: "italic" },
  ],
});
// Don't hyphenate words when wrapping.
Font.registerHyphenationCallback((word) => [word]);

const LOGO = readFileSync(path.join(process.cwd(), "public", COMPANY_LOGO.src));

const LINE = 0.5; // pt, thin grid lines
const pct = (value: number) => `${value}%`;

const PAGE_PADDING_X = 18; // ~6.5 mm, close to the reference's narrow margins
const BODY_SIZE = 7.7; // reference body font size
const CELL_PADDING_X = 1.5;
const TABLE_WIDTH = 595.28 - 2 * PAGE_PADDING_X - 2 * LINE; // A4 width in pt

// Arimo/Arial advance widths in em: digits 0.556, comma/period 0.278, hyphen 0.333.
function textWidthEm(text: string): number {
  let em = 0;
  for (const ch of text) em += /[0-9]/.test(ch) ? 0.556 : ch === "," || ch === "." ? 0.278 : ch === "-" ? 0.333 : 0.6;
  return em;
}

/** Font size that fits `text` on one line in a column of `widthPct`% (never larger than body size). */
function fitSize(text: string, widthPct: number): number {
  const available = (widthPct / 100) * TABLE_WIDTH - 2 * CELL_PADDING_X - LINE;
  const em = textWidthEm(text);
  return em === 0 ? BODY_SIZE : Math.min(BODY_SIZE, Math.floor((available / em) * 10) / 10);
}

const s = StyleSheet.create({
  page: {
    paddingVertical: 28,
    paddingHorizontal: PAGE_PADDING_X,
    fontFamily: "Arimo",
    fontSize: BODY_SIZE,
    lineHeight: 1.25,
    color: "#000",
  },
  box: { borderWidth: LINE, borderColor: "#000" },
  row: { flexDirection: "row", borderBottomWidth: LINE, borderColor: "#000" },
  rowLast: { flexDirection: "row" },
  /** Full-width block (not a row of cells) with a line underneath. */
  block: { borderBottomWidth: LINE, borderColor: "#000", paddingHorizontal: 2, paddingVertical: 1.5 },
  cell: { borderRightWidth: LINE, borderColor: "#000", paddingHorizontal: CELL_PADDING_X, paddingVertical: 1.5 },
  cellLast: { paddingHorizontal: CELL_PADDING_X, paddingVertical: 1.5 },
  middle: { justifyContent: "center" },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },

  header: { position: "relative", paddingTop: 8, paddingBottom: 6, alignItems: "center", borderBottomWidth: LINE, borderColor: "#000" },
  logo: { position: "absolute", left: 14, top: 10, width: 91, height: (91 * COMPANY_LOGO.height) / COMPANY_LOGO.width },
  // Uploaded logos can have any shape; fit them in the same area.
  uploadedLogo: { position: "absolute", left: 14, top: 10, width: 108, height: 28, objectFit: "contain" },
  signature: { width: 120, height: 34, objectFit: "contain" },
  title: { fontSize: 18.7, fontStyle: "italic", lineHeight: 1.15 },
  company: { fontSize: 15.4, fontWeight: "bold", lineHeight: 1.2 },

  signatory: { alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  // Positioned from the top: react-pdf misplaces fixed elements anchored with "bottom".
  pageNumber: { position: "absolute", top: 841.89 - 20, left: 0, right: 0, textAlign: "center", fontSize: 7 },
});

/** One grid cell spanning `width`% of the row. */
function Cell({
  width,
  last,
  style,
  children,
}: {
  width: number;
  last?: boolean;
  style?: object | object[];
  children?: React.ReactNode;
}) {
  const extra = Array.isArray(style) ? style : style ? [style] : [];
  return <View style={[last ? s.cellLast : s.cell, { width: pct(width) }, ...extra]}>{children}</View>;
}

/** A right-aligned amount that shrinks, if needed, to stay on one line in its column. */
function Amount({ value, width, bold }: { value: string; width: number; bold?: boolean }) {
  return <Text style={[s.right, { fontSize: fitSize(value, width) }, bold ? s.bold : {}]}>{value}</Text>;
}

/** CGST / SGST / IGST header: group label over Rate | Amount. */
function TaxHeader({ label, rateWidth, amountWidth }: { label: string; rateWidth: number; amountWidth: number }) {
  const total = rateWidth + amountWidth;
  return (
    <View style={[s.cell, { width: pct(total), padding: 0 }]}>
      <View style={[s.row, s.cellLast]}>
        <Text style={[s.bold, s.center, { width: "100%" }]}>{label}</Text>
      </View>
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        <View style={[s.cell, { width: pct((rateWidth / total) * 100) }]}>
          <Text style={[s.bold, s.center]}>Rate</Text>
        </View>
        <View style={[s.cellLast, { width: pct((amountWidth / total) * 100) }]}>
          <Text style={[s.bold, s.center]}>Amount</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The saved quotation as an A4 PDF, laid out like reference/current-invoice.pdf.
 * All amounts are the stored values; nothing is recalculated.
 */
export function QuotationDocument({
  quotation: q,
  company,
  images,
}: {
  quotation: QuotationRow;
  company: CompanyDetails;
  images: CompanyImages;
}): React.ReactElement<DocumentProps> {
  const W = COLUMN_WIDTHS;
  const money = (value: number | string) => formatRupees(toHundredths(value));
  const dash = (value: number | string) => amountOrDash(toHundredths(value));
  const total = toHundredths(q.total_amount);

  const leftWidth = spanWidth(0, 6); // bottom section split, as on the reference
  const bankLabelWidth = (W[0] / leftWidth) * 100;

  const terms: { label: string; separator: string; value: string | null; bold?: boolean }[] = [
    { label: "Payment Terms", separator: " - ", value: q.payment_terms },
    { label: "Extended Warranty", separator: ": ", value: q.extended_warranty },
    { label: "Delivery", separator: " - ", value: q.delivery_terms, bold: true },
    { label: `${DOCUMENT_TITLE} Validity`, separator: " ", value: q.validity },
  ];

  return (
    <Document
      title={`${DOCUMENT_TITLE} ${q.invoice_number}`}
      author={company.name}
      subject={`${DOCUMENT_TITLE} for ${q.customer_name}`}
      creator={APP_NAME}
      producer={APP_NAME}
    >
      <Page size="A4" orientation="portrait" style={s.page}>
        <View style={s.box}>
          {/* Company header */}
          <View style={s.header}>
            {images.logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
              <Image src={images.logo} style={s.uploadedLogo} />
            ) : (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
              <Image src={{ data: LOGO, format: "png" }} style={s.logo} />
            )}
            <Text style={s.title}>{DOCUMENT_TITLE}</Text>
            <Text style={s.company}>{company.name}</Text>
            {company.addressLines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
            <Text style={s.bold}>
              Mob : {company.mobile}
              {"    "}Email : {company.email}
            </Text>
            <Text>GSTIN- {company.gstin}</Text>
          </View>

          {/* Customer / GSTIN / number / date */}
          <View style={s.row} wrap={false}>
            <Cell width={spanWidth(0, 4)}>
              <Text style={s.bold}>To,</Text>
              <Text style={s.bold}>{q.customer_name}</Text>
              <Text style={s.bold}>{q.customer_address}</Text>
              {q.customer_state_code && (
                <Text style={s.bold}>
                  State Code : {q.customer_state_code}
                  {q.customer_state ? ` (${q.customer_state})` : ""}
                </Text>
              )}
            </Cell>
            <Cell width={spanWidth(4, 6)}>
              <Text style={s.bold}>GSTIN:</Text>
              <Text style={s.bold}>{q.customer_gst ?? "URP"}</Text>
            </Cell>
            <Cell width={spanWidth(6, 9)}>
              <Text style={[s.bold, s.center]}>{DOCUMENT_TITLE} No.</Text>
              <Text style={[s.bold, s.center]}>{q.invoice_number}</Text>
            </Cell>
            <Cell width={spanWidth(9, 12)} last>
              <Text style={[s.bold, s.right]}>Dated</Text>
              <Text style={[s.bold, s.right]}>{formatQuotationDate(q.invoice_date)}</Text>
            </Cell>
          </View>

          {/* Item table header */}
          <View style={s.row} wrap={false}>
            <Cell width={W[0]}><Text style={s.bold}>Item</Text></Cell>
            <Cell width={W[1]}><Text style={s.bold}>HSN Code</Text></Cell>
            <Cell width={W[2]}><Text style={[s.bold, s.center]}>Qty</Text></Cell>
            <Cell width={W[3]}><Text style={[s.bold, s.center]}>Rate</Text></Cell>
            <Cell width={W[4]}><Text style={[s.bold, s.center]}>Taxable Value (Rs.)</Text></Cell>
            <TaxHeader label="CGST" rateWidth={W[5]} amountWidth={W[6]} />
            <TaxHeader label="SGST" rateWidth={W[7]} amountWidth={W[8]} />
            <TaxHeader label="IGST" rateWidth={W[9]} amountWidth={W[10]} />
            <Cell width={W[11]} last><Text style={[s.bold, s.right]}>Total (₹)</Text></Cell>
          </View>

          {/* Line items */}
          {q.invoice_items.map((item, index) => {
            const rates = lineTaxRates(item.gst_rate, q.customer_state_code, q.company_state_code);
            return (
              <View key={item.id} style={s.row} wrap={false}>
                <Cell width={W[0]}>
                  <Text>
                    <Text style={s.bold}>
                      {item.line_no ?? index + 1}. {item.item_name}
                    </Text>
                    {item.short_description ? ` - ${item.short_description}` : ""}
                  </Text>
                  {item.description ? <Text>{item.description}</Text> : null}
                </Cell>
                <Cell width={W[1]} style={s.middle}><Text>{item.hsn_code ?? ""}</Text></Cell>
                <Cell width={W[2]} style={s.middle}>
                  <Text style={[s.bold, s.center]}>{formatQuantity(toHundredths(item.quantity))}</Text>
                </Cell>
                <Cell width={W[3]} style={s.middle}><Amount value={money(item.rate)} width={W[3]} /></Cell>
                <Cell width={W[4]} style={s.middle}><Amount value={money(item.amount)} width={W[4]} /></Cell>
                <Cell width={W[5]} style={s.middle}><Text style={s.center}>{rates.cgst}</Text></Cell>
                <Cell width={W[6]} style={s.middle}><Amount value={dash(item.cgst_amount)} width={W[6]} /></Cell>
                <Cell width={W[7]} style={s.middle}><Text style={s.center}>{rates.sgst}</Text></Cell>
                <Cell width={W[8]} style={s.middle}><Amount value={dash(item.sgst_amount)} width={W[8]} /></Cell>
                <Cell width={W[9]} style={s.middle}><Text style={s.center}>{rates.igst}</Text></Cell>
                <Cell width={W[10]} style={s.middle}><Amount value={dash(item.igst_amount)} width={W[10]} /></Cell>
                <Cell width={W[11]} last style={s.middle}><Amount value={money(item.line_total)} width={W[11]} /></Cell>
              </View>
            );
          })}

          {/* Totals, summary and footer stay together on one page */}
          <View wrap={false}>
            <View style={s.row}>
              <Cell width={spanWidth(0, 4)}><Text style={[s.bold, s.center]}>Total</Text></Cell>
              <Cell width={W[4]}><Amount value={money(q.subtotal)} width={W[4]} bold /></Cell>
              <Cell width={W[5]} />
              <Cell width={W[6]}><Amount value={dash(q.cgst_amount)} width={W[6]} bold /></Cell>
              <Cell width={W[7]} />
              <Cell width={W[8]}><Amount value={dash(q.sgst_amount)} width={W[8]} bold /></Cell>
              <Cell width={W[9]} />
              <Cell width={W[10]}><Amount value={dash(q.igst_amount)} width={W[10]} bold /></Cell>
              <Cell width={W[11]} last><Amount value={formatRupees(total)} width={W[11]} bold /></Cell>
            </View>

            {[
              ["Taxable Amount", money(q.subtotal)],
              ["CGST", dash(q.cgst_amount)],
              ["SGST", dash(q.sgst_amount)],
              ["IGST", dash(q.igst_amount)],
              ["Total", formatRupees(total)],
            ].map(([label, value]) => (
              <View key={label} style={s.row}>
                <Cell width={spanWidth(0, 9)}><Text style={[s.bold, s.right]}>{label}</Text></Cell>
                <Cell width={spanWidth(9, 12)} last><Text style={[s.bold, s.right]}>{value}</Text></Cell>
              </View>
            ))}

            {/* Words, bank, terms | signatory */}
            <View style={s.rowLast}>
              <View style={{ width: pct(leftWidth), borderRightWidth: LINE, borderColor: "#000" }}>
                <View style={s.block}>
                  <Text>Amount (in words):</Text>
                  <Text style={s.bold}>{amountInWords(total)}</Text>
                </View>
                <View style={s.row}>
                  <Cell width={bankLabelWidth}><Text style={s.italic}>Our bank details:</Text></Cell>
                  <Cell width={100 - bankLabelWidth} last>
                    <Text style={[s.bold, s.italic]}>Bank: {company.bank.bank}</Text>
                    <Text style={[s.bold, s.italic]}>A/c No. {company.bank.accountNumber}</Text>
                    <Text style={[s.bold, s.italic]}>IFSC Code- {company.bank.ifsc}</Text>
                    <Text style={[s.bold, s.italic]}>{company.bank.branch}</Text>
                  </Cell>
                </View>
                {terms.map((term, i) => (
                  <View key={term.label} style={i === terms.length - 1 ? s.cellLast : s.block}>
                    <Text style={term.bold ? s.bold : undefined}>
                      <Text style={s.bold}>{term.label}</Text>
                      {term.separator}
                      {term.value || "-"}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={[{ width: pct(100 - leftWidth) }, s.signatory]}>
                <Text style={s.bold}>For {company.name}</Text>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                {images.signature && <Image src={images.signature} style={s.signature} />}
                <Text style={s.bold}>Authorised Signatory</Text>
              </View>
            </View>
          </View>
        </View>

        <Text
          style={s.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : "")}
        />
      </Page>
    </Document>
  );
}
