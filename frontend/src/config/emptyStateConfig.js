// 空状态文案配置（F8 可二开：改此文件即生效，无需改组件）
// 三档场景（AC-08/09/10）：
//   empty    —— 资源为空（onboarding/status count=0）→ EmptyGuide 引导卡
//   filtered —— 列表有数据但筛选无结果 → 原列表空态 +「重置筛选」，绝不用引导卡
//   preStep  —— 上游未就绪（如订单页无报价）→ EmptyGuide + preStepHint 链路提示
// 图标为 @element-plus/icons-vue 组件名（全局注册，可直接字符串引用）

export const emptyStateConfig = {
  // 核心页：完整形态（带主行动按钮 + 上游感知）
  customers: {
    icon: 'User',
    title: '还没有客户',
    hint: '客户是业务链路的起点。添加第一个客户后，可以继续录入报价、创建订单。',
    actionText: '添加第一个客户',
    actionTo: '/customers?new=1',
  },
  quotations: {
    icon: 'PriceTag',
    title: '还没有报价',
    hint: '先录一份报价，报价可一键转成订单。',
    actionText: '录入第一份报价',
    actionTo: '/quotations/edit',
  },
  orders: {
    icon: 'Tickets',
    title: '还没有订单',
    hint: '从已有报价一键创建，或直接新建订单。',
    actionText: '新建第一笔订单',
    actionTo: '/orders?new=1',
    // 上游感知：报价也空时提示先去录报价
    preStepHint: '还没有报价时，先录一份报价，报价可一键转订单。',
    preStepActionText: '去录报价',
    preStepActionTo: '/quotations/edit',
  },
  finance: {
    icon: 'Money',
    title: '还没有费用记录',
    hint: '订单出账后自动生成应收，也可手动录入费用。',
    actionText: '去创建订单',
    actionTo: '/orders?new=1',
    preStepHint: '订单出账后自动生成应收。先去创建订单，再回来录费用。',
  },
  bookings: {
    icon: 'Ship',
    title: '还没有订舱记录',
    hint: '订单创建后可发起订舱，系统将跟踪进港、装船、到港节点。',
    actionText: '去创建订单',
    actionTo: '/orders?new=1',
    preStepHint: '订舱依赖订单。先去创建订单，再回来发起订舱。',
  },
  customs: {
    icon: 'Stamp',
    title: '还没有报关记录',
    hint: '订舱后可发起报关申报，系统将跟踪申报、查验、放行。',
    actionText: '去发起订舱',
    actionTo: '/bookings',
    preStepHint: '报关依赖订舱。先去发起订舱，再回来安排报关。',
  },
  documents: {
    icon: 'Files',
    title: '还没有单证',
    hint: '订单与订舱完成后可生成单证（提单 / 发票 / 装箱单）。',
    actionText: '去查看订单',
    actionTo: '/orders',
    preStepHint: '单证依赖订单与订舱。先去创建订单，再回来生成单证。',
  },
  freightRates: {
    icon: 'DataLine',
    title: '还没有运价',
    hint: '录入常用航线运价，报价时可直接引用。',
    actionText: '新建运价',
    actionTo: '/quotations',
  },
  suppliers: {
    icon: 'OfficeBuilding',
    title: '还没有供应商',
    hint: '录入合作船司 / 报关行，便于成本录入。',
    actionText: '新建供应商',
    actionTo: '/suppliers',
  },
  tracking: {
    icon: 'MapLocation',
    title: '还没有跟踪节点',
    hint: '有在途订单后自动产生跟踪节点。',
    actionText: '去创建订单',
    actionTo: '/orders?new=1',
    preStepHint: '跟踪依赖在途订单。先去创建订单，再回来查看跟踪。',
  },
  alerts: {
    icon: 'Bell',
    title: '暂无预警',
    hint: '订单异常时自动产生预警，创建订单后系统开始监控。',
    actionText: '去创建订单',
    actionTo: '/orders?new=1',
    preStepHint: '预警依赖业务数据。先去创建订单，系统开始监控后这里会出现预警。',
  },
  reports: {
    icon: 'DataAnalysis',
    title: '还没有报表数据',
    hint: '有数据后自动生成报表。',
    actionText: '去创建订单',
    actionTo: '/orders?new=1',
    preStepHint: '报表依赖业务数据。先去录入业务数据，再回来查看报表。',
  },
  printTemplates: {
    icon: 'Printer',
    title: '还没有自定义模板',
    hint: '系统已内置常用单据模板，可直接选用。',
    actionText: '查看模板',
    actionTo: '/print-templates',
  },
  company: {
    icon: 'OfficeBuilding',
    title: '公司信息未配置',
    hint: '单据上会显示公司名称，请先完成公司信息配置。',
    actionText: '去配置',
    actionTo: '/system/company',
  },
  // 筛选无结果（AC-09：绝不使用引导卡，仅提示重置）
  filtered: {
    title: '没有匹配当前筛选条件的数据',
    hint: '试试调整关键词或清空筛选条件。',
    actionText: '重置筛选条件',
  },
  // 示例数据存在（有 isDemo 记录时提示语替换）
  demoExists: {
    title: '这是示例数据',
    hint: '可清空后录入真实数据。',
    actionText: '清空示例数据',
  },
  // 通用次动作
  common: {
    tutorialText: '查看教程',
    demoText: '一键生成示例数据',
  },
};
