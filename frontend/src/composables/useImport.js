import { ref } from 'vue';
import { ElMessageBox, ElMessage } from 'element-plus';

// 通用 Excel 批量导入逻辑
// opts: { importAPI: (fd)=>Promise, templateAPI: ()=>Promise(blob), refresh: ()=>void, fileName: string }
export function useImport(opts) {
  const visible = ref(false);
  const uploading = ref(false);
  const file = ref(null);
  const result = ref(null);

  function open() {
    file.value = null;
    result.value = null;
    visible.value = true;
  }

  function onFileChange(f) {
    file.value = f;
    result.value = null;
  }

  async function downloadTemplate() {
    try {
      const resp = await opts.templateAPI();
      const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${opts.fileName}_导入模板.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      ElMessage.error('模板下载失败');
    }
  }

  async function submit() {
    if (!file.value) return ElMessage.warning('请先选择 Excel 文件');
    const fd = new FormData();
    fd.append('file', file.value);
    uploading.value = true;
    try {
      const data = await opts.importAPI(fd);
      result.value = data;
      ElMessage.success(data.msg || '导入完成');
      opts.refresh && opts.refresh();
    } catch (e) {
      ElMessage.error(e?.response?.data?.message || '导入失败');
    } finally {
      uploading.value = false;
    }
  }

  function close() {
    visible.value = false;
  }

  return { visible, uploading, file, result, open, onFileChange, downloadTemplate, submit, close };
}