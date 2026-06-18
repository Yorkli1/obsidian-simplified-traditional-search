import s2tGen from './data/s2t.json';
import t2sGen from './data/t2s.json';
import s2hk from './data/s2hk.json';
import t2hk from './data/t2hk.json';
import s2tw from './data/s2tw.json';
import t2tw from './data/t2tw.json';
import s2all from './data/s2all.json';
import hkVariants from './data/hk_variants.json';
import twVariants from './data/tw_variants.json';
import hkTwBidi from './data/hk_tw.json';

export type Region = 'hk' | 'tw' | 'all' | 'tw-hk';

export interface VariantStats {
  s2tCount: number;
  t2sCount: number;
  hkVariantCount: number;
  twVariantCount: number;
  stPhraseCount: number;
  tsPhraseCount: number;
  source: string;
  version: string;
}

export const variantStats: VariantStats = {
  s2tCount: Object.keys(s2tGen).length,
  t2sCount: Object.keys(t2sGen).length,
  hkVariantCount: Object.keys(hkVariants).length,
  twVariantCount: Object.keys(twVariants).length,
  stPhraseCount: 0,
  tsPhraseCount: 0,
  source: 'OpenCC',
  version: '2024',
};

/**
 * 繁簡轉換引擎 — 支援多地區變體
 */
export class ChineseConverter {
  private region: Region = 'hk';

  setRegion(region: Region): void {
    this.region = region;
  }

  getRegion(): Region {
    return this.region;
  }

  /**
   * 返回一個字的所有變體（不含原始字本身）
   * 例如: 线 → ['線'] (HK), 线 → ['綫'] (TW), 线 → ['線', '綫'] (ALL)
   */
  getVariants(char: string): string[] {
    const s2tMap = this._getS2TMap();
    const t2sMap = this._getT2SMap();

    const variants = new Set<string>();

    // 簡→繁方向：找傳統寫法
    const trad = s2tMap.get(char);
    if (trad !== undefined) {
      if (Array.isArray(trad)) {
        for (const t of trad) variants.add(t);
      } else {
        variants.add(trad);
      }
    }

    // 繁→簡方向：找簡體寫法
    const simp = t2sMap.get(char);
    if (simp !== undefined) variants.add(simp);

    // HK↔TW 模式：只找繁體變體，不涉及簡體
    if (this.region === 'tw-hk') {
      const hkTwMap = new Map(Object.entries(hkTwBidi));
      const counterpart = hkTwMap.get(char);
      if (counterpart) variants.add(counterpart);
    }

    return [...variants].filter(v => v !== char);
  }

  /**
   * 檢查文字是否需要轉換（是否有任意字符有變體）
   */
  needsConversion(text: string): boolean {
    for (const ch of text) {
      const variants = this.getVariants(ch);
      if (variants.length > 0) return true;
    }
    return false;
  }

  /**
   * 檢查文字是否包含中文字符
   */
  hasChinese(text: string): boolean {
    return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(text);
  }

  private _getS2TMap(): Map<string, string | string[]> {
    switch (this.region) {
      case 'tw': return new Map(Object.entries(s2tw));
      case 'all': {
        // s2all stores values as arrays
        const m = new Map<string, string[]>();
        for (const [k, v] of Object.entries(s2all)) {
          m.set(k, v as string[]);
        }
        return m as Map<string, string | string[]>;
      }
      case 'hk':
      default:
        return new Map(Object.entries(s2hk));
    }
  }

  private _getT2SMap(): Map<string, string> {
    switch (this.region) {
      case 'tw': return new Map(Object.entries(t2tw));
      case 'hk':
      default:
        return new Map(Object.entries(t2hk));
    }
  }
}
