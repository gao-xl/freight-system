import { describe, test, expect, afterEach } from 'vitest';
import { requestReauth, resolveReauth, rejectReauth, reauthState } from '@/utils/reauth';

afterEach(() => {
  // 清理：settle 任何未决 resolver，避免泄漏到下一个用例或产生未处理拒绝
  resolveReauth('cleanup');
});

describe('reauth 敏感操作复核（单飞）', () => {
  test('requestReauth 弹出可见并返回 Promise', () => {
    const p = requestReauth();
    expect(p).toBeInstanceOf(Promise);
    expect(reauthState.visible).toBe(true);
  });

  test('resolveReauth 携带 token 并关闭弹窗', async () => {
    const p = requestReauth();
    resolveReauth('reauth-token-abc');
    await expect(p).resolves.toBe('reauth-token-abc');
    expect(reauthState.visible).toBe(false);
  });

  test('rejectReauth 拒绝并关闭弹窗', async () => {
    const p = requestReauth();
    rejectReauth(new Error('cancel'));
    await expect(p).rejects.toThrow('cancel');
    expect(reauthState.visible).toBe(false);
  });

  test('并发多次 requestReauth 共用同一 resolver（单飞）', async () => {
    const p1 = requestReauth();
    const p2 = requestReauth();
    resolveReauth('one-token');
    await expect(p1).resolves.toBe('one-token');
    await expect(p2).resolves.toBe('one-token');
  });

  test('一次完成后可再次发起（复用）', async () => {
    const p1 = requestReauth();
    resolveReauth('t1');
    await p1;
    const p2 = requestReauth();
    resolveReauth('t2');
    await expect(p2).resolves.toBe('t2');
  });
});