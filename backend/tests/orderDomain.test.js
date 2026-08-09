'use strict';

// orderDomain 纯函数单元测试（node --test）
// 覆盖：ORDER_NODES 结构 / computeReached 各业务证据分支 / deriveOrderStatus 四态
// 作用：F0 纯函数抽取的行为基线——orderController 引用同源代码，本测试防后续改动漂移。

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ORDER_NODES, NODE_TRACK_STAGE,
  computeReached, deriveOrderStatus, statusMapText, dict,
} = require('../src/domains/order/orderDomain');

const exportNodes = ORDER_NODES.export;
const importNodes = ORDER_NODES.import;

test('ORDER_NODES 结构：export 7 节点 / import 5 节点，均含 key+label', () => {
  assert.equal(exportNodes.length, 7);
  assert.equal(importNodes.length, 5);
  for (const n of [...exportNodes, ...importNodes]) {
    assert.equal(typeof n.key, 'string');
    assert.equal(typeof n.label, 'string');
  }
  // 首尾语义
  assert.equal(exportNodes[0].key, 'booked');
  assert.equal(exportNodes[exportNodes.length - 1].key, 'delivered');
});

test('NODE_TRACK_STAGE：手动推进节点 → 跟踪阶段映射完整', () => {
  assert.equal(NODE_TRACK_STAGE.booked, 'booked');
  assert.equal(NODE_TRACK_STAGE.gate_in, 'received');
  assert.equal(NODE_TRACK_STAGE.loaded, 'loaded');
  assert.equal(NODE_TRACK_STAGE.delivered, 'delivered');
});

test('computeReached：无业务证据 → 空集合', () => {
  const reached = computeReached({}, [], [], []);
  assert.equal(reached.size, 0);
});

test('computeReached：订舱/报关存在即到达', () => {
  const reached = computeReached({}, [{ id: 1 }], [{ id: 2 }], []);
  assert.ok(reached.has('booked'));
  assert.ok(reached.has('customs'));
  assert.equal(reached.size, 2);
});

test('computeReached：跟踪阶段全覆盖（picked_up/received → gate_in）', () => {
  const stages = ['picked_up', 'received', 'loaded', 'in_transit', 'arrived', 'cleared', 'delivered'];
  const tracks = stages.map((stage) => ({ stage }));
  const reached = computeReached({}, [], [], tracks);
  assert.ok(reached.has('gate_in'));
  assert.ok(reached.has('loaded'));
  assert.ok(reached.has('arrived'));
  assert.ok(reached.has('cleared'));
  assert.ok(reached.has('delivered'));
  assert.ok(!reached.has('booked'));
  assert.ok(!reached.has('customs'));
});

test('computeReached：报关放行/关闭视同清关完成（出口）', () => {
  const r1 = computeReached({}, [], [{ status: 'released' }], []);
  assert.ok(r1.has('cleared'));
  const r2 = computeReached({}, [], [{ status: 'closed' }], []);
  assert.ok(r2.has('cleared'));
  const r3 = computeReached({}, [], [{ status: 'pending' }], []);
  assert.ok(!r3.has('cleared'));
});

test('deriveOrderStatus：cancelled 优先返回 cancelled（即使节点全到）', () => {
  const reached = new Set(exportNodes.map((n) => n.key));
  assert.equal(deriveOrderStatus({ status: 'cancelled' }, reached, exportNodes), 'cancelled');
});

test('deriveOrderStatus：0 到达 → draft / 全到达 → completed / 部分 → in_progress', () => {
  assert.equal(deriveOrderStatus({ status: 'draft' }, new Set(), exportNodes), 'draft');
  assert.equal(
    deriveOrderStatus({ status: 'in_progress' }, new Set(exportNodes.map((n) => n.key)), exportNodes),
    'completed'
  );
  const partial = new Set(['booked', 'gate_in']);
  assert.equal(deriveOrderStatus({ status: 'in_progress' }, partial, exportNodes), 'in_progress');
});

test('statusMapText：五种状态中文映射 + 未知回显', () => {
  assert.equal(statusMapText('draft'), '草稿');
  assert.equal(statusMapText('confirmed'), '已确认');
  assert.equal(statusMapText('in_progress'), '进行中');
  assert.equal(statusMapText('completed'), '已完成');
  assert.equal(statusMapText('cancelled'), '已取消');
  assert.equal(statusMapText('unknown'), 'unknown');
});

test('dict：跟踪阶段中文映射 + 未知回显', () => {
  assert.equal(dict('booked'), '已订舱');
  assert.equal(dict('in_transit'), '运输中');
  assert.equal(dict('delivered'), '已送达');
  assert.equal(dict('weird_stage'), 'weird_stage');
});
