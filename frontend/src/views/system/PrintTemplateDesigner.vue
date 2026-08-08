<template>
  <PrintTemplateList
    v-if="mode === 'list'"
    :initial-doc-type="lastDocType"
    @edit="openEditor"
  />
  <PrintTemplateEditor
    v-else
    :template="editing"
    @cancel="mode = 'list'"
    @saved="mode = 'list'"
  />
</template>

<script setup>
import { ref } from 'vue';
import PrintTemplateList from './print/PrintTemplateList.vue';
import PrintTemplateEditor from './print/PrintTemplateEditor.vue';

const mode = ref('list');
const editing = ref(null);
const lastDocType = ref('bl');

function openEditor(tpl) {
  lastDocType.value = tpl?.docType || 'bl';
  editing.value = tpl;
  mode.value = 'editor';
}
</script>
