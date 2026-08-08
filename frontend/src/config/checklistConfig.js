// Checklist 步骤配置（F8 可二开：改此文件即生效，无需改组件）
// 进度由 GET /api/onboarding/status 真实数据派生，零存储（AC-05）
// done 判定：companyConfigured 布尔 / 各资源 count >= 1；示例数据记录天然计入 count（isDemo 算完成）

export const checklistSteps = [
  {
    id: 'company',
    label: '完善公司信息',
    hint: '公司全称会显示在报价单、对账单上',
    route: '/system/company',
    // 打开弹窗场景：跳转后自动开新建弹窗（learning by doing）
    openNew: false,
    done: (status) => !!status?.companyConfigured,
  },
  {
    id: 'customer',
    label: '添加首个客户',
    hint: '客户是业务链路的起点',
    route: '/customers?new=1',
    openNew: true,
    done: (status) => Number(status?.customers || 0) >= 1,
  },
  {
    id: 'quotation',
    label: '录入第一份报价',
    hint: '报价可一键转成订单',
    route: '/quotations/edit',
    openNew: true,
    done: (status) => Number(status?.quotations || 0) >= 1,
  },
  {
    id: 'order',
    label: '创建第一笔订单',
    hint: '把报价变成真实订单',
    route: '/orders?new=1',
    openNew: true,
    done: (status) => Number(status?.orders || 0) >= 1,
  },
  // 进阶步骤
  {
    id: 'booking',
    label: '发起订舱',
    hint: '为订单订舱位',
    route: '/bookings',
    advanced: true,
    done: (status) => Number(status?.bookings || 0) >= 1,
  },
  {
    id: 'declaration',
    label: '安排报关',
    hint: '申报与放行',
    route: '/customs',
    advanced: true,
    done: (status) => Number(status?.declarations || 0) >= 1,
  },
  // 团队模式进阶：建组并分配权限（仅使用方式=团队时展示）
  {
    id: 'group',
    label: '创建小组并分配权限',
    hint: '团队协作按小组隔离数据',
    route: '/system/groups',
    advanced: true,
    teamOnly: true,
    done: (status, groupCount) => Number(groupCount || 0) >= 1,
  },
];

// 核心 4 步（跑通第一票的最小闭环）
export const CORE_IDS = ['company', 'customer', 'quotation', 'order'];

export const CHECKLIST_COPY = {
  title: '跑通第一票',
  subtitle: '完成以下步骤，就能跑通一票货的完整业务流。',
  timeHint: '约 2 分钟',
  followAlong: '跟着做一遍',
  dismiss: '不再显示',
  doneBanner: '已跑通第一票。后续可在帮助中心查看进阶教程。',
  doneAction: '查看帮助中心',
  doneAck: '知道了',
};
