import { defineStore } from 'pinia';
import { loginAPI, meAPI, logoutAPI, refreshAPI } from '@/api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    // 能力开关：PDF 渲染模式（低配服务器可选项）。默认 chromium=开启；off 时前端隐藏/禁用打印并提示
    pdfRenderer: 'chromium',
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    displayName: (s) => s.user?.name || s.user?.username || '',
    role: (s) => s.user?.role || '',
    permissions: (s) => s.user?.permissions || [],
    isPdfEnabled: (s) => s.pdfRenderer !== 'off',
  },
  actions: {
    // 持久化 access token 与 user 元数据（P0-2：refresh token 在 httpOnly cookie，不入 localStorage）
    _persist() {
      localStorage.setItem('token', this.token);
      localStorage.setItem('user', JSON.stringify(this.user));
    },
    async login(username, password) {
      const data = await loginAPI({ username, password });
      this.token = data.token;
      this.user = data.user;
      this._persist();
      return data;
    },
    // M3 刷新：refresh token 由浏览器 httpOnly cookie 自动携带，此处仅取新 access token
    async refresh() {
      const data = await refreshAPI();
      this.token = data.token;
      this.user = data.user || this.user;
      this._persist();
      return data;
    },
    async fetchMe() {
      const user = await meAPI();
      this.user = user;
      localStorage.setItem('user', JSON.stringify(user));
    },
    // 加载能力开关（PDF 渲染模式等），PDF 关闭时前端据此隐藏/禁用打印按钮
    async loadCapabilities() {
      try {
        const res = await fetch('/api/system/capabilities', { headers: { Authorization: `Bearer ${this.token}` } });
        if (!res.ok) return;
        const json = await res.json();
        if (json?.data?.pdf?.renderer) this.pdfRenderer = json.data.pdf.renderer;
      } catch (e) {
        // 忽略：能力获取失败时保持默认（chromium 开启态）
      }
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
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken'); // 清理历史遗留明文 refresh token
      localStorage.removeItem('user');
    },
  },
});