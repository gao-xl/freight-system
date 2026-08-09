<template>
  <div class="wizard-body">
    <el-form label-position="top" size="large">
      <el-form-item label="当前密码">
        <el-input v-model="model.oldPassword" type="password" show-password placeholder="当前管理员初始密码" />
      </el-form-item>
      <el-form-item label="新密码" :error="model.newPassword ? (model.newPassword.length < 8 || !/[a-zA-Z]/.test(model.newPassword) || !/\d/.test(model.newPassword) ? '至少 8 位，含字母和数字' : '') : ''">
        <el-input v-model="model.newPassword" type="password" show-password placeholder="至少 8 位，含字母和数字" />
      </el-form-item>
      <el-form-item label="确认密码" :error="model.confirm && model.confirm !== model.newPassword ? '两次密码不一致' : ''">
        <el-input v-model="model.confirm" type="password" show-password placeholder="再次输入新密码" />
      </el-form-item>
    </el-form>
    <p class="hint">系统默认管理员账号已初始化，请输入当前管理员初始密码并设置新密码后继续。</p>
  </div>
</template>

<script setup>
// 设置管理员密码（仅 mustChangePassword 出现；后端改密需校验当前密码）
defineProps({ model: { type: Object, required: true } });
</script>

<style scoped>
.wizard-body { padding: 8px 4px; }
.hint { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }
</style>
