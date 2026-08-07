<template>
  <div class="page-card">
    <el-tabs v-model="tab">
      <!-- 汇率查询 -->
      <el-tab-pane label="汇率查询" name="rate">
        <div class="toolbar">
          <el-select v-model="rateQuery.base" style="width:120px">
            <el-option v-for="c in CURRENCIES" :key="c" :label="c" :value="c" />
          </el-select>
          <span class="sep">→</span>
          <el-select v-model="rateQuery.target" style="width:120px">
            <el-option v-for="c in CURRENCIES" :key="c" :label="c" :value="c" />
          </el-select>
          <el-button type="primary" @click="queryRate"><el-icon><Search /></el-icon>查询汇率</el-button>
        </div>
        <el-result v-if="rate" icon="success" :title="`1 ${rateQuery.base} = ${rate} ${rateQuery.target}`" sub-title="汇率来自免费API，每日刷新">
        </el-result>
        <el-alert v-else type="info" :closable="false" show-icon title="输入基准币种与目标币种，查询实时汇率（含缓存）" />
      </el-tab-pane>

      <!-- AIS 船舶追踪 -->
      <el-tab-pane label="AIS 船舶追踪" name="vessel">
        <div class="toolbar">
          <el-input v-model="mmsi" placeholder="输入船舶 MMSI（如 41300000）" style="width:240px">
            <template #prefix><el-icon><Ship /></el-icon></template>
          </el-input>
          <el-button type="primary" @click="queryVessel"><el-icon><Search /></el-icon>查询船位</el-button>
        </div>
        <el-table :data="vesselRows" v-loading="loadingVessel" stripe>
          <el-table-column prop="MMSI" label="MMSI" width="120" />
          <el-table-column prop="SHIPNAME" label="船名" min-width="160" />
          <el-table-column prop="LAT" label="纬度" width="100" />
          <el-table-column prop="LON" label="经度" width="100" />
          <el-table-column prop="SPEED" label="航速(kn)" width="100" />
          <el-table-column prop="COURSE" label="航向" width="90" />
          <el-table-column prop="DESTINATION" label="目的地" min-width="120" />
        </el-table>
        <el-alert v-if="vesselMsg" :title="vesselMsg" type="warning" :closable="false" style="margin-top:10px" />
      </el-tab-pane>

      <!-- 船期查询 -->
      <el-tab-pane label="船期查询" name="schedule">
        <div class="toolbar">
          <el-input v-model="scheduleQuery.origin" placeholder="起运港" style="width:160px" />
          <el-input v-model="scheduleQuery.dest" placeholder="目的港" style="width:160px" />
          <el-button type="primary" @click="querySchedule"><el-icon><Search /></el-icon>查询船期</el-button>
        </div>
        <el-alert v-if="scheduleMsg" :title="scheduleMsg" type="info" :closable="false" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { externalAPI } from '@/api';

const tab = ref('rate');
const CURRENCIES = ['USD', 'CNY', 'EUR', 'JPY', 'HKD', 'GBP', 'AUD', 'CAD'];
const rateQuery = ref({ base: 'USD', target: 'CNY' });
const rate = ref(null);
const mmsi = ref('');
const vesselRows = ref([]);
const loadingVessel = ref(false);
const vesselMsg = ref('');
const scheduleQuery = ref({ origin: '', dest: '' });
const scheduleMsg = ref('');

async function queryRate() {
  rate.value = await externalAPI.rate(rateQuery.value);
}

async function queryVessel() {
  if (!mmsi.value) return ElMessage.warning('请输入 MMSI');
  loadingVessel.value = true;
  vesselMsg.value = '';
  try {
    const data = await externalAPI.vessel(mmsi.value);
    vesselRows.value = data.rows || [];
    if (!vesselRows.value.length) vesselMsg.value = '未查询到该船舶位置（可能未启用AIS对接或MMSI无效）';
  } catch (e) {
    vesselMsg.value = e.message || 'AIS 查询失败';
    vesselRows.value = [];
  } finally { loadingVessel.value = false; }
}

async function querySchedule() {
  if (!scheduleQuery.value.origin || !scheduleQuery.value.dest) return ElMessage.warning('请填写起运港和目的港');
  try {
    await externalAPI.schedule(scheduleQuery.value);
    scheduleMsg.value = '船期数据已获取（请配置船期API对接后查看详情）';
  } catch (e) {
    scheduleMsg.value = e.message || '船期查询失败';
  }
}
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; }
.sep { color: var(--text-sub); }
</style>