import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useOnboardingStore } from '@/stores/onboarding';
import { getOnboardingStatus } from '@/api/onboarding';

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true } },
  // Onboarding：初始化创建首账号（公开，未初始化时入口）/ 强制改密 / 快速开始向导
  { path: '/setup-admin', name: 'setupAdmin', component: () => import('@/views/onboarding/SetupAdmin.vue'), meta: { public: true, title: '初始化系统' } },
  { path: '/setup-password', name: 'setupPassword', component: () => import('@/views/onboarding/SetupPassword.vue'), meta: { title: '设置新密码' } },
  { path: '/onboarding', name: 'onboarding', component: () => import('@/views/onboarding/OnboardingWizard.vue'), meta: { title: '快速开始' } },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    // 按权限返回安全首页（避免落到无权限页触发 403 死循环）
    redirect: () => safeHome(useAuthStore()),
    children: [
      { path: 'tasks', name: 'tasks', component: () => import('@/views/tasks/TodoWorkbench.vue'), meta: { title: '待办工作台', icon: 'Memo', permission: undefined } },
      { path: 'dashboard', name: 'dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '经营看板', icon: 'Odometer', permission: 'dashboard:read' } },
      { path: 'customers', name: 'customers', component: () => import('@/views/customers/CustomerList.vue'), meta: { title: '客户管理', icon: 'User', permission: 'customer:read' } },
      { path: 'customers/:id', name: 'customerDetail', component: () => import('@/views/customers/CustomerDetail.vue'), meta: { title: '客户详情', hidden: true, permission: 'customer:read' } },
      { path: 'suppliers', name: 'suppliers', component: () => import('@/views/suppliers/SupplierList.vue'), meta: { title: '供应商管理', icon: 'OfficeBuilding', permission: 'supplier:read' } },
      { path: 'orders', name: 'orders', component: () => import('@/views/orders/OrderList.vue'), meta: { title: '订单管理', icon: 'Document', permission: 'order:read' } },
      { path: 'orders/:id', name: 'orderDetail', component: () => import('@/views/orders/OrderDetail.vue'), meta: { title: '订单详情', hidden: true, permission: 'order:read' } },
      { path: 'bookings', name: 'bookings', component: () => import('@/views/bookings/BookingList.vue'), meta: { title: '订舱管理', icon: 'Ship', permission: 'booking:read' } },
      { path: 'customs', name: 'customs', component: () => import('@/views/customs/CustomsList.vue'), meta: { title: '报关管理', icon: 'Stamp', permission: 'customs:read' } },
      { path: 'documents', name: 'documents', component: () => import('@/views/documents/DocumentList.vue'), meta: { title: '单证管理', icon: 'Files', permission: 'document:read' } },
      { path: 'tracking', name: 'tracking', component: () => import('@/views/tracking/TrackingList.vue'), meta: { title: '运输跟踪', icon: 'MapLocation', permission: 'track:read' } },
      { path: 'qingdao', name: 'qingdao', component: () => import('@/views/qingdao/QingdaoPortal.vue'), meta: { title: '青岛港看板', icon: 'Ship', permission: 'qingdao:read' } },
      { path: 'yards', name: 'yards', component: () => import('@/views/yards/YardQuery.vue'), meta: { title: '场站查询', icon: 'Van', permission: 'yard:read' } },
      { path: 'external', name: 'external', component: () => import('@/views/external/ExternalQuery.vue'), meta: { title: '外部数据', icon: 'DataAnalysis', permission: 'track:read' } },
      { path: 'ai', name: 'ai', component: () => import('@/views/ai/AiWorkbench.vue'), meta: { title: 'AI 助手', icon: 'MagicStick', permission: 'ai:use' } },
      { path: 'finance', name: 'finance', component: () => import('@/views/finance/FinanceList.vue'), meta: { title: '财务管理', icon: 'Money', permission: 'finance:read' } },
      { path: 'finance/invoices', name: 'invoices', component: () => import('@/views/finance/InvoiceList.vue'), meta: { title: '发票管理', icon: 'Ticket', permission: 'finance:read' } }, // N2
      { path: 'finance/statement', name: 'statement', component: () => import('@/views/finance/StatementList.vue'), meta: { title: '对账单', icon: 'Tickets', permission: 'finance:read' } },
      { path: 'finance/profit-report', name: 'profitReport', component: () => import('@/views/finance/ProfitReport.vue'), meta: { title: '利润报表', icon: 'DataAnalysis', permission: 'finance:read' } },
      { path: 'import', name: 'import', component: () => import('@/views/import/ImportCenter.vue'), meta: { title: '数据导入', icon: 'Upload', permission: undefined } },
      { path: 'quotations', name: 'quotations', component: () => import('@/views/quotations/QuotationList.vue'), meta: { title: '报价询价', icon: 'PriceTag', permission: 'quotation:read' } },
      { path: 'quotations/edit/:id?', name: 'quotationEdit', component: () => import('@/views/quotations/QuotationEdit.vue'), meta: { title: '编辑报价', hidden: true, permission: 'quotation:create' } },
      { path: 'quotations/:id', name: 'quotationDetail', component: () => import('@/views/quotations/QuotationDetail.vue'), meta: { title: '报价详情', hidden: true, permission: 'quotation:read' } },
      { path: 'integrations', name: 'integrations', component: () => import('@/views/integrations/IntegrationList.vue'), meta: { title: '外部对接', icon: 'Connection', permission: 'integration:read' } },
      { path: 'alerts', name: 'alerts', component: () => import('@/views/alerts/AlertCenter.vue'), meta: { title: '预警中心', icon: 'Bell', permission: 'alert:read' } },
      { path: 'messages', name: 'messages', component: () => import('@/views/messages/MessageCenter.vue'), meta: { title: '消息中心', icon: 'Message', permission: undefined } },
      { path: 'system', name: 'system', component: () => import('@/views/system/SystemManage.vue'), meta: { title: '系统管理', icon: 'Setting', permission: 'system:user' } },
      { path: 'system/health', name: 'health', component: () => import('@/views/system/HealthCheck.vue'), meta: { title: '系统健康', icon: 'Monitor', permission: 'system:user' } },
      { path: 'system/security-check', name: 'securityCheck', component: () => import('@/views/system/SecurityCheck.vue'), meta: { title: '安全检测', icon: 'Lock', permission: 'system:user' } },
      { path: 'system/groups', name: 'groups', component: () => import('@/views/system/GroupManage.vue'), meta: { title: '小组管理', hidden: true, permission: 'system:group' } },
      { path: 'system/company', name: 'company', component: () => import('@/views/system/CompanySetting.vue'), meta: { title: '公司设置', hidden: true, permission: 'system:company' } },
      { path: 'system/notification-settings', name: 'notificationSettings', component: () => import('@/views/system/NotificationSettings.vue'), meta: { title: '通知配置', hidden: true, permission: 'integration:update' } },
      { path: 'system/ai-settings', name: 'aiSettings', component: () => import('@/views/system/AiProviderSettings.vue'), meta: { title: 'AI 设置', hidden: true, permission: 'integration:update' } },
      { path: 'system/custom-fields', name: 'customFields', component: () => import('@/views/system/CustomFieldManage.vue'), meta: { title: '自定义字段', hidden: true, permission: 'system:custom' } },
      { path: 'system/business-rules', name: 'businessRules', component: () => import('@/views/system/BusinessRuleManage.vue'), meta: { title: '业务规则', hidden: true, permission: 'alert:read' } },
      { path: 'system/workflow', name: 'workflow', component: () => import('@/views/system/WorkflowConfig.vue'), meta: { title: '流程配置', hidden: true, permission: 'alert:read' } },
      { path: 'system/reports', name: 'reports', component: () => import('@/views/system/ReportDesigner.vue'), meta: { title: '报表设计', hidden: true, permission: 'dashboard:read' } },
      { path: 'system/print-templates', redirect: '/print-templates' },
      { path: 'print-templates', name: 'printTemplates', component: () => import('@/views/system/PrintTemplateDesigner.vue'), meta: { title: '单证模板', icon: 'Tickets', permission: 'print:read' } },
      { path: 'docs', name: 'docs', component: () => import('@/views/DocsView.vue'), meta: { title: '开发文档', icon: 'Reading' } },
      { path: 'guide', name: 'guide', component: () => import('@/views/GuideView.vue'), meta: { title: '使用教程', icon: 'Reading' } },
    ],
  },
  { path: '/portal', name: 'portal', component: () => import('@/views/portal/Portal.vue'), meta: { title: '客户自助门户' } },
  { path: '/403', name: 'forbidden', component: () => import('@/views/Forbidden.vue'), meta: { title: '无权限' } },
  { path: '/:pathMatch(.*)*', redirect: () => safeHome(useAuthStore()) },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 按权限返回可访问的默认首页（替代仅按角色，避免落到无权限页触发 403 死循环）
