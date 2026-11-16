// The ready-made categories every user starts with. They sit under needs or wants, so the
// 50/30/20 picture is unchanged; they only say what kind of need or want something was.
// A user can rename or delete any of them, and add their own.
import type { Category, Lang } from './types';

export type PresetId = 'groceries' | 'home' | 'transport' | 'health' | 'kids' | 'eating' | 'shopping' | 'leisure' | 'subscriptions' | 'travel';

const PRESETS: Record<PresetId, { bucket: 'needs' | 'wants'; he: string; en: string }> = {
  groceries: { bucket: 'needs', he: 'סופר ומזון', en: 'Groceries' },
  home: { bucket: 'needs', he: 'דיור וחשבונות', en: 'Home & bills' },
  transport: { bucket: 'needs', he: 'רכב ותחבורה', en: 'Car & transport' },
  health: { bucket: 'needs', he: 'בריאות', en: 'Health' },
  kids: { bucket: 'needs', he: 'ילדים וחינוך', en: 'Kids & education' },
  eating: { bucket: 'wants', he: 'אוכל בחוץ', en: 'Eating out' },
  shopping: { bucket: 'wants', he: 'קניות', en: 'Shopping' },
  leisure: { bucket: 'wants', he: 'בילוי ופנאי', en: 'Leisure' },
  subscriptions: { bucket: 'wants', he: 'מנויים', en: 'Subscriptions' },
  travel: { bucket: 'wants', he: 'חופשות', en: 'Travel' },
};

export const presetCategoryId = (p: PresetId) => `p-${p}`;
export const presetBucket = (p: PresetId) => PRESETS[p].bucket;
export const presetName = (p: string, lang: Lang): string | undefined => {
  const preset = PRESETS[p as PresetId];
  return preset ? (lang === 'he' ? preset.he : preset.en) : undefined;
};
/** The preset categories, as stored: no name of their own until the user renames them. */
export const presetCategories = (): Category[] =>
  (Object.keys(PRESETS) as PresetId[]).map((p) => ({ id: presetCategoryId(p), name: '', bucket: PRESETS[p].bucket, preset: p }));
