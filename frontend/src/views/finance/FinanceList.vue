<template>
  <div>
    <!-- 页面标题 -->
    <div class="page-heading">
      <div class="title"><el-icon><Money /></el-icon>财务管理
        <el-button link type="primary" style="margin-left:12px" @click="openTplMgr"><el-icon><Collection /></el-icon>费用模板</el-button>
      </div>
      <span class="page-desc">应收应付流水 · 对账 · 毛利</span>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">应收总额</div><div class="value" style="color:var(--danger)">{{ money(summary.receivable) }}</div>
        <div class="sub">已收 {{ money(summary.received) }}</div>
      </div>
      <div class="stat-card" style="border-color:var(--warning)">
        <div class="label">未收余额</div><div class="value" style="color:var(--warning)">{{ money(summary.receivableBalance) }}</div>
        <div class="sub">应收 - 已收</div>
      </div>
      <div class="stat-card" style="border-color:var(--success)">
        <div class="label">应付总额</div><div class="value" style="color:var(--success)">{{ money(summary.payable) }}</div>
        <div class="sub">已付 {{ money(summary.paid) }}</div>
      </div>
      <div class="stat-card" style="border-color:#059669">
        <div class="label">未付余额</div><div class="value" style="color:#059669">{{ money(summary.payableBalance) }}</div>
        <div class="sub">应付 - 已付</div>
      </div>
      <div class="stat-card" style="border-color:#7c3aed">
        <div class="label">毛利</div><div class="value" style="color:#7c3aed">{{ money(summary.profit) }}</div>
        <div class="sub">应收 - 应付</div>
      </div>
    </div>

    <!-- N5 应收账龄 -->
    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">
        应收账龄（本币 · 按未收余额分桶）
        <el-button link type="primary" style="float:right" @click="loadAging"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <div v-if="aging.totalBalance != null" class="aging-grid">
        <div v-for="b in agingBuckets" :key="b.key" class="aging-cell" :class="b.cls">
          <span>{{ b.label }}</span><b>{{ money(b.total) }}</b>
        </div>
        <div class="aging-cell total"><span>未收总额</span><b>{{ money(aging.totalBalance) }}</b></div>
      </div>
      <el-table :data="aging.customers" size="small" stripe max-height="320" v-loading="agingLoading">
        <el-table-column label="客户" min-width="180"><template #default="{ row }">{{ row.name }}</template></el-table-column>
        <el-table-column label="未收余额" width="130" align="right"><template #default="{ row }">{{ money(row.balance) }}</template></el-table-column>
        <el-table-column label="0-30天" width="110" align="right"><template #default="{ row }">{{ money(row.buckets['0-30'] || 0) }}</template></el-table-column>
        <el-table-column label="31-60天" width="110" align="right"><template #default="{ row }">{{ money(row.buckets['31-60'] || 0) }}</template></el-table-column>
        <el-table-column label="61-90天" width="110" align="right"><template #default="{ row }">{{ money(row.buckets['61-90'] || 0) }}</template></el-table-column>
        <el-table-column label="90天+" width="110" align="right"><template #default="{ row }">{{ money(row.buckets['90+'] || 0) }}</template></el-table-column>
      </el-table>
      <el-empty v-if="!agingLoading && !aging.customers?.length" description="暂无应收未收记录" :image-size="60" />
    </div>

    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">
        多币种汇总（基准 USD）
        <el-button link type="primary" style="float:right" @click="loadCurrency"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <el-table :data="currency.list" size="small" v-loading="curLoading">
        <el-table-column prop="currency" label="币种" width="90" />
        <el-table-column label="应收" width="130" align="right"><template #default="{ row }">{{ money(row.receivable) }}</template></el-table-column>
        <el-table-column label="已收" width="130" align="right"><template #default="{ row }">{{ money(row.received) }}</template></el-table-column>
        <el-table-column label="应付" width="130" align="right"><template #default="{ row }">{{ money(row.payable) }}</template></el-table-column>
        <el-table-column label="已付" width="130" align="right"><template #default="{ row }">{{ money(row.paid) }}</template></el-table-column>
        <el-table-column label="折合USD应收" width="140" align="right"><template #default="{ row }">{{ row.receivableBase == null ? '-' : money(row.receivableBase) }}</template></el-table-column>
      </el-table>
      <div v-if="currency.total" class="currency-total">
        折合基准合计：应收 {{ money(currency.total.receivable) }} · 已收 {{ money(currency.total.received) }} · 应付 {{ money(currency.total.payable) }} · 已付 {{ money(currency.total.paid) }} USD
      </div>
    </div>

    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">
        币种级对账（核销差异）
        <el-tag :type="reconcile.reconciled ? 'success' : 'warning'" size="small" style="margin-left:8px">
          {{ reconcile.reconciled ? '全部已核销' : `${reconcile.unsettledCount} 个币种存在未核销差异` }}
        </el-tag>
        <el-button link type="primary" style="float:right" @click="loadReconcile"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <el-table :data="reconcile.list" size="small" v-loading="recLoading">
        <el-table-column prop="currency" label="币种" width="90" />
        <el-table-column label="应收已核销" width="130" align="right"><template #default="{ row }">{{ money(row.receivableBalance) }}</template></el-table-column>
        <el-table-column label="应收状态" width="110">
          <template #default="{ row }"><el-tag :type="REC_STATUS[row.receivableStatus]?.type || 'info'" size="small">{{ REC_STATUS[row.receivableStatus]?.text || row.receivableStatus }}</el-tag></template>
        </el-table-column>
        <el-table-column label="应付未核销" width="130" align="right"><template #default="{ row }">{{ money(row.payableBalance) }}</template></el-table-column>
        <el-table-column label="应付状态" width="110">
          <template #default="{ row }"><el-tag :type="REC_STATUS[row.payableStatus]?.type || 'info'" size="small">{{ REC_STATUS[row.payableStatus]?.text || row.payableStatus }}</el-tag></template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!recLoading && !reconcile.list?.length" description="暂无财务记录" :image-size="50" />
    </div>

    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">账期管理（结账 / 扎帐 / 锁帐）</div>
      <div class="period-toolbar">
        <el-select v-model="periodYear" style="width:130px" @change="loadPeriods">
          <el-option v-for="y in periodYears" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-button @click="ensurePeriods" :loading="ensuring"><el-icon><Refresh /></el-icon>补齐账期</el-button>
        <el-button @click="loadPeriods" :loading="periodLoading"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <el-table :data="periods" size="small" v-loading="periodLoading" empty-text="暂无账期">
        <el-table-column prop="periodCode" label="账期" width="90" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="PERIOD_STATUS[row.status]?.type || 'info'" size="small">{{ PERIOD_STATUS[row.status]?.text || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="应收" align="right" width="110"><template #default="{ row }">{{ money(row.receivable) }}</template></el-table-column>
        <el-table-column label="应付" align="right" width="110"><template #default="{ row }">{{ money(row.payable) }}</template></el-table-column>
        <el-table-column label="余额" align="right" width="110"><template #default="{ row }">{{ money(row.balance) }}</template></el-table-column>
        <el-table-column label="毛利" align="right" width="110"><template #default="{ row }">{{ money(row.profit) }}</template></el-table-column>
        <el-table-column label="结账信息" min-width="150">
          <template #default="{ row }">
            <span v-if="row.closedAt" class="period-meta">{{ row.closedBy ? '#' + row.closedBy : '' }} {{ fmtTime(row.closedAt) }}</span>
            <span v-else class="period-meta">未结账</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status !== 'locked'" link type="primary" @click="openClose(row)">结账</el-button>
            <el-button v-if="row.status === 'open'" link type="warning" @click="openLock(row)">锁帐</el-button>
            <el-button v-if="row.status === 'locked'" link type="danger" @click="openUnlock(row)">解锁</el-button>
            <el-button link type="info" @click="viewStatement(row)">结账单</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 结账原因 -->
    <el-dialog v-model="closeDialog" title="结账 / 扎帐" width="440px">
      <el-form label-width="80px">
        <el-form-item label="账期"><b>{{ closeTarget?.periodCode }}</b></el-form-item>
        <el-form-item label="备注"><el-input v-model="closeMsg" type="textarea" :rows="3" placeholder="结账备注（可选）" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog = false">取消</el-button>
        <el-button type="primary" :loading="periodActing" @click="doClose">确认结账</el-button>
      </template>
    </el-dialog>

    <!-- 锁帐原因 -->
    <el-dialog v-model="lockDialog" title="锁帐" width="440px">
      <div class="batch-tip">锁帐后该账期内的费用记录将禁止新增、编辑、删除与核销，请谨慎操作。</div>
      <el-form label-width="80px">
        <el-form-item label="账期"><b>{{ lockTarget?.periodCode }}</b></el-form-item>
        <el-form-item label="备注"><el-input v-model="lockMsg" type="textarea" :rows="3" placeholder="锁帐备注（可选）" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="lockDialog = false">取消</el-button>
        <el-button type="warning" :loading="periodActing" @click="doLock">确认锁帐</el-button>
      </template>
    </el-dialog>

    <!-- 解锁原因（必填） -->
    <el-dialog v-model="unlockDialog" title="解锁" width="440px">
      <el-form label-width="80px">
        <el-form-item label="账期"><b>{{ unlockTarget?.periodCode }}</b></el-form-item>
        <el-form-item label="原因" required><el-input v-model="unlockMsg" type="textarea" :rows="3" placeholder="解锁必须填写原因" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="unlockDialog = false">取消</el-button>
        <el-button type="danger" :loading="periodActing" @click="doUnlock">确认解锁</el-button>
      </template>
    </el-dialog>

    <!-- 结账单 -->
    <el-dialog v-model="stmtDialog" title="结账单" width="640px">
      <template v-if="stmt">
        <div class="stmt-head">
          <div class="stmt-title">账期 {{ stmt.period.periodCode }} 结账单</div>
          <div class="stmt-status">
            <el-tag :type="PERIOD_STATUS[stmt.period.status]?.type || 'info'" size="small">{{ PERIOD_STATUS[stmt.period.status]?.text || stmt.period.status }}</el-tag>
          </div>
        </div>
        <div class="stmt-grid">
          <div class="stmt-cell"><span>应收</span><b>{{ money(stmt.summary.receivable) }}</b></div>
          <div class="stmt-cell"><span>已收</span><b>{{ money(stmt.summary.received) }}</b></div>
          <div class="stmt-cell"><span>应付</span><b>{{ money(stmt.summary.payable) }}</b></div>
          <div class="stmt-cell"><span>已付</span><b>{{ money(stmt.summary.paid) }}</b></div>
          <div class="stmt-cell"><span>余额</span><b>{{ money(stmt.summary.balance) }}</b></div>
          <div class="stmt-cell"><span>毛利</span><b>{{ money(stmt.summary.profit) }}</b></div>
        </div>
        <el-table :data="stmt.items" size="small" max-height="320">
          <el-table-column label="方向" width="70"><template #default="{ row }">{{ FIN_DIRECTION[row.direction]?.text }}</template></el-table-column>
          <el-table-column prop="description" label="说明" min-width="150" show-overflow-tooltip />
          <el-table-column label="金额" width="110" align="right"><template #default="{ row }">{{ row.amount }} {{ row.currency }}</template></el-table-column>
          <el-table-column label="已收付" width="100" align="right"><template #default="{ row }">{{ row.paidAmount }}</template></el-table-column>
        </el-table>
      </template>
      <template #footer><el-button @click="stmtDialog = false">关闭</el-button></template>
    </el-dialog>


    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">月度应收/应付趋势（按流水创建时间）</div>
      <div ref="trendRef" class="trend-chart"></div>
    </div>

    <div class="page-card">
      <div class="table-topbar">
        <div class="left">
          <el-input v-model="query.keyword" placeholder="搜索说明/发票号" clearable style="width:240px" @keyup.enter="load(1)" @clear="load(1)">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="query.direction" placeholder="方向" clearable style="width:110px" @change="load(1)">
            <el-option label="应收" value="receivable" /><el-option label="应付" value="payable" />
          </el-select>
          <el-select v-model="query.status" placeholder="状态" clearable style="width:120px" @change="load(1)">
            <el-option v-for="(v,k) in FIN_STATUS" :key="k" :label="v.text" :value="k" />
          </el-select>
          <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
        </div>
      <div class="right-btn">
        <template v-if="multiple.length">
          <el-button type="success" plain @click="openBatchWriteoff">批量记为已收付</el-button>
          <el-button type="warning" plain @click="openPayment">收款核销</el-button>
          <el-button type="danger" plain @click="batchRemove">批量删除</el-button>
          <el-divider direction="vertical" />
        </template>
        <el-button @click="exportExcel"><el-icon><Download /></el-icon>导出Excel</el-button>
        <el-button @click="openFx"><el-icon><Coin /></el-icon>汇率管理</el-button>
        <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon>新增费用</el-button>
      </div>
    </div>

      <el-table :data="list" v-loading="loading" stripe @selection-change="onSelect">
        <el-table-column type="selection" width="46" />
        <el-table-column label="方向" width="80">
          <template #default="{ row }"><el-tag :type="FIN_DIRECTION[row.direction].type" size="small">{{ FIN_DIRECTION[row.direction].text }}</el-tag></template>
        </el-table-column>
        <el-table-column label="类别" width="120">
          <template #default="{ row }">{{ dictText(FIN_CATEGORY, row.category) }}</template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="170" show-overflow-tooltip />
        <el-table-column label="订单" min-width="130">
          <template #default="{ row }"><el-link v-if="row.order" type="primary" @click="goOrder(row)">{{ row.order.orderNo }}</el-link><span v-else>-</span></template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">{{ row.amount }} {{ row.currency }}</template>
        </el-table-column>
        <el-table-column label="已收付" width="110" align="right">
          <template #default="{ row }">{{ row.paidAmount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="statusOf(FIN_STATUS, row.status).type" size="small">{{ statusOf(FIN_STATUS, row.status).text }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-tooltip v-if="recordLocked(row)" content="该记录所属账期已锁帐，禁止修改" placement="top">
              <span>
                <el-button link type="primary" disabled>编辑</el-button>
                <el-button v-if="row.status !== 'paid'" link type="success" disabled>记为已收付</el-button>
                <el-button v-if="row.status !== 'paid' && row.status !== 'waived'" link type="danger" disabled>红冲</el-button>
                <el-button link type="danger" disabled>删除</el-button>
              </span>
            </el-tooltip>
            <template v-else>
              <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
              <el-button v-if="row.status !== 'paid'" link type="success" @click="markPaid(row)">记为已收付</el-button>
              <el-button v-if="row.status !== 'paid' && row.status !== 'waived' && !row.reverseRef" link type="danger" @click="openReverse(row)">红冲</el-button>
              <el-button link type="danger" @click="remove(row)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
          @current-change="load()" @size-change="load(1)" />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑费用' : '新增费用'" width="600px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="方向"><el-radio-group v-model="form.direction"><el-radio value="receivable">应收</el-radio><el-radio value="payable">应付</el-radio></el-radio-group></el-form-item>
        <el-form-item label="关联订单">
          <el-select v-model="form.orderId" filterable clearable style="width:100%">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.orderNo} - ${o.cargoDesc}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类别"><el-select v-model="form.category" style="width:100%"><el-option v-for="(t,k) in FIN_CATEGORY" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" /></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="金额"><el-input-number v-model="form.amount" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="币种">
            <el-select v-model="form.currency" filterable allow-create style="width:100%">
              <el-option v-for="c in CURRENCIES" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="状态"><el-select v-model="form.status" style="width:100%"><el-option v-for="(v,k) in FIN_STATUS" :key="k" :label="v.text" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="发票号"><el-input v-model="form.invoiceNo" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量核销 -->
    <el-dialog v-model="writeoffDialog" title="批量记为已收付" width="460px">
      <div class="batch-tip">共 <b>{{ selectedIds().length }}</b> 条费用记录，将批量核销。金额留空表示全额收/付完成。</div>
      <el-form label-width="90px">
        <el-form-item label="核销金额">
          <el-input-number v-model="writeoffAmount" :min="0" :precision="2" style="width:100%" placeholder="留空=全额" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="writeoffDialog = false">取消</el-button>
        <el-button type="primary" :loading="writingoff" @click="batchWriteoff">执行核销</el-button>
      </template>
    </el-dialog>

    <!-- N3 收款核销 -->
    <el-dialog v-model="payDialog" title="收款核销" width="680px">
      <div class="batch-tip">已选 <b>{{ selectedIds().length }}</b> 条应收费用，按客户登记一笔到账并分摊核销。</div>
      <el-form label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="收款客户">
              <el-select v-model="payForm.customerId" filterable placeholder="选择客户" style="width:100%">
                <el-option v-for="c in payCustomers" :key="c.id" :label="`${c.name} (${c.code})`" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="到账金额"><el-input-number v-model="payForm.amount" :min="0.01" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="币种">
            <el-select v-model="payForm.currency" filterable allow-create placeholder="CNY" style="width:100%">
              <el-option v-for="c in CURRENCIES" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="到账日期"><el-date-picker v-model="payForm.paidAt" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="payForm.remark" placeholder="如：银行回款单号" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <div class="ff-sum" style="margin:6px 0 8px">核销费用（按顺序分摊，多币种分别匹配）</div>
      <template #footer>
        <el-button @click="payDialog = false">取消</el-button>
        <el-button type="primary" :loading="paying" @click="doPayment">确认核销</el-button>
      </template>
    </el-dialog>

    <!-- P0.1 红字冲销 -->
    <el-dialog v-model="reverseDialog" title="红字冲销" width="480px">
      <div class="batch-tip">
        将对以下费用记录执行红字冲销操作：
      </div>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="费用说明">{{ reverseTarget?.description }}</el-descriptions-item>
        <el-descriptions-item label="方向">{{ FIN_DIRECTION[reverseTarget?.direction]?.text }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ reverseTarget?.amount }} {{ reverseTarget?.currency }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusOf(FIN_STATUS, reverseTarget?.status).text }}</el-descriptions-item>
      </el-descriptions>
      <div class="reverse-tip" style="margin-top:12px;font-size:13px;color:var(--text-muted);background:var(--bg2);padding:10px;border-radius:6px;border-left:3px solid var(--danger)">
        操作说明：红冲将创建一笔与原记录金额相等、方向相反的冲销记录，并将原记录标记为已冲销。此操作不可逆。
      </div>
      <el-form label-width="70px" style="margin-top:12px">
        <el-form-item label="冲销原因">
          <el-input v-model="reverseReason" type="textarea" :rows="2" placeholder="选填冲销原因说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reverseDialog = false">取消</el-button>
        <el-button type="danger" :loading="reversing" @click="doReverse">确认红冲</el-button>
      </template>
    </el-dialog>

    <!-- N1 费用模板管理 -->
    <el-dialog v-model="tplMgrVisible" title="费用模板管理" width="680px">
      <div class="table-topbar" style="margin-bottom:10px">
        <span class="hint">常用费用组合：在订单财务页可一键套用，批量生成费用</span>
        <el-button size="small" type="primary" @click="openTplEdit()"><el-icon><Plus /></el-icon>新建模板</el-button>
      </div>
      <el-table :data="tpls" size="small" stripe max-height="360" v-loading="tplLoading">
        <el-table-column prop="name" label="模板名称" min-width="150" />
        <el-table-column label="费用条目" width="90" align="center">
          <template #default="{ row }">{{ tplItemCount(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="openTplEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="removeTpl(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="tplEditVisible" :title="tplEdit.id ? '编辑模板' : '新建模板'" width="760px">
      <el-form label-width="80px">
        <el-form-item label="模板名称"><el-input v-model="tplEdit.name" placeholder="如：海出整箱基础费" /></el-form-item>
      </el-form>
      <el-table :data="tplEdit.items" size="small" border max-height="300">
        <el-table-column label="方向" width="90">
          <template #default="{ row }"><el-select v-model="row.direction" size="small"><el-option label="应收" value="receivable" /><el-option label="应付" value="payable" /></el-select></template>
        </el-table-column>
        <el-table-column label="类别" width="140">
          <template #default="{ row }"><el-select v-model="row.category" size="small" filterable>
            <el-option v-for="(label, val) in FIN_CATEGORY" :key="val" :label="label" :value="val" /></el-select></template>
        </el-table-column>
        <el-table-column label="说明" min-width="160">
          <template #default="{ row }"><el-input v-model="row.description" size="small" placeholder="费用说明" /></template>
        </el-table-column>
        <el-table-column label="币种" width="110">
          <template #default="{ row }"><el-select v-model="row.currency" size="small" filterable allow-create>
            <el-option v-for="c in CURRENCIES" :key="c.value" :label="c.label" :value="c.value" /></el-select></template>
        </el-table-column>
        <el-table-column label="金额" width="130">
          <template #default="{ row }"><el-input-number v-model="row.amount" :min="0" :precision="2" size="small" style="width:100%" /></template>
        </el-table-column>
        <el-table-column label="" width="60" align="center">
          <template #default="{ $index }"><el-button link type="danger" @click="tplEdit.items.splice($index, 1)"><el-icon><Delete /></el-icon></el-button></template>
        </el-table-column>
      </el-table>
      <div style="margin-top:8px;text-align:right"><el-button size="small" @click="tplEdit.items.push({ direction:'receivable', category:'ocean_freight', description:'', currency:defaultCurrency, amount:0 })">添加一行</el-button></div>
      <template #footer>
        <el-button @click="tplEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="tplSaving" @click="saveTpl">保存模板</el-button>
      </template>
    </el-dialog>

    <!-- 汇率管理（多币种 · 月固定汇率） -->
    <el-dialog v-model="fxDialog" title="汇率管理" width="680px">
      <div class="batch-tip">
        基准币种 <b>{{ fxBase }}</b> → 目标币种。月固定汇率：当期优先，缺失时沿用最近上期或内置兜底；每会计期间调整一次。
      </div>
      <div style="margin:10px 0;display:flex;align-items:center;gap:12px">
        <el-date-picker v-model="fxPeriod" type="month" value-format="YYYY-MM" placeholder="选择会计期间" size="small" style="width:150px" @change="loadExchangeRates" />
        <el-button size="small" :loading="fxSaving" @click="refreshExchangeRatesFx"><el-icon><Refresh /></el-icon>自动刷新</el-button>
        <span style="font-size:12px;color:var(--text-muted)">会计期间：{{ fxPeriod || '-' }}</span>
      </div>
      <el-table :data="fxList" v-loading="fxLoading" size="small" border>
        <el-table-column prop="targetCurrency" label="币种" width="90">
          <template #default="{ row }">{{ row.targetCurrency }}</template>
        </el-table-column>
        <el-table-column label="汇率" width="160">
          <template #default="{ row }">
            <el-input-number v-model="row.rate" :min="0.000001" :precision="6" :step="0.01" size="small" style="width:130px" />
          </template>
        </el-table-column>
        <el-table-column label="来源" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.source === 'db' ? 'success' : row.source === 'latest' ? 'warning' : 'info'">{{ FX_SOURCE_TEXT[row.source] || row.source }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生效月份" width="110">
          <template #default="{ row }">{{ row.period || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button link type="primary" size="small" :loading="fxSaving" @click="saveExchangeRate(row)">保存</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="fxDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
