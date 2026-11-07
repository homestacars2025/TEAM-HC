import React from 'react';
import type { Style } from '@react-pdf/types';
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import {
  STATEMENT_TEXT, statementAmount, statementDay, statementNumber, statementSummary,
  type StatementData,
} from '../../lib/hgsStatement';
import { BRAND_RATIO, brandDataUrl } from '../../lib/brand';

/**
 * The HGS statement as a PDF, drawn with react-pdf. This module is only ever loaded
 * with `import()`, when someone asks for a statement, so the library and the fonts stay
 * out of the page's bundle. Geist sets Latin, Turkish and the digits; IBM Plex Sans
 * Arabic picks up Arabic and ₺, glyph by glyph.
 */

const BRAND = 'Homesta Cars';
const SITE = 'homestacars.com';

const C = {
  brand: '#6EA4E7',
  brandInk: '#3A74C2',
  tint: '#F3F8FE',
  ink: '#0E0E10',
  soft: '#45454B',
  muted: '#8A8A93',
  line: '#EBEBEB',
  zebra: '#FAFBFD',
  plateBlue: '#1D4ED8',
};

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const at = (file: string) => new URL(`${process.env.PUBLIC_URL || ''}/fonts/pdf/${file}`, window.location.origin).href;
  const weights: [string, number][] = [['Regular', 400], ['Medium', 500], ['SemiBold', 600], ['Bold', 700]];
  Font.register({ family: 'Geist', fonts: weights.map(([name, fontWeight]) => ({ src: at(`Geist-${name}.ttf`), fontWeight })) });
  // Plex has no 500; Arabic in a 500 run takes the 400.
  Font.register({ family: 'Plex', fonts: weights.filter(([name]) => name !== 'Medium').map(([name, fontWeight]) => ({ src: at(`IBMPlexSansArabic-${name}.ttf`), fontWeight })) });
  // Station names and legal text break between words, never inside one.
  Font.registerHyphenationCallback(word => [word]);
  fontsReady = true;
}

const FONTS = ['Geist', 'Plex'];
const list = (style: Style | Style[] | undefined): Style[] => (Array.isArray(style) ? style : style ? [style] : []);

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 64, paddingHorizontal: 40, fontFamily: FONTS as unknown as string, fontSize: 9, color: C.ink, backgroundColor: '#FFFFFF' },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: C.brand },
  head: { alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: 700, color: C.ink },
  metaRow: { gap: 5, marginTop: 4 },
  metaLabel: { fontSize: 8, color: C.muted },
  metaValue: { fontSize: 8, fontWeight: 600, color: C.ink },
  rule: { height: 1, backgroundColor: C.line, marginVertical: 16 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  cardRow: { gap: 18 },
  cardRule: { height: 1, backgroundColor: C.line, marginVertical: 10 },
  field: { gap: 5 },
  label: { fontSize: 7.5, color: C.muted },
  value: { fontSize: 10, fontWeight: 600, color: C.ink },
  tiles: { gap: 10, marginTop: 12 },
  tile: { flexGrow: 1, flexBasis: 0, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, gap: 6, backgroundColor: C.tint },
  tileLabel: { fontSize: 8, color: C.soft },
  tileValue: { fontSize: 19, fontWeight: 700, color: C.ink },
  note: { marginTop: 8, fontSize: 7.5, color: C.muted },
  table: { marginTop: 16 },
  th: { height: 22, alignItems: 'center', backgroundColor: C.tint, borderRadius: 6 },
  thText: { fontSize: 7.5, fontWeight: 600, color: C.brandInk },
  tr: { height: 24, alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: C.line },
  td: { fontSize: 8.5, color: C.ink },
  tdSoft: { fontSize: 7.5, color: C.soft },
  tdStrong: { fontSize: 8.5, fontWeight: 600, color: C.ink },
  pill: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
  pillText: { fontSize: 7, fontWeight: 600 },
  totals: { height: 30, alignItems: 'center', borderTopWidth: 1.2, borderTopColor: C.ink, marginTop: 2 },
  empty: { paddingVertical: 22, fontSize: 9, color: C.muted, textAlign: 'center' },
  running: { alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 10, borderBottomWidth: 0.5, borderBottomColor: C.line },
  legal: { marginTop: 18, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: C.zebra },
  legalTitle: { fontSize: 8, fontWeight: 600, color: C.ink, marginBottom: 4 },
  legalText: { fontSize: 8, lineHeight: 1.55, color: C.soft },
  footer: { position: 'absolute', left: 40, right: 40, bottom: 22, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.line, justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 7.5, color: C.muted },
});

/** The official logo files, as data URLs, so the PDF carries them inside. */
export interface StatementLogos {
  wordmark: string;
  icon: string;
}

/** Height in pt; the width follows the file. Each file holds its own clear space. */
const WORDMARK_HEIGHT = 34;
const ICON_HEIGHT = 16;

