import { describe, test, expect } from 'vitest';
import { unwrapResponse } from '@/api/unwrap';

describe('unwrapResponse 响应解包（request 拦截器成功分支）', () => {
  test('code 0 返回业务数据', () => {
    const res = unwrapResponse({ code: 0, data: { id: 1 }, message: 'ok' });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ id: 1 });
  });

  test('非零 code 返回失败并带 message', () => {
    const res = unwrapResponse({ code: 4001, message: '参数错误' });
    expect(res.ok).toBe(false);
    expect(res.message).toBe('参数错误');
  });

  test('非零 code 且无 message 时回退默认', () => {
    const res = unwrapResponse({ code: 500 });
    expect(res.ok).toBe(false);
    expect(res.message).toBe('请求失败');
  });

  test('空/undefined 负载回退默认失败', () => {
    expect(unwrapResponse(undefined).ok).toBe(false);
    expect(unwrapResponse(null).message).toBe('请求失败');
  });
});