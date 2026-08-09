<template>
  <el-dialog v-model="visible" title="在线补料(SI)" width="min(560px, 92vw)" destroy-on-close @closed="reset">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92px" @submit.prevent>
      <el-form-item label="发货人" prop="shipper">
        <el-input v-model="form.shipper" placeholder="发货人名称与地址" />
      </el-form-item>
      <el-form-item label="收货人" prop="consignee">
        <el-input v-model="form.consignee" placeholder="收货人名称与地址" />
      </el-form-item>
      <el-form-item label="通知人" prop="notifyParty">
        <el-input v-model="form.notifyParty" placeholder="通知方名称与地址" />
      </el-form-item>
      <el-form-item label="唛头/件数" prop="marksNumbers">
        <el-input v-model="form.marksNumbers" type="textarea" :rows="3" placeholder="唛头与件数描述" />
      </el-form-item>
      <el-form-item label="货描" prop="cargoDesc">
        <el-input v-model="form.cargoDesc" type="textarea" :rows="2" placeholder="货物描述（选填）" />
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" placeholder="其他补充说明（选填）" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" :icon="Promotion" @click="submit">提交补料</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Promotion } from '@element-plus/icons-vue';
import { portalAPI } from '@/api';

const props = defineProps({
  modelValue: Boolean,
  orderId: [Number, String],
  orderNo: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue', 'submitted']);

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});
const formRef = ref();
const submitting = ref(false);
const form = reactive({ shipper: '', consignee: '', notifyParty: '', marksNumbers: '', cargoDesc: '', remark: '' });

const rules = {
  shipper: [{ required: true, message: '请填写发货人', trigger: 'blur' }],
  consignee: [{ required: true, message: '请填写收货人', trigger: 'blur' }],
};

function reset() {
  Object.assign(form, { shipper: '', consignee: '', notifyParty: '', marksNumbers: '', cargoDesc: '', remark: '' });
  submitting.value = false;
}

async function submit() {
  if (!props.orderId) return ElMessage.warning('缺少订单信息，无法提交补料');
  await formRef.value.validate();
  submitting.value = true;
  try {
    await portalAPI.submitSI(props.orderId, { ...form });
    ElMessage.success('补料已提交，操作员将处理');
    visible.value = false;
    emit('submitted', props.orderId);
  } catch (e) {
    // 后端未就绪（404）时 fail-open：提示但不弹错、不阻塞
    if (e?.response?.status === 404) {
      ElMessage.warning('补料服务暂未开放，请联系操作员');
    } else {
      ElMessage.error(e?.response?.data?.message || '补料提交失败，请稍后重试');
    }
  } finally {
    submitting.value = false;
  }
}
</script>