/** A Turkish plate: the blue TR strip, then the number. Always left to right. */
const Plate: React.FC<{ plate: string; rtl: boolean }> = ({ plate, rtl }) => {
  const text = plate.replace(/\s+/g, ' ').trim();
  const pretty = /\s/.test(text) ? text : text.replace(/^(\d{2})([A-Z]{1,3})(\d{2,4})$/i, '$1 $2 $3');
  return (
    <View style={{ flexDirection: 'row', alignSelf: rtl ? 'flex-end' : 'flex-start', borderWidth: 1, borderColor: C.ink, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ width: 10, backgroundColor: C.plateBlue, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 1.5 }}>
        <Text style={{ fontSize: 4.5, fontWeight: 700, color: '#FFFFFF' }}>TR</Text>
      </View>
      <Text style={{ paddingVertical: 2.5, paddingHorizontal: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, color: C.ink, direction: 'ltr' }}>{pretty.toUpperCase()}</Text>
    </View>
  );
};

type Col = 'date' | 'time' | 'route' | 'road' | 'type' | 'amount';
const COLS: Col[] = ['date', 'time', 'route', 'road', 'type', 'amount'];
const WIDTH: Record<Col, { width?: number; flexGrow?: number; flexBasis?: number }> = {
  date: { width: 58 },
  time: { width: 34 },
  route: { flexGrow: 1, flexBasis: 0 },
  road: { width: 118 },
  type: { width: 62 },
  amount: { width: 66 },
};

