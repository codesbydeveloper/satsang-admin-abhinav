import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { AGE_GROUPS, ageGroupLabel } from '../ageGroups';

test('nine groups in contract order; labels map from the stored keys', () => {
  expect(AGE_GROUPS).toHaveLength(9);
  expect(ageGroupLabel('Yuvak/Yuvatis A')).toBe('Yuvaks/Yuvatis A');
  expect(ageGroupLabel('Yuvaks/Yuvatis B')).toBe('Yuvaks/Yuvatis B');
  expect(ageGroupLabel(null)).toBeNull();
  expect(ageGroupLabel('Something new')).toBe('Something new');
});

// The same names as the app (en.json) and the backend (src/utils/ageGroup.js), when those repos sit next to this one.
const sibling = (...p) => resolve(process.cwd(), '..', ...p);

test('labels equal the app en.json age_group.* strings', () => {
  const en = sibling('satsang-app-abhinav/Assets/_Project/Localization/en.json');
  if (!existsSync(en)) return;
  const strings = JSON.parse(readFileSync(en, 'utf8'));
  const app = Object.entries(strings).filter(([k]) => k.startsWith('age_group.')).map(([, v]) => v);
  expect(AGE_GROUPS.map((g) => g.label)).toEqual(app);
});

test('keys and labels equal the backend list', () => {
  const file = sibling('satsang-backend-abhinav/src/utils/ageGroup.js');
  if (!existsSync(file)) return;
  const src = readFileSync(file, 'utf8');
  const backend = [...src.matchAll(/\{ key: '([^']+)',\s*label: '([^']+)'/g)].map(([, key, label]) => ({ key, label }));
  expect(AGE_GROUPS).toEqual(backend);
});
