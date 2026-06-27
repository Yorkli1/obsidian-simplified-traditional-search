import type { ChineseConverter } from './converter';

export interface Token {
  type: 'plain' | 'quoted' | 'operator' | 'open' | 'close' | 'or' | 'whitespace';
  raw: string;
  value: string;
}

export interface ExpandOptions {
  keepOperators: boolean;
  phraseEnabled: boolean;
}

/**
 * 將搜索查詢展開為繁簡 OR 查詢
 */
export function expandQuery(
  query: string,
  converter: ChineseConverter,
  options: ExpandOptions,
): string {
  const tokens = tokenize(query);
  const newTokens: string[] = [];

  for (const token of tokens) {
    if (token.type === 'plain' && converter.hasChinese(token.value)) {
      const terms: string[] = [token.value];

      // 字符層級：轉換
      const chars = [...token.value];
      const allAlts: string[] = [];

      if (chars.length === 1) {
        // 單字元：每種變體一個結果
        const variants = converter.getVariants(chars[0]);
        for (const v of variants) {
          if (v !== token.value && !allAlts.includes(v)) allAlts.push(v);
        }
      } else {
        // 多字元：整串統一轉換
        // 一般模式 → 1 個轉換結果
        // 全部地區 → 2 個轉換結果（HK + TW）
        const region = converter.getRegion();

        // HK/預設版（取 v[0]）
        const hkVersion = chars.map(ch => {
          const v = converter.getVariants(ch);
          return v.length > 0 ? v[0] : ch;
        }).join('');
        if (hkVersion !== token.value) allAlts.push(hkVersion);

        // 全部地區版：追加 TW 版（取 v[1] 當與 v[0] 不同時）
        if (region === 'all') {
          const twVersion = chars.map(ch => {
            const v = converter.getVariants(ch);
            return v.length > 1 ? v[1] : ch;
          }).join('');
          if (twVersion !== token.value && !allAlts.includes(twVersion)) {
            allAlts.push(twVersion);
          }
        }
      }

      for (const alt of allAlts) {
        if (!terms.includes(alt)) terms.push(alt);
      }

      // 短語補充模組：若短語結果與現有項都不同，補上一個
      if (options.phraseEnabled) {
        const phraseVariant = converter.getPhraseVariant(token.value);
        if (phraseVariant && !terms.includes(phraseVariant)) {
          terms.push(phraseVariant);
        }
      }

      if (terms.length > 1) {
        newTokens.push(`(${terms.join(') OR (')})`);
        continue;
      }
    } else if (token.type === 'operator' && options.keepOperators) {
      // 轉換運算符後的值，例如 tags:动漫 → (tags:动漫) OR (tags:動漫)
      const colonIdx = token.value.indexOf(':');
      if (colonIdx > 0) {
        const prefix = token.value.slice(0, colonIdx + 1);
        const opValue = token.value.slice(colonIdx + 1);
        if (converter.hasChinese(opValue)) {
          const converted = prefix + [...opValue].map(ch => {
            const v = converter.getVariants(ch);
            return v.length > 0 ? v[0] : ch;
          }).join('');
          if (converted !== token.raw) {
            newTokens.push(`(${[token.raw, converted].join(') OR (')})`);
            continue;
          }
        }
      }
    }
    newTokens.push(token.raw);
  }

  return newTokens.join(' ');
}

/**
 * 將查詢字符串分割為 token 陣列
 */
export function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  const re = /("(?:[^"\\]|\\.)*")|(-?(?:path|file|tag|line|block|content|section|match|heading):(?:[^\s)]+|"(?:[^"\\]|\\.)*"))|(-?\()|(\))|(\bOR\b)|(-?(?:[^\s()"]+))/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(query)) !== null) {
    if (match.index > lastIndex) {
      const ws = query.slice(lastIndex, match.index);
      if (ws) tokens.push({ type: 'whitespace', raw: ws, value: ws });
    }

    const [, quoted, op, openParen, closeParen, orKw, term] = match;

    if (quoted) {
      tokens.push({ type: 'quoted', raw: quoted, value: quoted.slice(1, -1) });
    } else if (op) {
      tokens.push({ type: 'operator', raw: op, value: op });
    } else if (openParen) {
      tokens.push({ type: 'open', raw: openParen, value: openParen });
    } else if (closeParen) {
      tokens.push({ type: 'close', raw: closeParen, value: closeParen });
    } else if (orKw) {
      tokens.push({ type: 'or', raw: orKw, value: 'OR' });
    } else if (term) {
      tokens.push({ type: 'plain', raw: term, value: term });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < query.length) {
    const remaining = query.slice(lastIndex);
    if (remaining) tokens.push({ type: 'whitespace', raw: remaining, value: remaining });
  }

  return tokens;
}

/**
 * 檢測是否為展開 + 用戶後續輸入
 */
export function isExpansionWithExtra(query: string): boolean {
  const m = query.match(/\([^)]+\)\s+OR\s+\([^)]+\)/);
  if (!m || m.index === undefined) return false;
  const before = query.slice(0, m.index).trim();
  const after = query.slice(m.index + m[0].length).trim();
  return !!(before || after);
}

/**
 * 從展開查詢中還原用戶原始輸入
 */
export function stripExpansion(query: string): string {
  const m = query.match(/\([^)]+\)\s+OR\s+\([^)]+\)/);
  if (!m || m.index === undefined) return query;
  const before = query.slice(0, m.index).trim();
  const original = m[0].match(/^\(([^)]+)\)/)?.[1] || '';
  const after = query.slice(m.index + m[0].length).trim();
  return (before + original + after).trim();
}
