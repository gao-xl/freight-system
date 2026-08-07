<template>
  <div class="page-card">
    <div class="table-topbar">
      <div class="left">
        <el-input v-model="query.keyword" placeholder="搜索单证号/标题" clearable style="width:240px" @keyup.enter="load(1)" @clear="load(1)">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="query.docType" placeholder="类型" clearable style="width:130px" @change="load(1)">
          <el-option v-for="(t,k) in DOC_TYPE" :key="k" :label="t" :value="k" />
        </el-select>
        <el-select v-model="query.status" placeholder="状态" clearable style="width:120px" @change="load(1)">
          <el-option v-for="(v,k) in DOC_STATUS" :key="k" :label="v.text" :value="k" />
        </el-select>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
        <el-input v-model="contentKw" placeholder="按文档内容全文搜索(Word/PDF/Excel)" clearable style="width:260px" @keyup.enter="searchContent" @clear="clearSearch">
          <template #prefix><el-icon><Document /></el-icon></template>
        </el-input>
        <el-button @click="searchContent"><el-icon><Search /></el-icon>内容搜索</el-button>
      </div>
      <div class="left">
        <el-button @click="genDialog = true"><el-icon><MagicStick /></el-icon>从订单生成</el-button>
        <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon>新增单证</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column label="类型" width="110">
        <template #default="{ row }">{{ dictText(DOC_TYPE, row.docType) }}</template>
      </el-table-column>
      <el-table-column prop="docNo" label="单证号" width="160" />
      <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
      <el-table-column label="关联订单" min-width="140">
        <template #default="{ row }"><el-link v-if="row.order" type="primary" @click="goOrder(row)">{{ row.order.orderNo }}</el-link><span v-else>-</span></template>
      </el-table-column>
      <el-table-column prop="issuedBy" label="签发方" width="120" />
      <el-table-column prop="issueDate" label="签发日期" width="110" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }"><el-tag :type="statusOf(DOC_STATUS, row.status).type" size="small">{{ statusOf(DOC_STATUS, row.status).text }}</el-tag></template>
      </el-table-column>
      <el-table-column label="附件/提取" width="130">
        <template #default="{ row }">
          <el-tag v-if="row.filePath" size="small" type="success">已上传</el-tag>
          <el-tag v-else size="small" type="info">无</el-tag>
          <el-tag v-if="row.extractionStatus === 'done'" size="small" type="success" effect="plain">已识别</el-tag>
          <el-tag v-else-if="row.extractionStatus === 'pending'" size="small" type="warning" effect="plain">识别中</el-tag>
          <el-tag v-else-if="row.extractionStatus === 'failed'" size="small" type="danger" effect="plain">失败</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button link type="primary" @click="triggerUpload(row)">上传</el-button>
          <el-dropdown v-if="(DOC_FLOW[row.status]||[]).length" trigger="click" @command="(to)=>changeStatus(row,to)">
            <el-button link type="warning">流转<el-icon><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="s in DOC_FLOW[row.status]" :key="s" :command="s">{{ dictText(DOC_STATUS, s) }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <template v-if="row.filePath">
            <el-button link type="success" @click="download(row)">下载</el-button>
            <el-button link type="warning" @click="preview(row)">预览</el-button>
          </template>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <input ref="fileInput" type="file" style="display:none" @change="onFileChange" />

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
        @current-change="load()" @size-change="load(1)" />
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑单证' : '新增单证'" width="560px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="单证类型"><el-select v-model="form.docType" style="width:100%"><el-option v-for="(t,k) in DOC_TYPE" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="关联订单">
          <el-select v-model="form.orderId" filterable clearable style="width:100%">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.orderNo} - ${o.cargoDesc}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="单证号"><el-input v-model="form.docNo" /></el-form-item>
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="签发方"><el-input v-model="form.issuedBy" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="签发日期"><el-date-picker v-model="form.issueDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="状态"><el-select v-model="form.status" style="width:100%"><el-option v-for="(v,k) in DOC_STATUS" :key="k" :label="v.text" :value="k" /></el-select></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 从订单一键生成单证 -->
    <el-dialog v-model="genDialog" title="从订单生成单证" width="480px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="关联订单">
          <el-select v-model="genForm.orderId" filterable style="width:100%">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.orderNo} - ${o.cargoDesc}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="单证类型">
          <el-select v-model="genForm.docType" style="width:100%">
            <el-option v-for="(t,k) in DOC_TYPE" :key="k" :label="t" :value="k" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genDialog = false">取消</el-button>
        <el-button type="primary" :loading="genLoading" @click="doGenerate">生成草稿</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { documentAPI, orderAPI, documentUploadAPI, documentDownloadAPI, documentPreviewAPI, documentGenerateAPI, documentChangeStatusAPI, documentSearchAPI } from '@/api';
import { DOC_TYPE, DOC_STATUS, DOC_FLOW, dictText, statusOf } from '@/utils/dicts';

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const genLoading = ref(false);
const list = ref([]);
const total = ref(0);
const orders = ref([]);
const query = reactive({ page: 1, pageSize: 10, keyword: '', docType: '', status: '' });
const contentKw = ref('');
const dialogVisible = ref(false);
const form = ref({});
const fileInput = ref(null);
const uploadTarget = ref(null);
const genDialog = ref(false);
const genForm = reactive({ orderId: '', docType: 'bl' });

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await documentAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

// B5 全文内容搜索
async function searchContent() {
  if (!contentKw.value.trim()) return load(1);
  loading.value = true;
  try {
    const data = await documentSearchAPI(contentKw.value.trim());
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}
function clearSearch() { load(1); }

async function loadOptions() {
  const o = await orderAPI.list({ page: 1, pageSize: 200 });
  orders.value = o.list;
}

function openDialog(row) {
  form.value = row ? { ...row } : { docType: 'bl', status: 'draft' };
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (form.value.id) await documentAPI.update(form.value.id, form.value);
    else await documentAPI.create(form.value);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

function triggerUpload(row) {
  uploadTarget.value = row;
  fileInput.value?.click();
}

async function onFileChange(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !uploadTarget.value) return;
  const fd = new FormData();
  fd.append('file', file);
  await documentUploadAPI(uploadTarget.value.id, fd);
  ElMessage.success('上传成功');
  load();
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function download(row) {
  const resp = await documentDownloadAPI(row.id);
  const name = row.originalName || `document-${row.id}.bin`;
  saveBlob(resp.data, name);
}

async function preview(row) {
  const resp = await documentPreviewAPI(row.id);
  const url = URL.createObjectURL(resp.data);
  window.open(url, '_blank');
}

async function remove(row) {
  await ElMessageBox.confirm(`确认删除单证「${row.title || row.docNo}」？`, '提示', { type: 'warning' });
  await documentAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

function goOrder(row) { if (row.order?.id) router.push(`/orders/${row.order.id}`); }

// 从订单一键生成单证草稿
async function doGenerate() {
  if (!genForm.orderId) return ElMessage.warning('请选择订单');
  genLoading.value = true;
  try {
    const data = await documentGenerateAPI({ orderId: genForm.orderId, docType: genForm.docType });
    ElMessage.success(`已生成「${data.document.docNo}」`);
    genDialog.value = false;
    load(1);
  } finally { genLoading.value = false; }
}

// 单证状态流转
async function changeStatus(row, to) {
  await documentChangeStatusAPI(row.id, to);
  ElMessage.success(`已流转为「${dictText(DOC_STATUS, to)}」`);
  load();
}

onMounted(() => { load(1); loadOptions(); });
</script>

<style scoped>
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
</style>