// ECharts 按需引入（B1 性能优化）：仅注册用到的图表与组件，替代全量 import
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
import { financeAPI, financeSummaryAPI, financeTrendAPI, orderAPI, financeExportAPI, financeBatchWriteoffAPI,
  financePeriodsAPI, financeEnsurePeriodsAPI, financeClosePeriodAPI, financeLockPeriodAPI, financeUnlockPeriodAPI, financePeriodStatementAPI, feeTemplateAPI, financeAgingAPI, financePaymentAPI, customerAPI,
  financeReverseAPI, exchangeRateAPI, systemDefaultsAPI } from '@/api';
import { FIN_DIRECTION, FIN_CATEGORY, FIN_STATUS, CURRENCIES, dictText, statusOf, money } from '@/utils/dicts';

const PERIOD_STATUS = {
  open: { text: '未结账', type: 'success' },
  closed: { text: '已结账', type: 'warning' },
  locked: { text: '已锁帐', type: 'danger' },
};

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const curLoading = ref(false);
const currency = ref({ list: [], total: null });
const multiple = ref([]);
const writeoffDialog = ref(false);
const writingoff = ref(false);
const writeoffAmount = ref(null);

function onSelect(rows) { multiple.value = rows; }
const selectedIds = () => multiple.value.map((r) => r.id);

