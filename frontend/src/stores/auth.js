import { defineStore } from 'pinia';
import { loginAPI, meAPI } from '@/api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null'),
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    displayName: (s) => s.user?.name || s.user?.username || '',
    role: (s) => s.user?.role || '',
    permissions: (s) => s.user?.permissions || [],
  },
  actions: {
    async login(username, password) {
      const data = await loginAPI({ username, password });
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
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
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
  },
});