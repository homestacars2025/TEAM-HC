import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, 'FinesPage.tsx'), 'utf8');

describe('the fine detail badge', () => {
  const modal = SRC.slice(SRC.indexOf('const ViewFineModal'), SRC.indexOf('interface ConfirmPaymentModalProps'));

  test("reads the fine's own status", () => {
    expect(modal).toContain('t(`status.${fine.status}`)');
  });

  test('never the browser global, which is an empty string and would show the raw key', () => {
    expect(modal).not.toContain('t(`status.${status}`)');
  });
});