// N5 应收账龄
const agingLoading = ref(false);const aging = ref({ totalBalance: 0, customers: [] });
const agingBuckets = [
  { key: '0-30', label: '0-30天', cls: 'ok', total: 0 },
  { key: '31-60', label: '31-60天', cls: 'warn', total: 0 },
  { key: '61-90', label: '61-90天', cls: 'warn', total: 0 },
  { key: '90+', label: '90天+', cls: 'danger', total: 0 },
];
async function loadAging() {
  agingLoading.value = true;
  try {
    const d = await financeAgingAPI();
    aging.value = d;
    for (const b of agingBuckets) b.total = d.buckets?.[b.key]?.total || 0;
  } catch { aging.value = { totalBalance: 0, customers: [] }; }
  finally { agingLoading.value = false; }
}

// N3 收款核销
const payDialog = ref(false);
const paying = ref(false);
const payCustomers = ref([]);
const payForm = ref({ customerId: null, amount: null, currency: 'CNY', paidAt: null, remark: '' });
async function openPayment() {
  if (!selectedIds().length) return;
  try {
    const d = await customerAPI.list({ pageSize: 100, status: 'active' });
    payCustomers.value = d.list || [];
  } catch { payCustomers.value = []; }
  payForm.value = { customerId: null, amount: null, currency: 'CNY', paidAt: null, remark: '' };
  payDialog.value = true;
}
async function doPayment() {
  if (!payForm.value.customerId) { ElMessage.warning('请选择收款客户'); return; }
  if (!payForm.value.amount || payForm.value.amount <= 0) { ElMessage.warning('请输入到账金额'); return; }
  paying.value = true;
  try {
    const res = await financePaymentAPI({
      customerId: payForm.value.customerId,
      direction: 'received',
      amount: payForm.value.amount,
      currency: payForm.value.currency || 'CNY',
      paidAt: payForm.value.paidAt || undefined,
      financeIds: selectedIds(),
      remark: payForm.value.remark || '',
    });
    ElMessage.success(res.msg || '核销完成');
    payDialog.value = false;
    multiple.value = [];
    load(query.page);
    loadSummary();
    loadAging();
  } catch (e) { /* 拦截器 */ }
  finally { paying.value = false; }
}

