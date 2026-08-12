<template>
  <div class="page-card">
    <!-- 顶部状态提示 -->
    <el-alert
      v-if="cfg && !cfg.enabled"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom:16px"
      title="AI 对接尚未启用"
      :description="`请到「外部对接」页配置 ai_chat（baseUrl/API Key/model），或设置环境变量 AI_API_KEY 后重启。当前默认模型：${cfg.model || '未设置'}。`"
    />

    <el-tabs v-model="tab">
      <!-- 智能问答 -->
      <el-tab-pane label="智能问答" name="chat">
        <div class="toolbar">
          <el-input
            v-model="chatInput"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="向 AI 业务助手提问，例如：当前有多少在途订单？有哪些超期应收需要跟进？"
          />
        </div>
        <div class="toolbar">
          <el-button type="primary" :loading="loading.chat" @click="doChat"><el-icon><ChatDotRound /></el-icon>提问</el-button>
          <el-button @click="chatInput=''; chatReply=''">清空</el-button>
        </div>
        <el-card v-if="chatReply" shadow="never" class="reply-card">
          <div class="ai-label"><el-icon><Comment /></el-icon> AI 回复 · {{ chatModel || '' }}</div>
          <pre class="ai-text">{{ chatReply }}</pre>
          <el-button size="small" text type="primary" @click="copyText(chatReply)">复制</el-button>
        </el-card>
      </el-tab-pane>

      <!-- 单据智能识别 -->
      <el-tab-pane label="单据识别" name="extract">
        <div class="toolbar">
          <el-select v-model="extractQuery.docType" style="width:200px">
            <el-option v-for="(name, key) in DOC_TYPES" :key="key" :label="name" :value="key" />
          </el-select>
        </div>
        <div class="toolbar">
          <el-input
            v-model="extractQuery.text"
            type="textarea"
            :rows="6"
            placeholder="粘贴单据文本（箱单 / 发票 / 提单 / 报关单…），AI 将自动抽取结构化字段。支持从「单证管理」复制提取出的文本。"
          />
        </div>
        <div class="toolbar">
          <el-button type="primary" :loading="loading.extract" @click="doExtract"><el-icon><MagicStick /></el-icon>识别字段</el-button>
          <el-button @click="extractQuery.text=''; extractResult=null">清空</el-button>
        </div>
        <template v-if="extractResult">
          <el-alert
            :type="extractResult.confidence === 'high' ? 'success' : (extractResult.confidence === 'medium' ? 'warning' : 'info')"
            :closable="false"
            :title="`识别置信度：${extractResult.confidence || 'low'}`"
            :description="extractResult.notes || ''"
            show-icon
            style="margin-bottom:12px"
          />
          <div v-if="Object.keys(extractResult.fields || {}).length" class="field-grid">
            <div v-for="(v, k) in extractResult.fields" :key="k" class="field-item">
              <span class="field-key">{{ FIELD_LABELS[k] || k }}</span>
              <span class="field-val">{{ v === null || v === '' ? '—' : v }}</span>
            </div>
          </div>
          <el-button style="margin-top:12px" size="small" type="primary" plain @click="copyText(JSON.stringify(extractResult.fields, null, 2))">复制字段 JSON</el-button>
        </template>
      </el-tab-pane>

      <!-- 翻译与内容生成 -->
      <el-tab-pane label="翻译/生成" name="generate">
        <div class="toolbar">
          <el-select v-model="genQuery.kind" style="width:180px">
            <el-option label="翻译" value="translate" />
            <el-option label="商务邮件" value="email" />
            <el-option label="报价说明" value="quotation_note" />
            <el-option label="客户通知" value="notification" />
          </el-select>
          <el-select v-model="genQuery.targetLang" style="width:140px">
            <el-option v-for="l in LANGS" :key="l" :label="l" :value="l" />
          </el-select>
          <el-select v-model="genQuery.tone" style="width:140px">
            <el-option label="语气·专业" value="专业" />
            <el-option label="语气·友好" value="友好" />
            <el-option label="语气·正式" value="正式" />
          </el-select>
        </div>
        <div class="toolbar">
          <el-input
            v-model="genQuery.input"
            type="textarea"
            :rows="4"
            placeholder="输入要翻译/生成的内容要点…"
          />
        </div>
        <div class="toolbar">
          <el-button type="primary" :loading="loading.generate" @click="doGenerate"><el-icon><Promotion /></el-icon>生成</el-button>
          <el-button @click="genQuery.input=''; genResult=''">清空</el-button>
        </div>
        <el-card v-if="genResult" shadow="never" class="reply-card">
          <div class="ai-label"><el-icon><EditPen /></el-icon> 生成结果</div>
          <pre class="ai-text">{{ genResult }}</pre>
          <el-button size="small" text type="primary" @click="copyText(genResult)">复制</el-button>
        </el-card>
      </el-tab-pane>

      <!-- 智能推荐 / 预警 -->
      <el-tab-pane label="推荐/预警" name="recommend">
        <div class="toolbar">
          <el-select v-model="recQuery.kind" style="width:200px">
            <el-option label="运价推荐" value="freight_rate" />
            <el-option label="客户跟进建议" value="customer_follow" />
            <el-option label="走货风险预警" value="risk" />
            <el-option label="经营建议" value="sales" />
          </el-select>
        </div>
        <div class="toolbar">
          <el-input
            v-model="recQuery.data"
            type="textarea"
            :rows="6"
            placeholder="粘贴待分析数据（运价列表 / 客户跟进记录 / 订单列表的 JSON 或文本）。系统会自动附加当前账号可见的业务概览作为参考。"
          />
        </div>
        <div class="toolbar">
          <el-button type="primary" :loading="loading.recommend" @click="doRecommend"><el-icon><DataAnalysis /></el-icon>分析</el-button>
          <el-button @click="recQuery.data=''; recResult=''">清空</el-button>
        </div>
        <el-card v-if="recResult" shadow="never" class="reply-card">
          <div class="ai-label"><el-icon><TrendCharts /></el-icon> 分析建议</div>
          <pre class="ai-text">{{ recResult }}</pre>
          <el-button size="small" text type="primary" @click="copyText(recResult)">复制</el-button>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { aiAPI } from '@/api/ai';