// P0.4 角色化首页：根据用户角色 + 权限点返回最匹配的首页
export function safeHome(auth) {
  // 客户门户角色
  if (auth.role === 'customer') return '/portal';
  // 管理员/财务角色优先看经营看板
  if (auth.role === 'admin' && auth.hasPermission('dashboard:read')) return '/dashboard';
  // 财务角色：直接进财务页
  if (auth.role === 'finance' && auth.hasPermission('finance:read')) return '/finance';
  // 操作角色：进待办工作台
  if (auth.role === 'operator' && auth.hasPermission('order:read')) return '/tasks';
  // 销售角色：进客户管理
  if (auth.role === 'sales' && auth.hasPermission('customer:read')) return '/customers';
  // 按权限点兜底
  if (auth.hasPermission('dashboard:read')) return '/dashboard';
  if (auth.hasPermission('finance:read')) return '/finance';
  if (auth.hasPermission('order:read')) return '/orders';
  if (auth.hasPermission('customer:read')) return '/customers';
  if (auth.hasPermission('quotation:read')) return '/quotations';
  return '/tasks'; // 待办工作台无需权限，作为兜底
}

// AC-01：首次登录且系统未配置公司 → 重定向 /onboarding（可跳过；完成/跳过标记后不再出现）
// 判定依赖 GET /onboarding/status（权威源）；接口未就绪时 fail-open，不打扰存量用户
async function shouldRedirectOnboarding() {
  const onboarding = useOnboardingStore();
  if (onboarding.flags.wizardFinished) return false;
  try {
    const status = await getOnboardingStatus();
    if (!status) return false;
    const hasData = Number(status.customers || 0) > 0 || Number(status.quotations || 0) > 0 || Number(status.orders || 0) > 0;
    const configured = !!status.companyConfigured || hasData;
    if (configured) {
      // 自愈：存量系统已有数据 → 补写完成标记，避免反复拦截
      onboarding.setFlag('wizardFinished', true);
      return false;
    }
    return true;
  } catch {
    return false; // 后端未就绪/网络异常 → 不拦截
  }
}

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const token = localStorage.getItem('token');
  if (!to.meta.public && !token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.path === '/login' && token) {
    return { path: safeHome(auth) };
  }
  // Onboarding：默认账号首登强制改密（customer 门户账号除外），改密前拦在系统外
  if (token && auth.user?.mustChangePassword && auth.role !== 'customer' && to.path !== '/setup-password') {
    return { path: '/setup-password' };
  }
  // 客户角色只能访问门户
  if (auth.role === 'customer' && to.path !== '/portal' && to.path !== '/403') {
    return { path: '/portal' };
  }
  // U11：非客户角色访问门户 → 重定向回主系统（避免空 customerId 白闪报错）
  if (to.path === '/portal' && auth.role && auth.role !== 'customer') {
    return { path: safeHome(auth) };
  }
  // AC-01：首次登录 → /onboarding（引导完成后不再出现；customer 门户不参与）
  if (token && auth.role && auth.role !== 'customer'
    && !['/onboarding', '/setup-password', '/setup-admin', '/login', '/portal', '/403'].includes(to.path)
    && await shouldRedirectOnboarding()) {
    return { path: '/onboarding' };
  }
  // 权限校验
  if (to.meta.permission && token && !auth.hasPermission(to.meta.permission)) {
    return { path: '/403' };
  }
  document.title = (to.meta.title ? to.meta.title + ' - ' : '') + '货运代理管理系统';
  return true;
});

export default router;