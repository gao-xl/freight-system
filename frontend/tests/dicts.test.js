import { describe, test, expect } from 'vitest';
import { dictText, statusOf, money, ORDER_TYPE, ORDER_STATUS } from '@/utils/dicts';

describe('dictText 字典文本（字符串值字典）', () => {
  test('已知键返回文本', () => {
    expect(dictText(ORDER_TYPE, 'import')).toBe('进口');
  });
  test('未知键回退原键', () => {
    expect(dictText(ORDER_TYPE, 'unknown_key')).toBe('unknown_key');
  });
});

describe('statusOf 状态兜底', () => {
  test('已知键返回完整映射', () => {
    expect(statusOf(ORDER_STATUS, 'completed').type).toBe('success');
  });
  test('未知键返回兜底 info', () => {
    const s = statusOf(ORDER_STATUS, 'not_a_status');
    expect(s.text).toBe('not_a_status');
    expect(s.type).toBe('info');
  });
});

describe('money 金额格式化', () => {
  test('千分位 + 最多两位小数', () => {
    expect(money(1234567.891)).toBe('1,234,567.89');
  });
  test('带币种后缀', () => {
    expect(money(1000.5, 'USD')).toBe('1,000.5 USD');
  });
  test('非数字输入返回 -', () => {
    expect(money('abc')).toBe('-');
  });
  test('空值返回 -', () => {
    expect(money(undefined)).toBe('-');
  });
});