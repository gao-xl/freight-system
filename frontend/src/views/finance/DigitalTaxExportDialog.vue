<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="生成数电票导入文件"
    width="960px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div v-loading="loading" class="dtax-wrap">
      <template v-if="!loading && seller">
        <!-- 全局开票设置 -->
        <div class="dtax-section">
          <div class="dtax-section-title">开票设置</div>
          <el-form :inline="true" size="small" class="dtax-form-inline">
            <el-form-item label="发票类型">
              <el-select v-model="options.invoiceType" style="width:120px">
                <el-option label="数电普票" value="82" />
                <el-option label="数电专票" value="81" />
              </el-select>
            </el-form-item>
            <el-form-item label="含税标志">
              <el-select v-model="options.hsbz" style="width:100px">
                <el-option label="不含税" value="0" />
                <el-option label="含税" value="1" />
              </el-select>
            </el-form-item>
            <el-form-item label="开票人">
              <el-input v-model="options.kpr" style="width:100px" />
            </el-form-item>
            <el-form-item label="收款人">
              <el-input v-model="options.skr" style="width:100px" />
            </el-form-item>
            <el-form-item label="复核人">
              <el-input v-model="options.fhr" style="width:100px" />
            </el-form-item>
          </el-form>
        </div>

        <!-- 销方信息 -->
        <div class="dtax-section">
          <div class="dtax-section-title">销方信息（自动填充）</div>
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="名称">{{ seller.name }}</el-descriptions-item>
            <el-descriptions-item label="税号">{{ seller.taxNo }}</el-descriptions-item>
            <el-descriptions-item label="电话">{{ seller.phone }}</el-descriptions-item>
            <el-descriptions-item label="地址">{{ seller.address }}</el-descriptions-item>
            <el-descriptions-item label="开户行">{{ seller.bankName }}</el-descriptions-item>
            <el-descriptions-item label="账号">{{ seller.bankAccount }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 发票列表 -->
        <div class="dtax-section">
          <div class="dtax-section-title">
            发票列表（{{ invoices.length }} 张）
            <span class="dtax-hint">通过"发票流水号"关联明细行，相同流水号合并为一张发票</span>
          </div>
          <el-tabs v-model="activeTab" type="card">
            <el-tab-pane
              v-for="(inv, idx) in invoices"
              :key="inv.id"
              :label="`${inv.invoiceNo}${inv.currencyWarning ? '⚠' : ''}`"
              :name="String(idx)"
            >
              <!-- 币种警告 -->
              <el-alert
                v-if="inv.currencyWarning"
                :title="inv.currencyWarning"
                type="warning"
                show-icon
                :closable="false"
                style="margin-bottom:12px"
              />
              <el-alert
                v-else-if="inv.originalCurrency && inv.originalCurrency !== 'CNY'"
                :title="`原币 ${inv.originalCurrency} → 人民币(CNY) 折算，请核对折算后金额`"
                type="info"
                show-icon
                :closable="false"
                style="margin-bottom:12px"
              />

              <!-- 购方信息 -->
              <div class="dtax-sub-title">购方信息</div>
              <el-form :model="inv.buyer" label-width="90px" size="small">
                <el-row :gutter="12">
                  <el-col :span="12">
                    <el-form-item label="名称" required>
                      <el-input v-model="inv.buyer.name" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="税号">
                      <el-input v-model="inv.buyer.taxNo" placeholder="15或18位统一社会信用代码" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="地址">
                      <el-input v-model="inv.buyer.address" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="电话">
                      <el-input v-model="inv.buyer.phone" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="开户行">
                      <el-input v-model="inv.buyer.bankName" placeholder="选填" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="银行账号">
                      <el-input v-model="inv.buyer.bankAccount" placeholder="选填" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>

              <!-- 开票明细 -->
              <div class="dtax-sub-title">
                开票明细
                <span class="dtax-hint">税收分类编码为19位数字，可按实际业务修改</span>
              </div>
              <el-table :data="inv.items" size="small" border max-height="240" style="margin-bottom:8px">
                <el-table-column label="项目名称" min-width="200">
                  <template #default="{ row }">
                    <el-input v-model="row.spmc" size="small" />
                  </template>
                </el-table-column>
                <el-table-column label="税收分类编码" width="210">
                  <template #default="{ row }">
                    <el-select v-model="row.spbm" filterable allow-create default-first-option size="small" style="width:200px">
                      <el-option v-for="opt in TAX_CODE_OPTIONS" :key="opt.code" :label="opt.label" :value="opt.code" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="单位" width="60">
                  <template #default="{ row }">
                    <el-input v-model="row.dw" size="small" />
                  </template>
                </el-table-column>
                <el-table-column label="数量" width="70">
                  <template #default="{ row }">
                    <el-input-number v-model="row.spsl" :controls="false" :min="0" :precision="2" size="small" style="width:60px" />
                  </template>
                </el-table-column>
                <el-table-column label="原币金额" width="100">
                  <template #default="{ row }">
                    <span class="dtax-orig-amt">{{ row.originalCurrency }} {{ money(row.originalAmount) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="人民币金额" width="120" align="right">
                  <template #default="{ row }">
                    <el-input-number v-model="row.amount" :controls="false" :min="0" :precision="2" size="small" style="width:110px" @change="recalcInvoice(inv)" />
                  </template>
                </el-table-column>
              </el-table>
              <div class="dtax-totals">
                金额合计：<b>￥{{ money(inv.amount) }}</b>
                税率：<b>{{ inv.taxRate }}%</b>
                税额：<b>￥{{ money(inv.taxAmount) }}</b>
                价税合计：<b>￥{{ money(inv.totalAmount) }}</b>
              </div>

              <!-- 货物运输特定业务 -->
              <template v-if="inv.isFreight">
                <div class="dtax-sub-title">
                  货物运输特定业务信息
                  <span class="dtax-hint">依据国家税务总局公告2015年第99号，必须填写</span>
                </div>
                <el-form :model="inv.transport" label-width="100px" size="small">
                  <el-row :gutter="12">
                    <el-col :span="12">
                      <el-form-item label="起运地" required>
                        <el-input v-model="inv.transport.qyd" placeholder="如：山东省青岛市市南区" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="到达地" required>
                        <el-input v-model="inv.transport.ddd" placeholder="如：上海市浦东新区" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item label="运输工具" required>
                        <el-select v-model="inv.transport.ysgjzl" style="width:100%">
                          <el-option label="公路运输" value="公路运输" />
                          <el-option label="铁路运输" value="铁路运输" />
                          <el-option label="水路运输" value="水路运输" />
                          <el-option label="航空运输" value="航空运输" />
                          <el-option label="管道运输" value="管道运输" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item label="工具牌号" required>
                        <el-input v-model="inv.transport.ysgjhp" placeholder="如：京A12345，无牌填'无'" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item label="货物名称" required>
                        <el-input v-model="inv.transport.yshwmc" placeholder="如：普通货物" />
                      </el-form-item>
                    </el-col>
                  </el-row>
                </el-form>
              </template>

              <!-- 备注 -->
              <div class="dtax-sub-title">
                备注
                <span class="dtax-hint">上限200字符（中文=3字符，ASCII=1字符）</span>
              </div>
              <el-input
                v-model="inv.remark"
                type="textarea"
                :rows="2"
                placeholder="可填写备注信息，如合同编号、项目名称等"
              />
              <div class="dtax-remark-counter" :class="{ 'is-over': remarkChars(inv.remark) > 200 }">
                字符数：{{ remarkChars(inv.remark) }} / 200
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </template>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="exporting" :disabled="loading" @click="doExport">
        <el-icon><Download /></el-icon>生成导入文件
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { invoiceAPI } from '@/api';
import { downloadBlob } from '@/utils/download';
import { money } from '@/utils/dicts';

// 常用税收分类编码预设（货代行业常见）
const TAX_CODE_OPTIONS = [
  { label: '*货物运输服务*国际海上货物运输', code: '3010102010000000000' },
  { label: '*货物运输服务*航空货物运输', code: '3010103010000000000' },
  { label: '*货物运输服务*陆路货物运输', code: '3010101010000000000' },
  { label: '*货物运输服务*铁路货物运输', code: '3010105010000000000' },
  { label: '*物流辅助服务*港口码头服务', code: '3020300000000000000' },
  { label: '*物流辅助服务*装卸搬运', code: '3020100000000000000' },
  { label: '*物流辅助服务*仓储服务', code: '3040401000000000000' },
  { label: '*物流辅助服务*货运客运场站服务', code: '3020400000000000000' },
  { label: '*经纪代理服务*货物运输代理', code: '3040101000000000000' },
  { label: '*经纪代理服务*报关代理', code: '3040102000000000000' },
  { label: '*咨询服务*其他咨询服务', code: '3040600000000000000' },
  { label: '*现代服务*其他现代服务', code: '3049900000000000000' },
  { label: '*生活服务*其他生活服务', code: '3059900000000000000' },
];

const props = defineProps({
  modelValue: Boolean,
  invoiceIds: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue', 'exported']);

const loading = ref(false);
const exporting = ref(false);
const seller = ref(null);
const invoices = ref([]);
const activeTab = ref('0');

const options = ref({
  invoiceType: '82',
  hsbz: '0',
  kpr: '',
  skr: '',
  fhr: '',
});

// 备注字符计数（中文=3, ASCII=1）
function remarkChars(str) {
  if (!str) return 0;
  let count = 0;
  for (const ch of String(str)) {
    count += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 3 : 1;
  }
  return count;
}

// 重新计算发票金额汇总
function recalcInvoice(inv) {
  const totalJe = (inv.items || []).reduce((s, i) => s + Number(i.amount || 0), 0);
  inv.amount = Number(totalJe.toFixed(2));
  inv.taxAmount = Number((totalJe * Number(inv.taxRate || 0) / 100).toFixed(2));
  inv.totalAmount = Number((inv.amount + inv.taxAmount).toFixed(2));
}

// 监听对话框打开 → 加载预览数据
watch(() => props.modelValue, async (val) => {
  if (!val) return;
  if (!props.invoiceIds.length) return;
  loading.value = true;
  activeTab.value = '0';
  try {
    const data = await invoiceAPI.digitalTaxPreview(props.invoiceIds);
    seller.value = data.seller;
    invoices.value = data.invoices || [];
    if (!invoices.value.length) {
      ElMessage.warning('未找到有效的发票数据');
      emit('update:modelValue', false);
    }
  } catch {
    ElMessage.error('加载数据失败');
    emit('update:modelValue', false);
  } finally {
    loading.value = false;
  }
});

// 生成数电票导入文件
async function doExport() {
  // 前端预校验
  for (let i = 0; i < invoices.value.length; i++) {
    const inv = invoices.value[i];
    if (!inv.buyer.name?.trim()) {
      activeTab.value = String(i);
      ElMessage.warning(`发票 ${inv.invoiceNo}：购方名称不能为空`);
      return;
    }
    if (inv.buyer.taxNo) {
      const taxNo = inv.buyer.taxNo.trim();
      if (!/^[A-Z0-9]{15}$|^[A-Z0-9]{18}$/.test(taxNo)) {
        activeTab.value = String(i);
        ElMessage.warning(`发票 ${inv.invoiceNo}：购方税号应为15或18位`);
        return;
      }
    }
    if (remarkChars(inv.remark) > 200) {
      activeTab.value = String(i);
      ElMessage.warning(`发票 ${inv.invoiceNo}：备注超出200字符限制`);
      return;
    }
    if (inv.isFreight && inv.transport) {
      const t = inv.transport;
      const missing = [];
      if (!t.qyd?.trim()) missing.push('起运地');
      if (!t.ddd?.trim()) missing.push('到达地');
      if (!t.ysgjzl?.trim()) missing.push('运输工具种类');
      if (!t.ysgjhp?.trim()) missing.push('运输工具牌号');
      if (!t.yshwmc?.trim()) missing.push('运输货物名称');
      if (missing.length) {
        activeTab.value = String(i);
        ElMessage.warning(`发票 ${inv.invoiceNo}：货物运输缺少 ${missing.join('、')}`);
        return;
      }
    }
  }

  exporting.value = true;
  try {
    // 构建导出数据：将前端编辑后的发票数据发送给后端
    const payload = {
      invoices: invoices.value.map((inv) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        taxRate: inv.taxRate,
        buyer: inv.buyer,
        items: (inv.items || []).map((it) => ({
          spmc: it.spmc,
          spbm: it.spbm,
          ggxh: it.ggxh || '',
          dw: it.dw,
          spsl: it.spsl,
          je: it.amount,
        })),
        isFreight: inv.isFreight,
        transport: inv.transport,
        remark: inv.remark || '',
        amount: inv.amount,
        taxAmount: inv.taxAmount,
        totalAmount: inv.totalAmount,
      })),
      options: { ...options.value },
    };
    const resp = await invoiceAPI.digitalTaxExport(payload);
    downloadBlob(resp, '数电票批量导入.xlsx');
    ElMessage.success('数电票导入文件已生成');
    emit('exported');
    emit('update:modelValue', false);
  } catch (e) {
    // 拦截器处理错误提示
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.dtax-wrap { max-height: 65vh; overflow-y: auto; padding-right: 4px; }
.dtax-section { margin-bottom: 18px; }
.dtax-section-title {
  font-size: 14px; font-weight: 600; color: var(--el-text-color-primary);
  margin-bottom: 10px; padding-left: 8px; border-left: 3px solid var(--el-color-primary);
}
.dtax-hint { font-size: 12px; font-weight: 400; color: var(--el-text-color-secondary); margin-left: 8px; }
.dtax-sub-title {
  font-size: 13px; font-weight: 600; color: var(--el-text-color-primary);
  margin: 14px 0 8px;
}
.dtax-form-inline .el-form-item { margin-bottom: 8px; }
.dtax-totals {
  font-size: 13px; color: var(--el-text-color-primary);
  padding: 6px 0; text-align: right;
}
.dtax-totals b { color: var(--el-color-danger); }
.dtax-remark-counter {
  font-size: 12px; color: var(--el-text-color-secondary);
  text-align: right; margin-top: 4px;
}
.dtax-remark-counter.is-over { color: var(--el-color-danger); font-weight: 600; }
.dtax-orig-amt { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
