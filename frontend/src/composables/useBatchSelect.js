import { ref, computed } from 'vue';

export function useBatchSelect() {
  const selectedIds = ref([]);

  const hasSelection = computed(() => selectedIds.value.length > 0);

  function handleSelectChange(rows) {
    selectedIds.value = rows.map((r) => r.id);
  }

  function clearSelection() {
    selectedIds.value = [];
  }

  return { selectedIds, hasSelection, handleSelectChange, clearSelection };
}