// P0.1 红字冲销
const reverseDialog = ref(false);
const reverseTarget = ref(null);
const reverseReason = ref('');
const reversing = ref(false);

function openReverse(row) {
  reverseTarget.value = row;
  reverseReason.value = '';
  reverseDialog.value = true;
}

async function doReverse() {
  reversing.value = true;
  try {
    const data = await financeReverseAPI(reverseTarget.value.id, { reason: reverseReason.value || undefined });
    ElMessage.success(data.msg || '红字冲销成功');
    reverseDialog.value = false;
    reverseTarget.value = null;
    load(); loadSummary();
  } catch (e) { /* 拦截器 */ }
  finally { reversing.value = false; }
}

// N1 费用模板管理
const tplMgrVisible = ref(false);
const tplLoading = ref(false);
const tpls = ref([]);
const tplEditVisible = ref(false);
const tplSaving = ref(false);
const tplEdit = ref({ id: null, name: '', items: [] });
function openTplMgr() { tplMgrVisible.value = true; loadTpls(); }
async function loadTpls() {
  tplLoading.value = true;
  try {
    const res = await feeTemplateAPI.list({ pageSize: 100 });
    tpls.value = (res.list || res || []).map((t) => {
      let items = [];
      try { items = typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || []); } catch { items = []; }
      return { ...t, items };
    });
  } catch { tpls.value = []; }
  finally { tplLoading.value = false; }
}
function openTplEdit(row) {
  if (row) tplEdit.value = { id: row.id, name: row.name, items: (row.items || []).map((i) => ({ ...i })) };
  else tplEdit.value = { id: null, name: '', items: [{ direction: 'receivable', category: 'ocean_freight', description: '', currency: defaultCurrency.value, amount: 0 }] };
  tplEditVisible.value = true;
}
async function saveTpl() {
  const name = (tplEdit.value.name || '').trim();
  if (!name) { ElMessage.warning('请填写模板名称'); return; }
  const items = tplEdit.value.items.filter((i) => Number(i.amount) > 0);
  if (!items.length) { ElMessage.warning('模板至少需要一行金额>0 的费用'); return; }
  tplSaving.value = true;
  try {
    if (tplEdit.value.id) await feeTemplateAPI.update(tplEdit.value.id, { name, items });
    else await feeTemplateAPI.create({ name, items });
    ElMessage.success('模板已保存');
    tplEditVisible.value = false;
    loadTpls();
  } catch (e) { /* 拦截器提示 */ }
  finally { tplSaving.value = false; }
}
async function removeTpl(row) {
  try {
    await ElMessageBox.confirm(`确认删除模板「${row.name}」？`, '删除确认', { type: 'warning' });
    await feeTemplateAPI.remove(row.id);
    ElMessage.success('已删除');
    loadTpls();
  } catch { /* 取消或失败 */ }
}
const tplItemCount = (row) => (Array.isArray(row.items) ? row.items.length : 0);