const StatementDocument: React.FC<{ data: StatementData; logos: StatementLogos }> = ({ data, logos }) => {
  const t = STATEMENT_TEXT[data.lang];
  const rtl = data.lang === 'ar';
  const row = rtl ? 'row-reverse' as const : 'row' as const;
  const start = rtl ? 'right' as const : 'left' as const;
  const end = rtl ? 'left' as const : 'right' as const;
  const dir = rtl ? 'rtl' as const : 'ltr' as const;
  const number = statementNumber(data.plate, data.issued);
  const summary = statementSummary(data.rows);
  const period = `${statementDay(data.window.from)} → ${statementDay(data.window.to)}`;
  const linked = !!(data.customer || data.bookingNumber);

  /** Words in the statement's language. */
  const Words: React.FC<{ style?: Style | Style[]; children: string }> = ({ style, children }) => <Text style={[{ direction: dir, textAlign: start }, ...list(style)]}>{children}</Text>;
  /** Numbers, plates, dates, station names: left to right whatever the language. */
  const Ltr: React.FC<{ style?: Style | Style[]; align?: 'left' | 'right' | 'center'; children: string }> = ({ style, align, children }) => <Text style={[{ direction: 'ltr', textAlign: align ?? start }, ...list(style)]}>{children}</Text>;
  const Field: React.FC<{ label: string; grow: number; children: React.ReactNode }> = ({ label, grow, children }) => (
    <View style={[s.field, { flexGrow: grow, flexBasis: 0, alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
      <Words style={s.label}>{label}</Words>
      {children}
    </View>
  );
  const cell = (col: Col) => [WIDTH[col], { paddingHorizontal: 5 }];
  const cellAlign = (col: Col) => (col === 'amount' ? end : start);

  return (
    <Document title={`${t.title} · ${number}`} author={BRAND} creator={BRAND} producer={BRAND} language={data.lang}>
      <Page size="A4" style={s.page}>
        <View style={s.strip} fixed />

        {/* Header */}
        <View style={[s.head, { flexDirection: row }]}>
          <Image src={logos.wordmark} style={{ width: WORDMARK_HEIGHT * BRAND_RATIO.wordmarkLight, height: WORDMARK_HEIGHT }} />
          <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end' }}>
            <Words style={[s.title, { textAlign: end }]}>{t.title}</Words>
            <View style={[s.metaRow, { flexDirection: row }]}>
              <Words style={s.metaLabel}>{t.number}</Words>
              <Ltr style={s.metaValue}>{number}</Ltr>
            </View>
            <View style={[s.metaRow, { flexDirection: row, marginTop: 2 }]}>
              <Words style={s.metaLabel}>{t.issued}</Words>
              <Ltr style={s.metaValue}>{statementDay(data.issued)}</Ltr>
            </View>
          </View>
        </View>
        <View style={s.rule} />

        {/* The car and the period; the customer under them when a booking is linked */}
        <View style={s.card}>
          <View style={[s.cardRow, { flexDirection: row }]}>
            <Field label={t.plate} grow={1}><Plate plate={data.plate} rtl={rtl} /></Field>
            <Field label={t.vehicle} grow={1.2}><Ltr style={s.value}>{data.model ?? '—'}</Ltr></Field>
            <Field label={t.period} grow={1.4}><Ltr style={s.value}>{period}</Ltr></Field>
          </View>
          {linked && (
            <>
              <View style={s.cardRule} />
              <View style={[s.cardRow, { flexDirection: row }]}>
                <Field label={t.customer} grow={2.2}><Text style={[s.value, { textAlign: start }]}>{data.customer ?? '—'}</Text></Field>
                <Field label={t.booking} grow={1.4}><Ltr style={s.value}>{data.bookingNumber ?? '—'}</Ltr></Field>
              </View>
            </>
          )}
        </View>

        {/* Summary */}
        <View style={[s.tiles, { flexDirection: row }]}>
          <View style={[s.tile, { backgroundColor: C.brand }]}>
            <Words style={[s.tileLabel, { color: '#FFFFFF' }]}>{t.total}</Words>
            <Ltr style={[s.tileValue, { color: '#FFFFFF' }]}>{statementAmount(summary.total)}</Ltr>
          </View>
          <View style={s.tile}>
            <Words style={s.tileLabel}>{t.passes}</Words>
            <Ltr style={s.tileValue}>{summary.passes.toLocaleString('tr-TR')}</Ltr>
          </View>
          <View style={s.tile}>
            <Words style={s.tileLabel}>{t.days}</Words>
            <Ltr style={s.tileValue}>{summary.days.toLocaleString('tr-TR')}</Ltr>
          </View>
        </View>
        {!data.includePrivate && <Words style={s.note}>{t.privateExcluded}</Words>}

        {/* The passes. The header row is fixed, so react-pdf repeats it at the top of every page. */}
        <View style={s.table}>
          <View style={[s.th, { flexDirection: row }]} fixed>
            {COLS.map(col => (
              <View key={col} style={cell(col)}>
                <Words style={[s.thText, { textAlign: cellAlign(col) }]}>{t[col]}</Words>
              </View>
            ))}
          </View>
          {data.rows.length === 0 ? <Words style={s.empty}>{t.empty}</Words> : data.rows.map((item, index) => (
            <View key={item.id} style={[s.tr, { flexDirection: row }, index % 2 === 1 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
              <View style={cell('date')}><Ltr style={s.td}>{statementDay(item.date)}</Ltr></View>
              <View style={cell('time')}><Ltr style={s.td}>{item.time}</Ltr></View>
              <View style={cell('route')}><Ltr style={s.tdStrong}>{item.route}</Ltr></View>
              <View style={cell('road')}><Ltr style={s.tdSoft}>{item.road}</Ltr></View>
              <View style={[...cell('type'), { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                {item.type ? (
                  <View style={[s.pill, { backgroundColor: item.type === 'private' ? '#F1EBFD' : '#F2F2F4' }]}>
                    <Words style={[s.pillText, { color: item.type === 'private' ? '#5B21B6' : '#55555C' }]}>{t[item.type]}</Words>
                  </View>
                ) : <Ltr style={s.td}>—</Ltr>}
              </View>
              <View style={cell('amount')}><Ltr style={s.tdStrong} align={end}>{statementAmount(item.amount)}</Ltr></View>
            </View>
          ))}
          {data.rows.length > 0 && (
            <View style={[s.totals, { flexDirection: row }]} wrap={false}>
              <View style={{ flexGrow: 1, paddingHorizontal: 5 }}><Words style={{ fontSize: 9, fontWeight: 700 }}>{t.totalRow}</Words></View>
              <View style={{ width: 140, paddingHorizontal: 5 }}><Ltr style={{ fontSize: 10, fontWeight: 700, color: C.brandInk }} align={end}>{statementAmount(summary.total)}</Ltr></View>
            </View>
          )}
        </View>

        <View style={[s.legal, rtl ? { borderRightWidth: 3, borderRightColor: C.brand } : { borderLeftWidth: 3, borderLeftColor: C.brand }]} wrap={false}>
          <Words style={s.legalTitle}>{t.legalTitle}</Words>
          <Words style={s.legalText}>{t.legal}</Words>
        </View>

        <View style={[s.footer, { flexDirection: row }]} fixed>
          <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
            <Image src={logos.icon} style={{ width: ICON_HEIGHT, height: ICON_HEIGHT }} />
            <Ltr style={s.footerText}>{`${BRAND} · ${SITE} · ${number}`}</Ltr>
          </View>
          {/* Written after layout, so it gets its own width up front. */}
          <Text style={[s.footerText, { width: 110, direction: dir, textAlign: end }]} render={({ pageNumber, totalPages }) => t.page.replace('{x}', String(pageNumber)).replace('{y}', String(totalPages))} />
        </View>
      </Page>
    </Document>
  );
};

/** The statement as a PDF file. */
export async function renderHgsStatement(data: StatementData): Promise<Blob> {
  registerFonts();
  const [wordmark, icon] = await Promise.all([brandDataUrl('wordmarkLight'), brandDataUrl('icon')]);
  return pdf(<StatementDocument data={data} logos={{ wordmark, icon }} />).toBlob();
}

export default StatementDocument;
