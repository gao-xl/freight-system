<template>
  <div>
    <div class="page-heading">
      <div class="title"><el-icon><Document /></el-icon> 借记通知单</div>
      <span class="page-desc">管理应付账款借记通知单，关联提单与供应商</span>
    </div>

    <div class="page-card">
      <div class="table-topbar">
        <div class="left">
          <el-input v-model="query.keyword" placeholder="搜索编号/备注" clearable @clear="load(1)" style="width:200px" />
          <el-select v-model="query.status" placeholder="状态" clearable @change="load(1)" style="width:120px">
            <el-option v-for="(v,k) in DEBIT_NOTE_STATUS" :key="k" :label="v.text" :value="k" />
          </el-select>
          <el-button type="primary" @click="load(1)">查询</el-button>
        </div>
        <div class="right-btn">
          <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon> 新增</el-button>
        </div>
      </div>

      <el-table :data="list" v-loading="loading" stripe @selection-change="onSelect">
        <el-table-column type="selection" width="45" />
        <el-table-column prop="debitNoteNo" label="通知单号" width="150" />
        <el-table-column label="供应商" width="160">
          <template #default="{ row }">{{ row.supplier?.name || '-' }}</template>
        </el-table-column>
        <el-table-column label="提单" width="140">
          <template #default="{ row }">{{ row.bl?.blNo || '-' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="150" align="right">
          <template #default="{ row }">{{ money(row.totalAmount, row.currency) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="DEBIT_NOTE_STATUS[row.status]?.type" size="small">{{ DEBIT_NOTE_STATUS[row.status]?.text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="issuedAt" label="签发日期" width="110" />
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination background layout="total, prev, pager, next, sizes" v-model:current-page="query.page"
          v-model:page-size="query.pageSize" :page-sizes="[10,20,50]" :total="total"
          @current-change="load()" @size-change="load(1)" />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑借记通知单' : '新增借记通知单'" width="560px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-form-item label="供应商">
          <el-select v-model="form.supplierId" filterable placeholder="选择供应商" style="width:100%">
            <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联订单">
          <el-select v-model="form.orderId" filterable clearable placeholder="选择订单" style="width:100%">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.orderNo} - ${o.customer?.name || ''}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联提单">
          <el-select v-model="form.blId" filterable clearable placeholder="选择提单" style="width:100%">
            <el-option v-for="b in bls" :key="b.id" :label="`${b.blNo} (${BL_TYPE[b.blType] || b.blType})`" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="form.amount" :min="0" :precision="2" style="width:180px" />
          <el-select v-model="form.currency" style="width:100px;margin-left:8px">
            <el-option v-for="c in CURRENCIES" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="税率(%)">
          <el-input-number v-model="form.taxRate" :min="0" :max="100" :precision="2" style="width:180px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width:180px">
            <el-option v-for="(v,k) in DEBIT_NOTE_STATUS" :key="k" :label="v.text" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="签发日期">
          <el-date-picker v-model="form.issuedAt" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { debitNoteAPI } from '@/api/debitNote';
import { supplierAPI } from '@/api';
import { orderAPI } from '@/api/order';
import { billOfLadingAPI } from '@/api/billOfLading';
import { DEBIT_NOTE_STATUS, BL_TYPE, CURRENCIES, money } from '@/utils/dicts';

const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 20, keyword: '', status: '' });
const dialogVisible = ref(false);
const form = ref({ amount: 0, currency: 'USD', taxRate: 0, status: 'draft' });
const suppliers = ref([]);
const orders = ref([]);
const bls = ref([]);

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await debitNoteAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function openDialog(row) {
  if (row) {
    form.value = { ...row };
  } else {
    form.value = { amount: 0, currency: 'USD', taxRate: 0, status: 'draft' };
  }
  const [sup, ord, blsData] = await Promise.all([
    supplierAPI.list({ pageSize: 999 }),
    orderAPI.list({ pageSize: 999 }),
    billOfLadingAPI.list({ pageSize: 999 }),
  ]);
  suppliers.value = sup.list;
  orders.value = ord.list;
  bls.value = blsData.list;
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (form.value.id) await debitNoteAPI.update(form.value.id, form.value);
    else await debitNoteAPI.create(form.value);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function remove(row) {
  await ElMessageBox.confirm('确认删除该借记通知单？', '提示', { type: 'warning' });
  await debitNoteAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

function onSelect() {}

onMounted(() => load(1));
</script>