// ===== 账期管理（结账/扎帐/锁帐）=====
const periods = ref([]);
const periodLoading = ref(false);
const ensuring = ref(false);
const periodYear = ref(new Date().getFullYear());
const periodYears = ref([new Date().getFullYear()]);
const closeDialog = ref(false);
const closeTarget = ref(null);
const closeMsg = ref('');
const lockDialog = ref(false);
const lockTarget = ref(null);
const lockMsg = ref('');
const unlockDialog = ref(false);
const unlockTarget = ref(null);
const unlockMsg = ref('');
const periodActing = ref(false);
const stmtDialog = ref(false);
const stmt = ref(null);
const lockedPeriods = ref(new Set());

function fmtTime(t) { return t ? new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; }

async function loadPeriods() {
  periodLoading.value = true;
  try {
    const rows = await financePeriodsAPI(periodYear.value);
    periods.value = rows;
    const yrs = new Set(periodYears.value);
    for (const r of rows) yrs.add(r.year);
    periodYears.value = [...yrs].sort((a, b) => b - a);
    lockedPeriods.value = new Set(rows.filter((r) => r.status === 'locked').map((r) => r.periodCode));
  } finally { periodLoading.value = false; }
}

async function ensurePeriods() {
  ensuring.value = true;
  try {
    const data = await financeEnsurePeriodsAPI();
    ElMessage.success(data.msg || '账期已补齐');
    loadPeriods();
  } finally { ensuring.value = false; }
}

