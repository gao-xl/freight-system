<template>
  <div class="page-card">
    <div class="topbar">
      <div class="left">
        <el-input v-model="query.keyword" placeholder="搜索模板名称/港口" clearable style="width:240px" @keyup.enter="load(1)" @clear="load(1)">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="query.mode" placeholder="运输方式" clearable style="width:130px" @change="load(1)">
          <el-option v-for="(v,k) in MODE" :key="k" :label="v" :value="k" />
        </el-select>
        <el-select v-model="query.type" placeholder="贸易类型" clearable style="width:130px" @change="load(1)">
          <el-option v-for="(v,k) in ORDER_TYPE" :key="k" :label="v" :value="k" />
        </el-select>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
      </div>
      <el-button type="primary" @click="openEdit()"><el-icon><Plus /></el-icon>新建模板</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <template #empty>
        <EmptyGuide v-if="!loading" :mode="isFiltered ? 'filtered' : 'guide'"
          title="还没有报价模板" hint="报价模板可预设常用费用项，创建报价时一键套用，大幅提升报价效率。"
          action-text="创建第一个模板" @action="openEdit()" @reset="resetFilters" />
      </template>
      <el-table-column prop="name" label="模板名称" min-width="180" />
      <el-table-column label="贸易类型" width="90"><template #default="{row}">{{ ORDER_TYPE[row.type] }}</template></el-table-column>
      <el-table-column label="运输方式" width="90"><template #default="{row}">{{ MODE[row.mode] }}</template></el-table-column>
      <el-table-column label="服务类型" width="90"><template #default="{row}">{{ SERVICE_TYPE[row.serviceType] }}</template></el-table-column>
      <el-table-column label="航线" min-width="180">
        <template #default="{row}">{{ row.originPort || '不限' }} → {{ row.destPort || '不限' }}</template>
      </el-table-column>
      <el-table-column label="币种" width="70"><template #default="{row}">{{ row.currency }}</template></el-table-column>
      <el-table-column label="费用项数" width="90" align="center">
        <template #default="{row}">{{ itemCount(row.items) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="primary" @click="copy(row)">复制</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
        @current-change="load()" @size-change="load(1)" />
    </div>

    <el-dialog :title="editId ? '编辑模板' : '新建模板'" v-model="dialogVisible" width="800px" destroy-on-close @closed="resetForm">
      <el-form :model="form" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="模板名称" required>
            <el-input v-model="form.name" placeholder="如 海运整箱出口-上海至鹿特丹" />
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="币种">
            <el-select v-model="form.currency" filterable allow-create style="width:100%">
              <el-option v-for="c in CURRENCIES" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="8"><el-form-item label="贸易类型">
            <el-select v-model="form.type" style="width:100%"><el-option v-for="(v,k) in ORDER_TYPE" :key="k" :label="v" :value="k" /></el-select>
          </el-form-item></el-col>
          <el-col :span="8"><el-form-item label="运输方式">
            <el-select v-model="form.mode" style="width:100%"><el-option v-for="(v,k) in MODE" :key="k" :label="v" :value="k" /></el-select>
          </el-form-item></el-col>
          <el-col :span="8"><el-form-item label="服务类型">
            <el-select v-model="form.serviceType" style="width:100%"><el-option v-for="(v,k) in SERVICE_TYPE" :key="k" :label="v" :value="k" /></el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="起运港"><el-input v-model="form.originPort" placeholder="留空表示不限" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="目的港"><el-input v-model="form.destPort" placeholder="留空表示不限" /></el-form-item></el-col>
        </el-row>
        <el-divider>费用项</el-divider>
        <el-table :data="form.items" border size="small">
          <el-table-column label="费用名称" min-width="150">
            <template #default="{ row }"><el-input v-model="row.name" placeholder="如 海运费" /></template>
          </el-table-column>
          <el-table-column label="收/支" width="90">
            <template #default="{ row }">
              <el-select v-model="row.direction" style="width:100%">
                <el-option label="收入" value="revenue" />
                <el-option label="成本" value="cost" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="单位" width="90"><template #default="{ row }"><el-input v-model="row.unit" placeholder="箱/吨" /></template></el-table-column>
          <el-table-column label="数量" width="100"><template #default="{ row }"><el-input-number v-model="row.quantity" :min="0" :precision="2" size="small" style="width:100%" /></template></el-table-column>
          <el-table-column label="单价" width="120"><template #default="{ row }"><el-input-number v-model="row.unitPrice" :min="0" :precision="2" size="small" style="width:100%" /></template></el-table-column>
          <el-table-column label="操作" width="70"><template #default="{ $index }"><el-button link type="danger" @click="form.items.splice($index,1)">删除</el-button></template></el-table-column>
        </el-table>
        <el-button size="small" type="primary" style="margin-top:8px" @click="addItem"><el-icon><Plus /></el-icon>添加费用项</el-button>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useQuotationTemplateStore } from '@/stores/quotationTemplate';
import { MODE, SERVICE_TYPE, ORDER_TYPE, CURRENCIES } from '@/utils/dicts';
import EmptyGuide from '@/components/EmptyGuide.vue';

const store = useQuotationTemplateStore();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '', mode: '', type: '' });
const dialogVisible = ref(false);
const saving = ref(false);
const editId = ref(null);

const form = reactive({
  name: '', type: 'export', mode: 'sea', serviceType: 'fcl', currency: 'USD',
  originPort: '', destPort: '', items: [],
});

const isFiltered = computed(() => !!(query.keyword || query.mode || query.type));

function resetFilters() { query.keyword = ''; query.mode = ''; query.type = ''; load(1); }

function itemCount(raw) {
  try { return JSON.parse(raw || '[]').length; } catch { return 0; }
}

function addItem() {
  form.items.push({ name: '', direction: 'revenue', unit: '', quantity: 1, unitPrice: 0 });
}

function resetForm() {
  editId.value = null;
  form.name = ''; form.type = 'export'; form.mode = 'sea'; form.serviceType = 'fcl'; form.currency = 'USD';
  form.originPort = ''; form.destPort = ''; form.items = [];
}

function openEdit(row) {
  if (row) {
    editId.value = row.id;
    form.name = row.name;
    form.type = row.type;
    form.mode = row.mode;
    form.serviceType = row.serviceType;
    form.currency = row.currency;
    form.originPort = row.originPort || '';
    form.destPort = row.destPort || '';
    try { form.items = JSON.parse(row.items || '[]'); } catch { form.items = []; }
  } else {
    resetForm();
  }
  dialogVisible.value = true;
}

async function copy(row) {
  let items;
  try { items = JSON.parse(row.items || '[]'); } catch { items = []; }
  await store.create({ ...row, id: undefined, name: row.name + ' (副本)', items: JSON.stringify(items) });
  ElMessage.success('已复制');
  load();
}

async function save() {
  if (!form.name) return ElMessage.warning('请输入模板名称');
  saving.value = true;
  try {
    const payload = { ...form, items: JSON.stringify(form.items) };
    if (editId.value) {
      await store.update(editId.value, payload);
    } else {
      await store.create(payload);
    }
    ElMessage.success('已保存');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function remove(row) {
  await ElMessageBox.confirm(`确认删除模板「${row.name}」？`, '提示', { type: 'warning' });
  await store.remove(row.id);
  ElMessage.success('已删除');
  load();
}

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await store.fetchList(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

onMounted(() => load(1));
</script>

<style scoped>
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>