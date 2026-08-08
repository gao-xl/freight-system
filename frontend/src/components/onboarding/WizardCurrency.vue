<template>
  <div class="wizard-body">
    <div class="currency-grid">
      <div
        v-for="c in currencies"
        :key="c.value"
        class="currency-card"
        :class="{ active: model.defaultCurrency === c.value }"
        role="radio"
        :aria-checked="model.defaultCurrency === c.value"
        tabindex="0"
        @click="model.defaultCurrency = c.value"
        @keyup.enter="model.defaultCurrency = c.value"
      >
        <el-icon class="currency-icon"><Money /></el-icon>
        <div class="currency-code">{{ c.value }}</div>
        <div class="currency-name">{{ c.label }}</div>
        <el-icon v-if="model.defaultCurrency === c.value" class="currency-check"><CircleCheckFilled /></el-icon>
      </div>
    </div>
    <p class="hint">单据金额将按默认币种显示，可后续在设置中修改。</p>
  </div>
</template>

<script setup>
// 默认币种（读写 /api/system/defaults，默认 CNY）
defineProps({ model: { type: Object, required: true } });
const currencies = [
  { value: 'CNY', label: '人民币' },
  { value: 'USD', label: '美元' },
  { value: 'EUR', label: '欧元' },
];
</script>

<style scoped>
.wizard-body { padding: 8px 4px; }
.currency-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.currency-card {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px 12px;
  text-align: center;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard);
}
.currency-card:hover { border-color: var(--brand); }
.currency-card.active {
  border-color: var(--brand);
  background: var(--onboard-bg);
  box-shadow: 0 0 0 1px var(--brand) inset;
}
.currency-card:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
.currency-icon { font-size: 28px; color: var(--brand); }
.currency-code { font-size: 16px; font-weight: 600; color: var(--text-main); margin-top: 8px; font-family: var(--font-num); }
.currency-name { font-size: 12px; color: var(--text-sub); margin-top: 2px; }
.currency-check { position: absolute; top: 10px; right: 10px; color: var(--brand); font-size: 16px; }
.hint { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }
@media (max-width: 520px) {
  .currency-grid { grid-template-columns: 1fr; }
}
</style>