function openClose(row) { closeTarget.value = row; closeMsg.value = ''; closeDialog.value = true; }
async function doClose() {
  periodActing.value = true;
  try {
    await financeClosePeriodAPI(closeTarget.value.periodCode, { note: closeMsg.value || undefined });
    ElMessage.success('结账完成');
    closeDialog.value = false;
    loadPeriods(); loadSummary();
  } finally { periodActing.value = false; }
}

function openLock(row) { lockTarget.value = row; lockMsg.value = ''; lockDialog.value = true; }
async function doLock() {
  periodActing.value = true;
  try {
    await financeLockPeriodAPI(lockTarget.value.periodCode, { note: lockMsg.value || undefined });
    ElMessage.success('已锁帐');
    lockDialog.value = false;
    loadPeriods();
  } finally { periodActing.value = false; }
}

function openUnlock(row) { unlockTarget.value = row; unlockMsg.value = ''; unlockDialog.value = true; }
async function doUnlock() {
  if (!unlockMsg.value.trim()) return ElMessage.warning('解锁必须填写原因');
  periodActing.value = true;
  try {
    await financeUnlockPeriodAPI(unlockTarget.value.periodCode, { reason: unlockMsg.value.trim() });
    ElMessage.success('已解锁，账期回到未结账状态');
    unlockDialog.value = false;
    loadPeriods();
  } finally { periodActing.value = false; }
}