const tab = ref('chat');
const cfg = ref(null);

const DOC_TYPES = { box_list: '装箱单', invoice: '发票/费用清单', bl: '提单', customs: '报关单', packing: '装箱明细', generic: '通用单据' };
const FIELD_LABELS = {
  shipper: '发货人', consignee: '收货人', notifyParty: '通知方', vessel: '船名', voyage: '航次',
  pol: '起运港', pod: '目的港', containerNo: '箱号', sealNo: '封号', marksNumbers: '唛头/件数',
  cargoDesc: '货描', grossWeight: '毛重', netWeight: '净重', volume: '体积', packageCount: '件数',
  packageUnit: '件数单位', billOfLadingNo: '提单号', invoiceNo: '发票号', amount: '金额',
  currency: '币种', date: '日期', dueDate: '到期日', remark: '备注',
};
const LANGS = ['中文', '英语', '日语', '韩语', '法语', '德语', '西班牙语'];

const chatInput = ref('');
const chatReply = ref('');
const chatModel = ref('');
const extractQuery = ref({ docType: 'box_list', text: '' });
const extractResult = ref(null);
const genQuery = ref({ kind: 'translate', targetLang: '英语', tone: '专业', input: '' });
const genResult = ref('');
const recQuery = ref({ kind: 'freight_rate', data: '' });
const recResult = ref('');
const loading = ref({ chat: false, extract: false, generate: false, recommend: false });

onMounted(async () => {
  try { cfg.value = await aiAPI.status(); } catch { /* 忽略状态获取失败 */ }
});

async function doChat() {
  if (!chatInput.value.trim()) return ElMessage.warning('请输入问题');
  loading.value.chat = true;
  try {
    const data = await aiAPI.chat({ question: chatInput.value });
    chatReply.value = data.content;
    chatModel.value = data.model || '';
  } catch (e) { chatReply.value = ''; } finally { loading.value.chat = false; }
}

async function doExtract() {
  if (!extractQuery.value.text.trim()) return ElMessage.warning('请粘贴待识别文本');
  loading.value.extract = true;
  try {
    extractResult.value = await aiAPI.extract({ text: extractQuery.value.text, docType: extractQuery.value.docType });
  } catch (e) { extractResult.value = null; } finally { loading.value.extract = false; }
}

async function doGenerate() {
  if (!genQuery.value.input.trim()) return ElMessage.warning('请输入内容');
  loading.value.generate = true;
  try {
    const data = await aiAPI.generate({ ...genQuery.value, input: genQuery.value.input });
    genResult.value = data.content;
  } catch (e) { genResult.value = ''; } finally { loading.value.generate = false; }
}

async function doRecommend() {
  if (!recQuery.value.data.trim()) return ElMessage.warning('请输入待分析数据');
  loading.value.recommend = true;
  try {
    const data = await aiAPI.recommend({ kind: recQuery.value.kind, data: recQuery.value.data });
    recResult.value = data.content;
  } catch (e) { recResult.value = ''; } finally { loading.value.recommend = false; }
}

function copyText(text) {
  navigator.clipboard.writeText(text || '').then(
    () => ElMessage.success('已复制'),
    () => ElMessage.warning('复制失败'),
  );
}
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
.reply-card { margin-top: 4px; }
.ai-label { display: flex; align-items: center; gap: 6px; color: var(--el-color-primary); font-weight: 600; margin-bottom: 8px; }
.ai-text { white-space: pre-wrap; word-break: break-word; line-height: 1.7; margin: 0; color: var(--el-text-color-primary); }
.field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.field-item { background: var(--el-fill-color-light); border-radius: 6px; padding: 8px 12px; display: flex; flex-direction: column; gap: 2px; }
.field-key { font-size: 12px; color: var(--el-text-color-secondary); }
.field-val { font-weight: 500; word-break: break-word; }
</style>