import fs from 'fs';
import path from 'path';

const modal = fs.readFileSync(path.join(__dirname, '../components/fines/FineDetail.tsx'), 'utf8');

describe('the fine detail badge', () => {
  test("reads the fine's own status", () => {
    expect(modal).toContain('t(`status.${fine.status}`)');
  });

  test('never the browser global, which is an empty string and would show the raw key', () => {
    expect(modal).not.toContain('t(`status.${status}`)');
  });
});
