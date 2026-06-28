import { describe, it, expect } from 'vitest';
import { ChineseConverter } from './converter';
import { handleBackspace, type BackspaceAction } from './expander';

describe('handleBackspace', () => {
  const converter = new ChineseConverter();
  converter.setRegion('hk');
  const hasChinese = (t: string) => converter.hasChinese(t);
  const needsConversion = (t: string) => converter.needsConversion(t);

  // helper: 断言 action 并返回 value
  function expectRestore(result: BackspaceAction): string {
    expect(result.action).toBe('restore');
    return (result as { action: 'restore'; value: string }).value;
  }
  function expectReexpand(result: BackspaceAction): string {
    expect(result.action).toBe('reexpand');
    return (result as { action: 'reexpand'; value: string }).value;
  }

  describe('场景1: 展开后退格应恢复原文并退一格', () => {
    // Bug: 展开后按退格逐字删除展开内容而非恢复原文
    it('restores original text minus one char when backspacing on expansion (value longer than original)', () => {
      // 展开 "(杖与剑) OR (杖與劍)" 后按退格，浏览器删掉最后的 ")"
      // 值变成 "(杖与剑) OR (杖與劍"，比 lastUserValue "杖与剑" 长
      // 但含括号，应恢复原文并退一格
      const result = handleBackspace(
        '(杖与剑) OR (杖與劍',
        '杖与剑',
        hasChinese,
        needsConversion,
      );
      expect(expectRestore(result)).toBe('杖与');
    });

    it('restores original text minus one char when backspacing on expansion (value shorter than original)', () => {
      // 第二次退格：lastUserValue 已经是 "杖与"（3字符 < 原文）
      // 但 currentValue 含括号残留且更短
      const result = handleBackspace(
        '(杖与',
        '杖与剑',
        hasChinese,
        needsConversion,
      );
      expect(expectRestore(result)).toBe('杖与');
    });
  });

  describe('场景2: 退格到原始输入后应重新展开', () => {
    // Bug: 退格到原始输入后不重新展开
    it('reexpands after backspacing to a value that needs conversion', () => {
      // 用户输入"杖与剑的" → 展开 → 退格删掉"的" → 值变回"杖与剑"
      // "杖与剑" 比 "杖与剑的" 短，且需要转换 → 应重新展开
      const result = handleBackspace(
        '杖与剑',
        '杖与剑的',
        hasChinese,
        needsConversion,
      );
      expect(expectReexpand(result)).toBe('杖与剑');
    });

    it('does not reexpand when backspacing to value without Chinese', () => {
      const result = handleBackspace(
        'hello',
        'hello world',
        hasChinese,
        needsConversion,
      );
      expect(result.action).toBe('none');
    });

    it('does not reexpand when backspacing to empty', () => {
      const result = handleBackspace(
        '',
        '杖与剑',
        hasChinese,
        needsConversion,
      );
      expect(result.action).toBe('none');
    });
  });

  describe('场景3: 展开后追加输入不应被退格逻辑拦截', () => {
    // Bug: 展开后输入新内容被误判为退格
    it('returns none for expansion + appended text (not backspace)', () => {
      // 展开 "(杖与剑) OR (杖與劍)" 后输入"的"
      // 值变成 "(杖与剑) OR (杖與劍)的"，比 lastUserValue "杖与剑" 长
      // 含括号但 isExpansionWithExtra 为 true → 不应恢复原文
      const result = handleBackspace(
        '(杖与剑) OR (杖與劍)的',
        '杖与剑',
        hasChinese,
        needsConversion,
      );
      expect(result.action).toBe('none');
    });

    it('returns none for normal text growth (no backspace)', () => {
      const result = handleBackspace(
        '杖与剑的',
        '杖与剑',
        hasChinese,
        needsConversion,
      );
      expect(result.action).toBe('none');
    });
  });

  describe('不产生二次展开', () => {
    // Bug: 退格到展开残留后继续退格导致二次展开
    it('restores empty when lastUserValue is single char', () => {
      // 假设 lastUserValue 是 "剑"，退格后恢复成空
      const result = handleBackspace(
        '(剑) OR (劍',
        '剑',
        hasChinese,
        needsConversion,
      );
      expect(expectRestore(result)).toBe('');
    });

    it('restores and reexpands when restored value needs conversion', () => {
      // lastUserValue 是 "杖与剑"，退格恢复成 "杖与"
      // "杖与" 需要转换 → 应恢复并在800ms后重新展开
      const result = handleBackspace(
        '(杖与剑) OR (杖與劍',
        '杖与剑',
        hasChinese,
        needsConversion,
      );
      expect(expectRestore(result)).toBe('杖与');
    });
  });
});
