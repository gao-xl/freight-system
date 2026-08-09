import { defineStore } from 'pinia';
import { loginAPI, meAPI, logoutAPI, refreshAPI } from '@/api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    refreshToken: localStorage.getItem('refreshToken') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null'),
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    displayName: (s) => s.user?.name || s.user?.username || '',
    role: (s) => s.user?.role || '',
    permissions: (s) => s.user?.permissions || [],
  },
  actions: {
    // 持久化 token 对到 localStorage
    _persist() {
      localStorage.setItem('token', this.token);
      localStorage.setItem('refreshToken', this.refreshToken);
      localStorage.setItem('user', JSON.stringify(this.user));
    },
    async login(username, password) {
      const data = await loginAPI({ username, password });
      this.token = data.token;
      this.refreshToken = data.refreshToken || '';
      this.user = data.user;
      this._persist();
      return data;
    },
    // M3：用 refresh token 换取新 token 对（401 拦截器调用）
    async refresh() {
      if (!this.refreshToken) return null;
      const data = await refreshAPI({ refreshToken: this.refreshToken });
      this.token = data.token;
      this.refreshToken = data.refreshToken || '';
      this._persist();
      return data;
    },
    async fetchMe() {
      const user = await meAPI();
      this.user = user;
      localStorage.setItem('user', JSON.stringify(user));
    },
    // 权限判断：支持 'module:action' 或模块通配
    hasPermission(need) {
      if (!need) return true;
      const perms = this.permissions;
      if (perms.includes('*')) return true;
      const [module, action] = need.split(':');
      return perms.includes(need) || (action && perms.includes(`${module}:*`));
    },
    // 角色判断（兼容旧逻辑）
    hasRole(...roles) {
      return roles.includes(this.role);
    },
    // 端线下线：撤销当前会话（尽力而为，失败不阻塞本地登出）
    async logout() {
      try {
        if (this.token) await logoutAPI();
      } catch (e) {
        // 忽略远端下线失败
      }
      this.clear();
    },
    // 本地清空凭证（401 / 刷新失败兜底）
    clear() {
      this.token = '';
      this.refreshToken = '';
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    },
  },
});