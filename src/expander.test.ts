import { describe, it, expect, beforeEach } from 'vitest';
import { ChineseConverter } from './converter';
import { expandQuery, tokenize, isExpansionWithExtra, stripExpansion } from './expander';

describe('tokenize', () => {
  it('tokenizes plain text', () => {
    const tokens = tokenize('hello');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('plain');
    expect(tokens[0].value).toBe('hello');
  });

  it('tokenizes Chinese text', () => {
    const tokens = tokenize('剑法');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('plain');
    expect(tokens[0].value).toBe('剑法');
  });

  it('tokenizes operator with value', () => {
    const tokens = tokenize('tag:动漫');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('operator');
    expect(tokens[0].value).toBe('tag:动漫');
  });

  it('tokenizes mixed query with spaces', () => {
    const tokens = tokenize('学习 Python');
    expect(tokens.length).toBeGreaterThanOrEqual(3);
    expect(tokens[0].type).toBe('plain');
    expect(tokens[0].value).toBe('学习');
    expect(tokens[1].type).toBe('whitespace');
    expect(tokens[2].type).toBe('plain');
    expect(tokens[2].value).toBe('Python');
  });

  it('tokenizes OR keyword', () => {
    const tokens = tokenize('(剑) OR (劍)');
    const orTokens = tokens.filter(t => t.type === 'or');
    expect(orTokens).toHaveLength(1);
  });

  it('tokenizes quoted strings', () => {
    const tokens = tokenize('"hello world"');
    expect(tokens[0].type).toBe('quoted');
    expect(tokens[0].value).toBe('hello world');
  });
});

describe('expandQuery — HK mode', () => {
  let converter: ChineseConverter;

  beforeEach(() => {
    converter = new ChineseConverter();
    converter.setRegion('hk');
  });

  it('expands single char', () => {
    const result = expandQuery('剑', converter, { keepOperators: true, phraseEnabled: false });
    expect(result).toBe('(剑) OR (劍)');
  });

  it('expands multi-char as unified conversion', () => {
    const result = expandQuery('剑法', converter, { keepOperators: true, phraseEnabled: false });
    expect(result).toBe('(剑法) OR (劍法)');
  });

  it('does not expand non-Chinese', () => {
    const result = expandQuery('hello', converter, { keepOperators: true, phraseEnabled: false });
    expect(result).toBe('hello');
  });

  it('does not expand Chinese without variants', () => {
    const result = expandQuery('的', converter, { keepOperators: true, phraseEnabled: false });
    expect(result).toBe('的');
  });

  it('expands operator value when keepOperators is on', () => {
    const result = expandQuery('tag:动漫', converter, { keepOperators: true, phraseEnabled: false });
    expect(result).toBe('(tag:动漫) OR (tag:動漫)');
  });

  it('does not expand operator value when keepOperators is off', () => {
    const result = expandQuery('tag:动漫', converter, { keepOperators: false, phraseEnabled: false });
    expect(result).toBe('tag:动漫');
  });

  it('expands mixed Chinese and English', () => {
    const result = expandQuery('学习 Python', converter, { keepOperators: true, phraseEnabled: false });
    // whitespace tokens are preserved as-is
    expect(result).toContain('(学习) OR (學習)');
    expect(result).toContain('Python');
  });
});

describe('expandQuery — ALL mode', () => {
  let converter: ChineseConverter;

  beforeEach(() => {
    converter = new ChineseConverter();
    converter.setRegion('all');
  });

  it('expands single char with all variants', () => {
    const result = expandQuery('里', converter, { keepOperators: true, phraseEnabled: false });
    expect(result).toBe('(里) OR (裏) OR (裡)');
  });

  it('expands multi-char with HK + TW versions', () => {
    const result = expandQuery('里面', converter, { keepOperators: true, phraseEnabled: false });
    // HK version: 裏面, TW version: 裡面
    expect(result).toContain('里面');
    expect(result).toContain('裏面');
    expect(result).toContain('裡面');
  });
});

describe('expandQuery — TW-HK mode', () => {
  let converter: ChineseConverter;

  beforeEach(() => {
    converter = new ChineseConverter();
    converter.setRegion('tw-hk');
  });

  it('expands HK variant to TW (with chain lookup)', () => {
    const result = expandQuery('啓', converter, { keepOperators: true, phraseEnabled: false });
    // tw-hk mode: 啓 → 启 (simplified via t2s) → 啟 (via s2t chain)
    // all three forms appear
    expect(result).toContain('啓');
    expect(result).toContain('啟');
  });

  it('does not expand chars without HK↔TW difference', () => {
    const result = expandQuery('的', converter, { keepOperators: true, phraseEnabled: false });
    expect(result).toBe('的');
  });
});

describe('expandQuery — phrase supplement', () => {
  let converter: ChineseConverter;

  beforeEach(() => {
    converter = new ChineseConverter();
    converter.setRegion('hk');
  });

  it('appends phrase variant when different', () => {
    const result = expandQuery('老板', converter, { keepOperators: true, phraseEnabled: true });
    expect(result).toContain('老板');
    expect(result).toContain('老闆');
  });

  it('does not append phrase when disabled', () => {
    const result = expandQuery('老板', converter, { keepOperators: true, phraseEnabled: false });
    // 老板 has no character-level variant in s2hk (老 and 板 are same in both)
    // So without phrase, no expansion
    expect(result).toBe('老板');
  });
});

describe('isExpansionWithExtra', () => {
  it('returns false for pure expansion', () => {
    expect(isExpansionWithExtra('(剑) OR (劍)')).toBe(false);
  });

  it('returns true for expansion with suffix', () => {
    expect(isExpansionWithExtra('(杖与) OR (杖與)剑的魔剑谭')).toBe(true);
  });

  it('returns true for expansion with prefix', () => {
    expect(isExpansionWithExtra('prefix(剑) OR (劍)')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isExpansionWithExtra('hello')).toBe(false);
  });
});

describe('stripExpansion', () => {
  it('strips expansion with suffix', () => {
    const result = stripExpansion('(杖与) OR (杖與)剑的魔剑谭');
    expect(result).toBe('杖与剑的魔剑谭');
  });

  it('strips expansion with prefix', () => {
    const result = stripExpansion('prefix(剑) OR (劍)');
    expect(result).toBe('prefix剑');
  });

  it('returns original for non-expansion', () => {
    expect(stripExpansion('hello')).toBe('hello');
  });
});
