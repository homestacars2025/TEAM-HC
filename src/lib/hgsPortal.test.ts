import { keyAmount, parseAmount, parsePrivateDate, parsePublicDate, portalRows, PRIVATE_SHEET, PUBLIC_SHEET, uniqKey } from './hgsPortal';

const head = (cols: string[]) => [[null], ['HGS'], cols];
const PUBLIC_HEAD = ['Giriş Zamanı', 'Çıkış Zamanı', 'Açıklama', 'Giriş İstasyonu', 'Çıkış İstasyonu', 'Otoyol', 'Ücret', 'OdenecekTutar', 'NormalGecisUcreti'];
const PRIVATE_HEAD = ['Tahsilat Tarihi', 'Ücret', 'Otoyol', 'Açıklama', 'Giriş İstasyonu', 'Giriş Tarihi', 'Çıkış İstasyonu', 'Çıkış Tarihi'];

describe('dates', () => {
  it('reads the public sheet day first, drops the fraction, and marks it Istanbul', () => {
    expect(parsePublicDate('25.09.2026 12:45:56.000')).toBe('2026-09-25 12:45:56+03');
    expect(parsePublicDate('02.10.2026 12:16:00.860')).toBe('2026-10-02 12:16:00+03');
    expect(parsePublicDate('1.2.2026 9:05:07')).toBe('2026-02-01 09:05:07+03');
    expect(parsePublicDate('')).toBeNull();
    expect(parsePublicDate('10/15/2026 12:20:59 PM')).toBeNull();
  });

  it('reads the private sheet month first, with AM and PM', () => {
    expect(parsePrivateDate('10/15/2026 12:20:59 PM')).toBe('2026-10-15 12:20:59+03');
    expect(parsePrivateDate('11/3/2026 6:15:01 PM')).toBe('2026-11-03 18:15:01+03');
    expect(parsePrivateDate('11/3/2026 12:05:00 AM')).toBe('2026-11-03 00:05:00+03');
    expect(parsePrivateDate('1/9/2026 9:00:00 AM')).toBe('2026-01-09 09:00:00+03');
    expect(parsePrivateDate('25.09.2026 12:45:56.000')).toBeNull();
    expect(parsePrivateDate('13/01/2026 1:00:00 PM')).toBeNull();
  });
});

describe('amounts and the key', () => {
  it('reads text amounts', () => {
    expect(parseAmount('49.00')).toBe(49);
    expect(parseAmount('16.5')).toBe(16.5);
    expect(parseAmount(' ')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });

  it('keys a row exactly like the rows already in the table', () => {
    expect(keyAmount(49)).toBe('49.0');
    expect(keyAmount(16.5)).toBe('16.5');
    expect(uniqKey('34NJG755', { transit_datetime: '2026-09-25 12:56:27+03', amount: 49, exit_location: 'MAHMUTBEY', entry_location: 'ISPARTAKULE' })).toBe('34NJG755|2026-09-25 12:56:27+03|49.0|MAHMUTBEY');
    expect(uniqKey('34NJG755', { transit_datetime: '2026-10-15 12:20:59+03', amount: 16.5, exit_location: 'İSTOÇ', entry_location: 'İSTOÇ' })).toBe('34NJG755|2026-10-15 12:20:59+03|16.5|İSTOÇ');
    expect(uniqKey('X', { transit_datetime: 't', amount: 1, exit_location: null, entry_location: 'A' })).toBe('X|t|1.0|A');
    expect(uniqKey('X', { transit_datetime: 't', amount: 1, exit_location: null, entry_location: null })).toBe('X|t|1.0|');
  });
});

describe('the two sheets', () => {
  const sheets = {
    [PUBLIC_SHEET]: [...head(PUBLIC_HEAD),
      ['25.09.2026 12:45:56.000', '25.09.2026 12:56:27.000', 'Ücret alındı', 'ISPARTAKULE', 'MAHMUTBEY', 'MAHMUTBEY-EDİRNE OTOYOLU', '49.00', '', ''],
      ['', '02.10.2026 12:16:00.860', 'Ücret alındı', '*', '15 TEMMUZ ŞEHİTLER KÖPRÜSÜ', 'İSTANBUL-FSM KÖPRÜSÜ', '59.00', '', ''],
      ['', '03.10.2026 10:00:00.000', 'Muaf', '*', 'X', 'Y', '', '', ''],
      [null, null, null],
    ],
    [PRIVATE_SHEET]: [...head(PRIVATE_HEAD),
      ['15/10/2026 12:22:00', '16.5', 'KCO GECIS UCRET', 'Ücret Alındı', 'İSTOÇ', '10/15/2026 12:20:59 PM', 'İSTOÇ', '10/15/2026 12:20:59 PM'],
      ['16/10/2026 08:00:00', '26.0', 'KCO', 'Ücret Alındı', 'A', '10/16/2026 7:58:00 AM', 'B', ''],
    ],
  };
  const out = portalRows(sheets, '34NJG755');

  it('keeps every row with an amount, bridges with no entry included, and skips the rest', () => {
    expect(out.rows).toHaveLength(4);
    expect(out.skipped).toBe(1);
    expect(out.undated).toBe(0);
    expect(out.sheets).toEqual(['public', 'private']);
  });

  it('builds a public row from Çıkış, falling back to nothing for a bridge entry', () => {
    expect(out.rows[0]).toEqual({
      road_type: 'public', transit_datetime: '2026-09-25 12:56:27+03', entry_datetime: '2026-09-25 12:45:56+03', exit_datetime: '2026-09-25 12:56:27+03',
      entry_location: 'ISPARTAKULE', exit_location: 'MAHMUTBEY', otoyol: 'MAHMUTBEY-EDİRNE OTOYOLU', amount: 49, description: 'Ücret alındı',
      uniq_key: '34NJG755|2026-09-25 12:56:27+03|49.0|MAHMUTBEY',
    });
    expect(out.rows[1]).toMatchObject({ entry_datetime: null, transit_datetime: '2026-10-02 12:16:00+03', amount: 59 });
  });

  it('builds a private row from Giriş/Çıkış Tarihi, never Tahsilat, falling back to Giriş', () => {
    expect(out.rows[2]).toEqual({
      road_type: 'private', transit_datetime: '2026-10-15 12:20:59+03', entry_datetime: '2026-10-15 12:20:59+03', exit_datetime: '2026-10-15 12:20:59+03',
      entry_location: 'İSTOÇ', exit_location: 'İSTOÇ', otoyol: 'KCO GECIS UCRET', amount: 16.5, description: 'Ücret Alındı',
      uniq_key: '34NJG755|2026-10-15 12:20:59+03|16.5|İSTOÇ',
    });
    expect(out.rows[3]).toMatchObject({ transit_datetime: '2026-10-16 07:58:00+03', exit_datetime: null, exit_location: 'B', uniq_key: '34NJG755|2026-10-16 07:58:00+03|26.0|B' });
  });

  it('says so when neither sheet is there', () => {
    expect(portalRows({ Sheet1: [['a']] }, 'X')).toEqual({ rows: [], skipped: 0, undated: 0, sheets: [] });
  });
});

describe('the old HGS system is left alone', () => {
  it('the upload writes only through import_hgs_portal_file', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'queries/hgs.ts'), 'utf8') as string;
    const upload = src.slice(src.indexOf('The official portal file'));
    expect(upload).toContain("rpc('import_hgs_portal_file'");
    expect(upload).not.toMatch(/from\('hgs_transactions'\)|\.insert\(|\.update\(|\.delete\(/);
  });
});
