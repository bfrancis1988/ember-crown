// functions/src/__tests__/economy/banners.test.ts
//
// Update 1.0.5 — pins the rebalanced banner prices and drop rates.
// The rare banner gets a price bump and a flattened distribution; the common
// banner gets a 3× price bump; the premium banner is unchanged.

import { BANNERS, type Banner } from '../../lib/banners';

function bannerById(id: 'common' | 'rare' | 'premium'): Banner {
  const banner = BANNERS.find((b) => b.id === id);
  if (!banner) {
    throw new Error(`Banner not found: ${id}`);
  }
  return banner;
}

function sumWeights(banner: Banner): number {
  return Object.values(banner.weights).reduce((acc, w) => acc + w, 0);
}

describe('Update 1.0.5 banner prices', () => {
  test('common summon costs 300 coins', () => {
    const common = bannerById('common');
    expect(common.cost).toBe(300);
    expect(common.currency).toBe('coins');
  });

  test('rare summon costs 4 shards', () => {
    const rare = bannerById('rare');
    expect(rare.cost).toBe(4);
    expect(rare.currency).toBe('shards');
  });

  test('premium summon is unchanged at 1 key', () => {
    const premium = bannerById('premium');
    expect(premium.cost).toBe(1);
    expect(premium.currency).toBe('keys');
  });
});

describe('Update 1.0.5 banner drop rates', () => {
  test('common banner drop rates sum to 100', () => {
    expect(sumWeights(bannerById('common'))).toBe(100);
  });

  test('rare banner weights match the new tuning and sum to 100', () => {
    const rare = bannerById('rare');
    expect(rare.weights).toEqual({
      Common: 0,
      Uncommon: 60,
      Rare: 30,
      Epic: 9,
      Legendary: 1,
    });
    expect(sumWeights(rare)).toBe(100);
  });

  test('premium banner weights are unchanged (25/55/20 R/E/L) and sum to 100', () => {
    const premium = bannerById('premium');
    expect(premium.weights).toEqual({
      Common: 0,
      Uncommon: 0,
      Rare: 25,
      Epic: 55,
      Legendary: 20,
    });
    expect(sumWeights(premium)).toBe(100);
  });
});
