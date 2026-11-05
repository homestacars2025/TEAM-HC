import { changeOf } from './CarEditor';
import type { CarEditorData } from '../../lib/queries/carEditor';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const data: CarEditorData = {
  id: 9,
  plate: '34ABC123',
  modelGroupId: 2,
  registration: {
    manufacture_year: 2022, car_package: 'Premium', insurance_expiry: '2026-12-01', inspection_expiry: null,
    ruhsat_url: null, kasko: null, insurance_file_url: null, has_spare_key: false,
  },
  photos: [],
  modelGroups: [],
};

const fields = { plate: '34ABC123', modelGroupId: '2', year: '2022', carPackage: 'Premium', insurance: '2026-12-01', inspection: '', spareKey: false };

describe('what Save writes', () => {
  it('writes nothing when nothing changed', () => {
    expect(changeOf(data, fields, false)).toEqual({ car: {}, registration: {} });
    expect(changeOf(data, fields, true)).toEqual({ car: {}, registration: {} });
  });

  it('never writes plate or model for staff', () => {
    const change = changeOf(data, { ...fields, plate: 'X', modelGroupId: '3', year: '2023', inspection: '2027-02-02' }, false);
    expect(change).toEqual({ car: {}, registration: { manufacture_year: 2023, inspection_expiry: '2027-02-02' } });
  });

  it('writes them for admins, and nothing about investors or purchases', () => {
    const change = changeOf(data, { ...fields, plate: ' 34xyz9 ', modelGroupId: '3' }, true);
    expect(change).toEqual({ car: { plate_number: '34XYZ9', model_group_id: 3 }, registration: {} });
  });

  it('lets staff turn the spare key on and off, saved with the form', () => {
    expect(changeOf(data, { ...fields, spareKey: true }, false)).toEqual({ car: {}, registration: { has_spare_key: true } });
    const keyed = { ...data, registration: { ...data.registration, has_spare_key: true } };
    expect(changeOf(keyed, { ...fields, spareKey: false }, false)).toEqual({ car: {}, registration: { has_spare_key: false } });
    expect(changeOf(keyed, { ...fields, spareKey: true }, false)).toEqual({ car: {}, registration: {} });
  });

  it('never clears a date from half-typed input, but does clear the year and package', () => {
    expect(changeOf(data, { ...fields, insurance: '', year: '', carPackage: '  ' }, false))
      .toEqual({ car: {}, registration: { manufacture_year: null, car_package: null } });
  });
});
