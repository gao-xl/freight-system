<template>
  <div class="page-card">
    <el-tabs v-model="tab">
      <!-- 出口看板 -->
      <el-tab-pane label="出口看板" name="board">
        <div class="toolbar">
          <el-select v-model="orderId" filterable placeholder="选择在途订单" style="width:260px" clearable @change="loadBoard">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.orderNo} - ${o.cargoDesc}`" :value="o.id" />
          </el-select>
          <el-input v-model="orderId" type="number" placeholder="或输入订单ID" style="width:120px" @change="loadBoard" />
          <el-button type="primary" @click="loadBoard"><el-icon><Search /></el-icon>加载看板</el-button>
        </div>

        <div v-if="board" class="board-wrap">
          <div class="board-head">
            <div>
              <span class="order-no">{{ board.orderNo }}</span>
              <el-tag size="small" style="margin-left:8px">{{ board.containerNo || '无箱号' }}</el-tag>
              <el-tag v-if="board.terminal" size="small" type="warning" style="margin-left:6px">{{ board.terminal }}</el-tag>
            </div>
            <div class="progress">
              <span>整体进度</span>
              <el-progress :percentage="board.progress" :stroke-width="12" style="width:220px" />
            </div>
          </div>

          <div class="node-timeline">
            <div v-for="(n, i) in board.nodes" :key="n.node" class="node-item" :class="`st-${n.status}`">
              <div class="node-dot">
                <span class="dot"></span>
                <span v-if="i < board.nodes.length - 1" class="line"></span>
              </div>
              <div class="node-body">
                <div class="node-label">
                  <span class="seq">{{ i + 1 }}</span>
                  <span class="name">{{ n.label }}</span>
                  <el-tag size="small" :type="tagType(n.status)">{{ statusText(n.status) }}</el-tag>
                </div>
                <div class="node-meta" v-if="n.eventTime || n.detail">
                  <span v-if="n.eventTime">{{ fmt(n.eventTime) }}</span>
                  <span v-if="n.detail" class="detail">{{ n.detail }}</span>
                  <span v-if="n.operator" class="op">by {{ n.operator }}</span>
                </div>
                <el-button
                  v-if="n.status !== 'done'"
                  link type="primary" size="small" @click="markDone(n)">标记完成</el-button>
              </div>
            </div>
          </div>
        </div>
        <el-empty v-else description="请选择订单查看青岛港出口节点看板" />
      </el-tab-pane>

      <!-- 预警中心 -->
      <el-tab-pane label="预警中心" name="alerts">
        <div class="toolbar">
          <el-select v-model="terminal" placeholder="码头" clearable style="width:150px" @change="loadAlerts">
            <el-option v-for="t in ['QQCT','QQCTU','QQCTN']" :key="t" :label="t" :value="t" />
          </el-select>
          <el-button type="primary" @click="loadAlerts"><el-icon><Refresh /></el-icon>刷新</el-button>
        </div>
        <el-table :data="alerts" v-loading="loadingAlerts" stripe>
          <el-table-column prop="orderNo" label="订单号" width="150" />
          <el-table-column prop="containerNo" label="箱号" width="140" />
          <el-table-column prop="terminal" label="码头" width="90" />
          <el-table-column label="预警" min-width="120">
            <template #default="{ row }">
              <el-tag :type="row.level === 'blocked' ? 'danger' : 'warning'" size="small">
                {{ row.level === 'blocked' ? '卡点' : '预警' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="说明" min-width="240" show-overflow-tooltip />
          <el-table-column label="到期时间" width="160"><template #default="{ row }">{{ row.dueAt ? fmt(row.dueAt) : '-' }}</template></el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }"><el-button link type="primary" @click="goOrder(row.orderId)">查看订单</el-button></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { qingdaoAPI, orderAPI } from '@/api';

const router = useRouter();
const tab = ref('board');
const orders = ref([]);
const orderId = ref(null);
const board = ref(null);
const alerts = ref([]);
const loadingAlerts = ref(false);
const terminal = ref('');

const statusText = (s) => ({ pending: '待处理', done: '已完成', warning: '预警', blocked: '卡点' }[s] || s);
const tagType = (s) => ({ pending: 'info', done: 'success', warning: 'warning', blocked: 'danger' }[s] || 'info');
const fmt = (d) => d ? new Date(d).toLocaleString('zh-CN', { hour12: false }) : '-';

async function loadOrders() {
  const data = await orderAPI.list({ page: 1, pageSize: 100, status: ['confirmed', 'in_progress'] });
  orders.value = data.list || [];
}

async function loadBoard() {
  if (!orderId.value) return ElMessage.warning('请选择订单');
  board.value = await qingdaoAPI.nodes(orderId.value);
}

async function loadAlerts() {
  loadingAlerts.value = true;
  try {
    alerts.value = await qingdaoAPI.alerts(terminal.value);
  } finally { loadingAlerts.value = false; }
}

async function markDone(n) {
  await qingdaoAPI.updateNode({
    orderId: board.value.orderId,
    node: n.node,
    status: 'done',
    eventTime: new Date(),
    source: 'manual',
  });
  ElMessage.success(`${n.label} 已标记完成`);
  loadBoard();
}

function goOrder(id) { if (id) router.push(`/orders/${id}`); }

onMounted(() => { loadOrders(); loadAlerts(); });
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.board-wrap { border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
.board-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.order-no { font-weight: 700; font-size: 16px; color: var(--text-main); }
.progress { display: flex; align-items: center; gap: 10px; color: var(--text-sub); }
.node-timeline { display: flex; flex-direction: column; }
.node-item { display: flex; gap: 14px; position: relative; }
.node-dot { display: flex; flex-direction: column; align-items: center; width: 16px; }
.dot { width: 14px; height: 14px; border-radius: 50%; background: #d0d7e2; margin-top: 4px; flex-shrink: 0; }
.line { width: 2px; flex: 1; background: #e2e8f0; min-height: 24px; }
.node-item.st-done .dot { background: var(--success, #67c23a); }
.node-item.st-warning .dot { background: var(--warning, #e6a23c); }
.node-item.st-blocked .dot { background: var(--danger, #f56c6c); }
.node-item.st-pending .dot { background: #c0c4cc; }
.node-body { padding-bottom: 18px; flex: 1; }
.node-label { display: flex; align-items: center; gap: 8px; }
.seq { width: 18px; height: 18px; border-radius: 50%; background: #eef2f7; color: var(--text-sub); font-size: 12px; display: inline-flex; align-items: center; justify-content: center; }
.name { font-weight: 600; color: var(--text-main); }
.node-meta { font-size: 12px; color: var(--text-sub); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap; }
.node-meta .detail { color: var(--text-main); }
.node-meta .op { color: #909399; }
</style>