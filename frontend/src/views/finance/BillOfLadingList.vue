<template>
  <div>
    <div class="page-heading">
      <div class="title"><el-icon><Ship /></el-icon> 提单管理</div>
      <span class="page-desc">管理海运主单(MBL)与分单(HBL)，支持提单签发、电放、套打</span>
    </div>

    <div class="page-card">
      <div class="table-topbar">
        <div class="left">
          <el-input v-model="query.keyword" placeholder="提单号/船名/航次" clearable @clear="load(1)" style="width:220px" />
          <el-select v-model="query.blType" placeholder="提单类型" clearable @change="load(1)" style="width:130px">
            <el-option v-for="(v,k) in BL_TYPE" :key="k" :label="v" :value="k" />
          </el-select>
          <el-select v-model="query.status" placeholder="状态" clearable @change="load(1)" style="width:120px">
            <el-option v-for="(v,k) in BL_STATUS" :key="k" :label="v.text" :value="k" />
          </el-select>
          <el-button type="primary" @click="load(1)">查询</el-button>
        </div>
        <div class="right-btn">
          <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon> 新建提单</el-button>
        </div>
      </div>

      <el-table :data="list" v-loading="loading" stripe @selection-change="onSelect" row-key="id">
        <el-table-column type="selection" width="45" />
        <el-table-column prop="blNo" label="提单号" width="160" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="row.blType === 'master' ? 'primary' : 'success'" size="small">{{ BL_TYPE[row.blType] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="主单" width="140">
          <template #default="{ row }">{{ row.masterBl?.blNo || '-' }}</template>
        </el-table-column>
        <el-table-column prop="vessel" label="船名" width="160" />
        <el-table-column prop="voyage" label="航次" width="100" />
        <el-table-column prop="containerNo" label="箱号" width="140" show-overflow-tooltip />
        <el-table-column label="装货港" width="110">
          <template #default="{ row }">{{ row.portOfLoading || '-' }}</template>
        </el-table-column>
        <el-table-column label="卸货港" width="110">
          <template #default="{ row }">{{ row.portOfDischarge || '-' }}</template>
        </el-table-column>
        <el-table-column label="承运人" width="140">
          <template #default="{ row }">{{ row.carrier?.name || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="BL_STATUS[row.status]?.type" size="small">{{ BL_STATUS[row.status]?.text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button v-if="row.blType === 'master'" link type="success" @click="viewHouseBls(row)">分单</el-button>
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

    <!-- 分单列表弹窗 -->
    <el-dialog v-model="houseVisible" title="分单列表" width="800px" destroy-on-close>
      <div v-if="houseData" class="house-info">
        <p><strong>主单号：</strong>{{ houseData.master.blNo }}</p>
        <p><strong>船名/航次：</strong>{{ houseData.master.vessel }} / {{ houseData.master.voyage }}</p>
      </div>
      <el-table :data="houseData?.houses || []" stripe>
        <el-table-column prop="blNo" label="分单号" width="160" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="BL_STATUS[row.status]?.type" size="small">{{ BL_STATUS[row.status]?.text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="vessel" label="船名" />
        <el-table-column prop="voyage" label="航次" />
      </el-table>
      <template #footer>
        <el-button @click="houseVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 新建/编辑提单弹窗 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑提单' : '新建提单'" width="700px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="提单号"><el-input v-model="form.blNo" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="提单类型">
              <el-select v-model="form.blType" style="width:100%">
                <el-option v-for="(v,k) in BL_TYPE" :key="k" :label="v" :value="k" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="关联订单">
              <el-select v-model="form.orderId" filterable clearable placeholder="选择订单" style="width:100%">
                <el-option v-for="o in orders" :key="o.id" :label="o.orderNo" :value="o.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="承运人">
              <el-select v-model="form.carrierId" filterable clearable placeholder="选择供应商" style="width:100%">
                <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item v-if="form.blType === 'house'" label="主单">
          <el-select v-model="form.masterBlId" filterable clearable placeholder="选择主单" style="width:100%">
            <el-option v-for="b in masterBls" :key="b.id" :label="`${b.blNo} - ${b.vessel} ${b.voyage}`" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="船名"><el-input v-model="form.vessel" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="航次"><el-input v-model="form.voyage" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="箱号"><el-input v-model="form.containerNo" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="运费条款"><el-input v-model="form.freightClause" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="件数"><el-input-number v-model="form.packageCount" :min="0" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="毛重(kg)"><el-input-number v-model="form.grossWeight" :min="0" :precision="2" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="体积(m³)"><el-input-number v-model="form.volume" :min="0" :precision="2" style="width:100%" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="发货人"><el-input v-model="form.shipperName" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收货人"><el-input v-model="form.consigneeName" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="装货港"><el-input v-model="form.portOfLoading" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="卸货港"><el-input v-model="form.portOfDischarge" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="签发日期">
              <el-date-picker v-model="form.issueDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width:100%">
                <el-option v-for="(v,k) in BL_STATUS" :key="k" :label="v.text" :value="k" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="通知方"><el-input v-model="form.notifyParty" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
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
import { billOfLadingAPI } from '@/api/billOfLading';
import { supplierAPI } from '@/api';
import { orderAPI } from '@/api/order';
import { BL_TYPE, BL_STATUS } from '@/utils/dicts';

const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 20, keyword: '', blType: '', status: '' });
const dialogVisible = ref(false);
const houseVisible = ref(false);
const houseData = ref(null);
const form = ref({ blType: 'house', status: 'draft' });
const suppliers = ref([]);
const orders = ref([]);
const masterBls = ref([]);

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await billOfLadingAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function openDialog(row) {
  if (row) {
    form.value = { ...row };
  } else {
    form.value = { blType: 'house', status: 'draft' };
  }
  const [sup, ord, mbl] = await Promise.all([
    supplierAPI.list({ pageSize: 999 }),
    orderAPI.list({ pageSize: 999 }),
    billOfLadingAPI.list({ blType: 'master', pageSize: 999 }),
  ]);
  suppliers.value = sup.list;
  orders.value = ord.list;
  masterBls.value = mbl.list;
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (form.value.id) await billOfLadingAPI.update(form.value.id, form.value);
    else await billOfLadingAPI.create(form.value);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function remove(row) {
  await ElMessageBox.confirm('确认删除该提单？', '提示', { type: 'warning' });
  await billOfLadingAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

async function viewHouseBls(row) {
  const data = await billOfLadingAPI.houseBls(row.id);
  houseData.value = data;
  houseVisible.value = true;
}

function onSelect() {}

onMounted(() => load(1));
</script>

<style scoped>
.house-info { margin-bottom: 16px; padding: 12px; background: #f5f7fa; border-radius: 4px; }
.house-info p { margin: 4px 0; }
</style>