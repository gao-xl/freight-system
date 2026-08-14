import { describe, test, expect } from 'vitest';
import { hasPermission } from '@/utils/hasPermission';

describe('hasPermission 权限判定（v-permission 指令核心）', () => {
  test('空需求直接放行', () => {
    expect(hasPermission([], '')).toBe(true);
    expect(hasPermission(undefined, null)).toBe(true);
  });

  test('非数组权限返回 false', () => {
    expect(hasPermission(null, 'order:delete')).toBe(false);
    expect(hasPermission('order:delete', 'order:delete')).toBe(false);
  });

  test('超级权限 * 放行一切', () => {
    expect(hasPermission(['*'], 'order:delete')).toBe(true);
    expect(hasPermission(['order:view', '*'], 'finance:create')).toBe(true);
  });

  test('精确匹配', () => {
    expect(hasPermission(['order:delete'], 'order:delete')).toBe(true);
    expect(hasPermission(['order:view'], 'order:delete')).toBe(false);
  });

  test('模块通配 module:* 匹配同模块任意动作', () => {
    expect(hasPermission(['order:*'], 'order:delete')).toBe(true);
    expect(hasPermission(['order:*'], 'order:confirm')).toBe(true);
  });

  test('模块通配不跨模块', () => {
    expect(hasPermission(['order:*'], 'finance:delete')).toBe(false);
  });

  test('空动作（仅模块名）需精确持有', () => {
    expect(hasPermission(['order'], 'order')).toBe(true);
    // 无冒号时不做通配展开
    expect(hasPermission(['order:*'], 'order')).toBe(false);
  });
});