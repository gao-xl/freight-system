import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/tasks',
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
      { path: 'finance', name: 'finance', component: () => import('@/views/finance/FinanceList.vue'), meta: { title: '财务管理', icon: 'Money', permission: 'finance:read' } },
      { path: 'finance/statement', name: 'statement', component: () => import('@/views/finance/StatementList.vue'), meta: { title: '对账单', icon: 'Tickets', permission: 'finance:read' } },
      { path: 'import', name: 'import', component: () => import('@/views/import/ImportCenter.vue'), meta: { title: '数据导入', icon: 'Upload', permission: undefined } },
      { path: 'quotations', name: 'quotations', component: () => import('@/views/quotations/QuotationList.vue'), meta: { title: '报价询价', icon: 'PriceTag', permission: 'quotation:read' } },
      { path: 'quotations/edit/:id?', name: 'quotationEdit', component: () => import('@/views/quotations/QuotationEdit.vue'), meta: { title: '编辑报价', hidden: true, permission: 'quotation:create' } },
      { path: 'quotations/:id', name: 'quotationDetail', component: () => import('@/views/quotations/QuotationDetail.vue'), meta: { title: '报价详情', hidden: true, permission: 'quotation:read' } },
      { path: 'integrations', name: 'integrations', component: () => import('@/views/integrations/IntegrationList.vue'), meta: { title: '外部对接', icon: 'Connection', permission: 'integration:read' } },
      { path: 'alerts', name: 'alerts', component: () => import('@/views/alerts/AlertCenter.vue'), meta: { title: '预警中心', icon: 'Bell', permission: 'alert:read' } },
      { path: 'system', name: 'system', component: () => import('@/views/system/SystemManage.vue'), meta: { title: '系统管理', icon: 'Setting', permission: 'system:user' } },
      { path: 'system/groups', name: 'groups', component: () => import('@/views/system/GroupManage.vue'), meta: { title: '小组管理', hidden: true, permission: 'system:group' } },
      { path: 'system/company', name: 'company', component: () => import('@/views/system/CompanySetting.vue'), meta: { title: '公司设置', hidden: true, permission: 'system:company' } },
      { path: 'system/custom-fields', name: 'customFields', component: () => import('@/views/system/CustomFieldManage.vue'), meta: { title: '自定义字段', hidden: true, permission: 'system:custom' } },
      { path: 'system/print-templates', name: 'printTemplates', component: () => import('@/views/system/PrintTemplateDesigner.vue'), meta: { title: '打印设计', hidden: true, permission: 'print:read' } },
    ],
  },
  { path: '/portal', name: 'portal', component: () => import('@/views/portal/Portal.vue'), meta: { title: '客户自助门户' } },
  { path: '/403', name: 'forbidden', component: () => import('@/views/Forbidden.vue'), meta: { title: '无权限' } },
  { path: '/:pathMatch(.*)*', redirect: '/tasks' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  const token = localStorage.getItem('token');
  if (!to.meta.public && !token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.path === '/login' && token) {
    return { path: auth.role === 'customer' ? '/portal' : '/tasks' };
  }
  // 客户角色只能访问门户
  if (auth.role === 'customer' && to.path !== '/portal' && to.path !== '/403') {
    return { path: '/portal' };
  }
  // 权限校验
  if (to.meta.permission && token && !auth.hasPermission(to.meta.permission)) {
    return { path: '/403' };
  }
  document.title = (to.meta.title ? to.meta.title + ' - ' : '') + '货运代理管理系统';
  return true;
});

export default router;