async function viewStatement(row) {
  const data = await financePeriodStatementAPI(row.periodCode);
  stmt.value = data;
  stmtDialog.value = true;
}

// 判定某条费用记录所属账期是否已锁帐（据此禁用改动按钮）
function recordLocked(row) {
  const d = row.settleMonth || row.createdAt;
  if (!d) return false;
  const dt = new Date(d);
  const code = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return lockedPeriods.value.has(code);
}

function openBatchWriteoff() {
  writeoffAmount.value = null;
  writeoffDialog.value = true;
}

async function batchWriteoff() {
  if (!selectedIds().length) return ElMessage.warning('请先选择费用记录');
  writingoff.value = true;
  try {
    const data = await financeBatchWriteoffAPI(selectedIds(), writeoffAmount.value || undefined);
    ElMessage.success(data.msg || '批量核销完成');
    writeoffDialog.value = false;
    multiple.value = [];
    load(); loadSummary();
  } finally { writingoff.value = false; }
}

async function batchRemove() {
  await ElMessageBox.confirm(`确认删除选中的 ${selectedIds().length} 条费用记录？删除后不可恢复。`, '批量删除', { type: 'warning' });
  await financeAPI.batchRemove(selectedIds());
  ElMessage.success('已批量删除');
  multiple.value = [];
  load(); loadSummary();
}

