import { changeOf } from './CarEditor';
import type { CarEditorData } from '../../lib/queries/carEditor';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const data: CarEditorData = {
  id: 9,
  plate: '34ABC123',
  modelGroupId: 2,
  investorId: 5,
  registration: {
    manufacture_year: 2022, car_package: 'Premium', insurance_expiry: '2026-12-01', inspection_expiry: null, purchase_date: '2024-01-10',
    ruhsat_url: null, kasko: null, insurance_file_url: null, purchase_contract_url: null, purchase_invoice_url: null,
  },
  photos: [],
  modelGroups: [],
  investors: [],
};

const fields = {
  plate: '34ABC123', modelGroupId: '2', investorId: '5', year: '2022', carPackage: 'Premium',
  insurance: '2026-12-01', inspection: '', purchaseDate: '2024-01-10',
};

describe('what Save writes', () => {
  it('writes nothing when nothing changed', () => {
    expect(changeOf(data, fields, false)).toEqual({ car: {}, registration: {} });
    expect(changeOf(data, fields, true)).toEqual({ car: {}, registration: {} });
  });

  it('never writes plate, model, investor or purchase date for staff', () => {
    const change = changeOf(data, { ...fields, plate: 'X', modelGroupId: '3', investorId: '', purchaseDate: '2025-01-01', year: '2023', inspection: '2027-02-02' }, false);
    expect(change).toEqual({ car: {}, registration: { manufacture_year: 2023, inspection_expiry: '2027-02-02' } });
  });

  it('writes them for admins', () => {
    const change = changeOf(data, { ...fields, plate: ' 34xyz9 ', modelGroupId: '3', investorId: '', purchaseDate: '2025-01-01' }, true);
    expect(change).toEqual({ car: { plate_number: '34XYZ9', model_group_id: 3, investor_id: null }, registration: { purchase_date: '2025-01-01' } });
  });

  it('never clears a date from half-typed input, but does clear the year and package', () => {
    expect(changeOf(data, { ...fields, insurance: '', year: '', carPackage: '  ' }, false))
      .toEqual({ car: {}, registration: { manufacture_year: null, car_package: null } });
  });
});
