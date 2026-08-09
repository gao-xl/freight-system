import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';

const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
  // P0-2：允许携带 httpOnly refresh cookie（SameSite=Lax 同源自动带上；跨域需服务端 CORS credentials:true）
  withCredentials: true,
});

// 全局凭证读写（直接操作 localStorage，避免与 auth store/blog 循环依赖）
// P0-2：access token 仍经 header 携带；refresh token 已迁入 httpOnly cookie，JS 不可读，
//       不再写入 localStorage，仅保留 access token 与 user 元数据做本地校验。
const getToken = () => localStorage.getItem('token') || '';
const setTokens = ({ token, user }) => {
  if (token) localStorage.setItem('token', token);
  if (user) localStorage.setItem('user', JSON.stringify(user));
};
const clearTokens = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken'); // 清理历史遗留的明文 refresh token
  localStorage.removeItem('user');
};

request.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// M3：单飞刷新锁——同一时间只允许一个并发刷新请求，避免 N 个 401 同时触发刷新
let refreshing = null;

// 用 refresh token 换取新 token 对（走裸 axios，避免经本拦截器再次进入 401 处理）
// P0-2：refresh token 已迁入 httpOnly cookie，由浏览器 withCredentials 自动携带，body 不再传 token。
async function doRefresh() {
  const resp = await axios.post('/api/auth/refresh', {}, { timeout: 15000, withCredentials: true });
  const data = resp.data?.data;
  if (!data?.token) throw new Error('refresh-failed');
  setTokens(data);
  return data;
}

// 登出并跳转登录页
function forceLogout(message) {
  clearTokens();
  if (router.currentRoute.value.path !== '/login') {
    ElMessage.error(message || '登录已过期，请重新登录');
    router.push('/login');
  }
}

request.interceptors.response.use(
  (response) => {
    // blob 响应（下载/预览）直接放行
    if (response.config.responseType === 'blob') return response;
    const res = response.data;
    if (res.code !== 0) {
      ElMessage.error(res.message || '请求失败');
      return Promise.reject(new Error(res.message));
    }
    return res.data;
  },
  async (error) => {
    const status = error.response?.status;
    const config = error.config || {};
    const isAuthEndpoint = config.url?.includes('/auth/login') || config.url?.includes('/auth/refresh');

    if (status === 401 && !isAuthEndpoint && !config._retried) {
      config._retried = true;
      try {
        // 单飞：复用进行中的刷新 Promise
        if (!refreshing) {
          refreshing = doRefresh().finally(() => { refreshing = null; });
        }
        await refreshing;
        // 用新 token 重放原请求
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${getToken()}`;
        return request(config);
      } catch (e) {
        forceLogout();
        return Promise.reject(e);
      }
    }

    if (status === 401) {
      forceLogout();
      return Promise.reject(error);
    }

    if (!error.config?.silent) {
      // silent 请求（如门户 fail-open 下载/查询）由调用方按业务兜底提示，不在此统一弹错
      ElMessage.error(error.response?.data?.message || error.message || '网络错误');
    }
    return Promise.reject(error);
  }
);

export default request;