async function exportExcel() {
  const resp = await financeExportAPI();
  const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `财务流水_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
const total = ref(0);
const summary = ref({});
const orders = ref([]);
const query = reactive({ page: 1, pageSize: 10, keyword: '', direction: '', status: '' });
const dialogVisible = ref(false);
const form = ref({});
const trendRef = ref();
let trendChart;

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await financeAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function loadSummary() {
  summary.value = await financeSummaryAPI();
  const trend = await financeTrendAPI(new Date().getFullYear());
  trendChart = echarts.init(trendRef.value);
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['应收', '应付'], bottom: 0 },
    grid: { left: 10, right: 10, top: 30, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: trend.map((t) => `${t.month}月`) },
    yAxis: { type: 'value' },
    series: [
      { name: '应收', type: 'bar', data: trend.map((t) => t.receivable), itemStyle: { color: '#dc2626' }, barMaxWidth: 22 },
      { name: '应付', type: 'bar', data: trend.map((t) => t.payable), itemStyle: { color: '#16a34a' }, barMaxWidth: 22 },
    ],
  });
}

async function loadOptions() {
  const o = await orderAPI.list({ page: 1, pageSize: 200 });
  orders.value = o.list;
}

async function loadCurrency() {
  curLoading.value = true;
  try {
    const data = await financeAPI.currencySummary({ base: 'USD' });
    currency.value = { list: data.list, total: data.total };
  } finally { curLoading.value = false; }
}

// P3 币种级对账
const recLoading = ref(false);
const reconcile = ref({ list: [], reconciled: true, unsettledCount: 0 });
const REC_STATUS = {
  settled: { text: '已核销', type: 'success' },
  unsettled: { text: '未核销', type: 'warning' },
  overpaid: { text: '多收/多付', type: 'danger' },
};
async function loadReconcile() {
  recLoading.value = true;
  try {
    const data = await financeAPI.currencyReconcile({ base: 'USD' });
    reconcile.value = { list: data.list || [], reconciled: data.reconciled, unsettledCount: data.unsettledCount };
  } finally { recLoading.value = false; }
}

function openDialog(row) {
  form.value = row ? { ...row } : { direction: 'receivable', category: 'ocean_freight', status: 'unpaid', currency: defaultCurrency.value, amount: 0, paidAmount: 0 };
  dialogVisible.value = true;
}

// 系统默认币种（多币种：新增费用默认跟随系统配置）
const defaultCurrency = ref('CNY');
async function loadDefaultCurrency() {
  try {
    const d = await systemDefaultsAPI.get();
    defaultCurrency.value = d.defaultCurrency || 'CNY';
  } catch { defaultCurrency.value = 'CNY'; }
}

// ===== 汇率管理（多币种 · 月固定汇率：查看/手动维护/刷新）=====
const fxDialog = ref(false);
const fxLoading = ref(false);
const fxSaving = ref(false);
const fxBase = ref('USD');
const fxList = ref([]);
const fxPeriod = ref(new Date().toISOString().slice(0, 7));
async function loadExchangeRates() {
  fxLoading.value = true;
  try {
    const d = await exchangeRateAPI.list({ base: fxBase.value, period: fxPeriod.value });
    fxList.value = d.list || [];
    fxPeriod.value = d.period || fxPeriod.value;
  } finally { fxLoading.value = false; }
}
function openFx() { fxDialog.value = true; loadExchangeRates(); }
async function saveExchangeRate(row) {
  const rate = Number(row.rate);
  if (!Number.isFinite(rate) || rate <= 0) return ElMessage.warning('汇率必须为正数');
  fxSaving.value = true;
  try {
    if (row.id && row.source === 'db') {
      await exchangeRateAPI.update(row.id, { rate });
      ElMessage.success(`${row.baseCurrency}/${row.targetCurrency} 汇率已更新`);
    } else {
      await exchangeRateAPI.upsert({ baseCurrency: row.baseCurrency, targetCurrency: row.targetCurrency, rate, period: fxPeriod.value });
      ElMessage.success('汇率已保存');
    }
    loadExchangeRates();
  } catch (e) { /* 拦截器 */ }
  finally { fxSaving.value = false; }
}
async function refreshExchangeRatesFx() {
  fxSaving.value = true;
  try {
    const d = await exchangeRateAPI.refresh({ period: fxPeriod.value });
    ElMessage.success(d.msg || '汇率已刷新');
    loadExchangeRates();
  } catch (e) { /* 拦截器 */ }
  finally { fxSaving.value = false; }
}
const FX_SOURCE_TEXT = { db: '当期', latest: '沿用上期', fallback: '内置兜底' };

async function save() {
  saving.value = true;
  try {
    if (form.value.id) await financeAPI.update(form.value.id, form.value);
    else await financeAPI.create(form.value);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load(); loadSummary();
  } finally { saving.value = false; }
}

async function markPaid(row) {
  await financeAPI.update(row.id, { ...row, status: 'paid', paidAmount: row.amount, paidAt: new Date().toISOString() });
  ElMessage.success('已标记为收付完成');
  load(); loadSummary();
}

async function remove(row) {
  await ElMessageBox.confirm('确认删除该费用记录？', '提示', { type: 'warning' });
  await financeAPI.remove(row.id);
  ElMessage.success('已删除');
  load(); loadSummary();
}

function goOrder(row) { if (row.order?.id) router.push(`/orders/${row.order.id}`); }

function resize() { trendChart?.resize(); }

onMounted(() => { load(1); loadOptions(); loadSummary(); loadCurrency(); loadReconcile(); loadPeriods(); loadAging(); loadDefaultCurrency(); window.addEventListener('resize', resize); });
onBeforeUnmount(() => { window.removeEventListener('resize', resize); trendChart?.dispose(); });
</script>

<style scoped>
.page-desc { font-size: 13px; color: var(--text-muted); }
.card-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
.trend-chart { height: 280px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.right-btn { display: flex; gap: 8px; align-items: center; }
.batch-tip { margin-bottom: 14px; font-size: 13px; color: var(--text-muted); }
.currency-total { margin-top: 10px; font-size: 13px; color: var(--text-muted); border-top: 1px dashed var(--border); padding-top: 10px; }
.period-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.period-meta { font-size: 12px; color: var(--text-muted); }
.stmt-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.stmt-title { font-size: 15px; font-weight: 600; }
.stmt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.aging-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 12px; }
.aging-cell { background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 10px; min-width: 0; }
.aging-cell span { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.aging-cell b { font-size: 15px; }
.aging-cell.ok b { color: var(--success); }
.aging-cell.warn b { color: var(--warning); }
.aging-cell.danger b { color: var(--danger); }
.aging-cell.total { border-color: var(--danger); }
.aging-cell.total b { color: var(--danger); }
.stmt-cell { background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 10px; min-width: 0; }
.stmt-cell span { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.stmt-cell b { font-size: 16px; overflow-wrap: anywhere; }

@media (max-width: 768px) {
  .period-toolbar > * { flex: 1 1 auto; min-width: 0; }
  .period-toolbar .el-select { width: 100% !important; }
  .stmt-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>