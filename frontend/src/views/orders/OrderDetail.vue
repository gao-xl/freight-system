<template>
  <div v-if="detail">
    <div class="page-card header-card">
      <div class="head-left">
        <el-button link @click="$router.back()"><el-icon><ArrowLeft /></el-icon></el-button>
        <div>
          <h2 class="hd-title">{{ detail.order.orderNo }}</h2>
          <span class="hd-sub">{{ detail.order.customer?.name }} · {{ dictText(MODE, detail.order.mode) }} · {{ dictText(ORDER_TYPE, detail.order.type) }}</span>
        </div>
      </div>
      <div class="head-right">
        <el-tag :type="statusOf(ORDER_STATUS, detail.order.status).type" size="large">{{ statusOf(ORDER_STATUS, detail.order.status).text }}</el-tag>
        <el-button type="primary" plain @click="changeStatus">流转状态</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" class="detail-tabs">
      <el-tab-pane label="订单信息" name="info">
        <el-descriptions :column="desCol" border class="page-card">
          <el-descriptions-item label="订单号">{{ detail.order.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ detail.order.customer?.name }}</el-descriptions-item>
          <el-descriptions-item label="订单类型">{{ dictText(ORDER_TYPE, detail.order.type) }}</el-descriptions-item>
          <el-descriptions-item label="运输方式">{{ dictText(MODE, detail.order.mode) }}</el-descriptions-item>
          <el-descriptions-item label="服务类型">{{ dictText(SERVICE_TYPE, detail.order.serviceType) }}</el-descriptions-item>
          <el-descriptions-item label="币种">{{ detail.order.currency }}</el-descriptions-item>
          <el-descriptions-item label="起运港">{{ detail.order.originPort }}</el-descriptions-item>
          <el-descriptions-item label="目的港">{{ detail.order.destPort }}</el-descriptions-item>
          <el-descriptions-item label="总金额">{{ money(detail.order.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="货物描述" :span="3">{{ detail.order.cargoDesc || '-' }}</el-descriptions-item>
          <el-descriptions-item label="重量(t)">{{ detail.order.cargoWeight || 0 }}</el-descriptions-item>
          <el-descriptions-item label="体积(m³)">{{ detail.order.cargoVolume || 0 }}</el-descriptions-item>
          <el-descriptions-item label="件数">{{ detail.order.packageCount || 0 }}</el-descriptions-item>
          <el-descriptions-item label="预计发运">{{ detail.order.etd || '-' }}</el-descriptions-item>
          <el-descriptions-item label="预计到港">{{ detail.order.eta || '-' }}</el-descriptions-item>
          <el-descriptions-item label="箱号">{{ detail.order.containerNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="3">{{ detail.order.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="page-card bl-card">
          <div class="table-topbar">
            <span class="hint">提单信息（提单模板打印数据源）</span>
            <el-button type="primary" plain size="small" @click="openBlEdit"><el-icon><Edit /></el-icon>编辑提单信息</el-button>
          </div>
          <el-descriptions :column="desCol" border>
            <el-descriptions-item label="发货人(SHIPPER)">{{ detail.order.shipperName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="发货人地址">{{ detail.order.shipperAddress || '-' }}</el-descriptions-item>
            <el-descriptions-item label="收货人(CONSIGNEE)">{{ detail.order.consigneeName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="收货人地址">{{ detail.order.consigneeAddress || '-' }}</el-descriptions-item>
            <el-descriptions-item label="通知方(NOTIFY)">{{ detail.order.notifyParty || '-' }}</el-descriptions-item>
            <el-descriptions-item label="唛头(MARKS)">{{ detail.order.marksNumbers || '-' }}</el-descriptions-item>
            <el-descriptions-item label="收货地">{{ detail.order.placeOfReceipt || '-' }}</el-descriptions-item>
            <el-descriptions-item label="交货地">{{ detail.order.placeOfDelivery || '-' }}</el-descriptions-item>
            <el-descriptions-item label="运费条款">{{ detail.order.freightCharges || '-' }}</el-descriptions-item>
            <el-descriptions-item label="正本份数">{{ detail.order.originalBLCount ?? 3 }}</el-descriptions-item>
            <el-descriptions-item label="电放">{{ detail.order.telexRelease ? '是' : '否' }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`订舱(${detail.bookings.length})`" name="booking">
        <div class="page-card">
          <div class="table-topbar"><el-button type="primary" size="small" @click="bookingDialog=true; bookingForm={orderId:detail.order.id}"><el-icon><Plus /></el-icon>新增订舱</el-button></div>
          <el-table :data="detail.bookings" size="small" stripe>
            <el-table-column prop="bookingNo" label="订舱号" width="150" />
            <el-table-column label="承运人" width="160">
              <template #default="{ row }">{{ row.supplierId ? supplierName(row.supplierId) : '-' }}</template>
            </el-table-column>
            <el-table-column prop="vesselName" label="船名/航班" min-width="140" />
            <el-table-column prop="containerType" label="箱型" width="90" />
            <el-table-column prop="containerQty" label="箱量" width="80" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><el-tag :type="statusOf(BOOKING_STATUS, row.status).type" size="small">{{ statusOf(BOOKING_STATUS, row.status).text }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="freightCharge" label="运费" width="110">
              <template #default="{ row }">{{ row.freightCharge }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`报关(${detail.customs.length})`" name="customs">
        <div class="page-card">
          <div class="table-topbar"><el-button type="primary" size="small" @click="customsDialog=true; customsForm={orderId:detail.order.id}"><el-icon><Plus /></el-icon>新增报关</el-button></div>
          <el-table :data="detail.customs" size="small" stripe>
            <el-table-column prop="declNo" label="报关单号" width="150" />
            <el-table-column prop="customsNo" label="海关编号" width="150" />
            <el-table-column prop="hsCode" label="HS编码" width="110" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><el-tag :type="statusOf(CUSTOMS_STATUS, row.status).type" size="small">{{ statusOf(CUSTOMS_STATUS, row.status).text }}</el-tag></template>
            </el-table-column>
            <el-table-column label="申报值" width="110" align="right">
              <template #default="{ row }">{{ row.customsValue }}</template>
            </el-table-column>
            <el-table-column prop="releaseDate" label="放行日期" width="110" />
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`单证(${detail.documents.length})`" name="doc">
        <div class="page-card">
          <div class="table-topbar"><el-button type="primary" size="small" @click="docDialog=true; docForm={orderId:detail.order.id}"><el-icon><Plus /></el-icon>新增单证</el-button></div>
          <el-table :data="detail.documents" size="small" stripe>
            <el-table-column label="类型" width="110">
              <template #default="{ row }">{{ dictText(DOC_TYPE, row.docType) }}</template>
            </el-table-column>
            <el-table-column prop="docNo" label="单证号" width="150" />
            <el-table-column prop="title" label="标题" min-width="160" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><el-tag :type="statusOf(DOC_STATUS, row.status).type" size="small">{{ statusOf(DOC_STATUS, row.status).text }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="issueDate" label="签发日期" width="110" />
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`运输跟踪(${timeline.length})`" name="track">
        <div class="page-card">
          <div class="table-topbar">
            <div class="left">
              <el-button type="primary" size="small" @click="trackDialog=true; trackForm={orderId:detail.order.id}"><el-icon><Plus /></el-icon>新增节点</el-button>
              <span class="tl-hint">自动汇总订舱/报关/运输/财务/放单节点</span>
            </div>
          </div>
          <el-timeline>
            <el-timeline-item v-for="n in timeline" :key="n.type + '_' + n.time + '_' + n.title" :timestamp="formatTime(n.time)" placement="top" :type="tlType(n)">
              <div class="tl-head">
                <el-tag :type="tlType(n)" size="small">{{ dictText(TIMELINE_TYPE, n.type) }}</el-tag>
                <span class="tl-loc">{{ n.title }}</span>
                <el-tag v-if="n.auto" size="small" effect="plain" type="info">自动</el-tag>
              </div>
              <div class="tl-desc">{{ n.description }}</div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-if="!timeline.length" description="暂无节点" />
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`进出口流程(${orderNodes.length})`" name="flow">
        <div class="page-card">
          <div class="table-topbar">
            <div class="left">
              <span class="tl-hint">进出口节点实例进度（绿=完成 / 黄=待做 / 红=卡点），可手动标记</span>
            </div>
          </div>
          <el-steps :active="doneNodeCount" align-center finish-status="success" direction="vertical" style="max-height:520px;margin-top:8px">
            <el-step v-for="n in orderNodes" :key="n.nodeCode" :title="n.nodeName" :status="n.status==='done'?'success':(n.status==='blocked'?'error':'wait')">
              <template #description>
                <div class="node-desc">
                  <el-tag v-if="n.required" size="small" type="danger" effect="plain">必填</el-tag>
                  <span v-if="n.doneAt">完成于 {{ formatTime(n.doneAt) }}</span>
                  <span v-if="n.remark" class="node-remark">{{ n.remark }}</span>
                  <div class="node-ops">
                    <el-button v-if="n.status!=='done'" link type="success" size="small" @click="markNode(n,'done')">标记完成</el-button>
                    <el-button v-if="n.status!=='blocked'" link type="danger" size="small" @click="markNode(n,'blocked')">标记卡点</el-button>
                    <el-button v-if="n.status!=='pending'" link size="small" @click="markNode(n,'pending')">重置</el-button>
                  </div>
                </div>
              </template>
            </el-step>
          </el-steps>
          <el-empty v-if="!orderNodes.length" description="暂无流程节点" />
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`集装箱(${containers.length})`" name="containers">
        <div class="page-card">
          <div class="table-topbar">
            <div class="left">
              <span class="tl-hint">一单多箱：录入每个箱的箱号/封号/尺寸/重量与逐箱状态</span>
            </div>
            <el-button type="primary" size="small" @click="addContainer"><el-icon><Plus /></el-icon>添加箱</el-button>
          </div>
          <el-table :data="containers" size="small" stripe>
            <el-table-column label="箱号" min-width="140">
              <template #default="{ row }"><el-input v-model="row.containerNo" size="small" /></template>
            </el-table-column>
            <el-table-column label="封号" width="130">
              <template #default="{ row }"><el-input v-model="row.sealNo" size="small" /></template>
            </el-table-column>
            <el-table-column label="箱型" width="110">
              <template #default="{ row }"><el-select v-model="row.sizeType" size="small" style="width:100%"><el-option v-for="t in ['20','40','40HQ','45','20RF','40RF']" :key="t" :label="t" :value="t" /></el-select></template>
            </el-table-column>
            <el-table-column label="货描" min-width="150">
              <template #default="{ row }"><el-input v-model="row.cargoDesc" size="small" /></template>
            </el-table-column>
            <el-table-column label="重量(t)" width="110">
              <template #default="{ row }"><el-input-number v-model="row.weight" :min="0" :precision="2" size="small" style="width:100%" /></template>
            </el-table-column>
            <el-table-column label="体积(m³)" width="110">
              <template #default="{ row }"><el-input-number v-model="row.volume" :min="0" :precision="2" size="small" style="width:100%" /></template>
            </el-table-column>
            <el-table-column label="件数" width="90">
              <template #default="{ row }"><el-input-number v-model="row.packageCount" :min="0" size="small" style="width:100%" /></template>
            </el-table-column>
            <el-table-column label="状态" width="120">
              <template #default="{ row }"><el-select v-model="row.status" size="small" style="width:100%"><el-option v-for="(t,k) in CONTAINER_STATUS" :key="k" :label="t" :value="k" /></el-select></template>
            </el-table-column>
            <el-table-column label="操作" width="70">
              <template #default="{ $index }"><el-button link type="danger" size="small" @click="removeContainer($index)">删除</el-button></template>
            </el-table-column>
          </el-table>
          <div class="table-topbar" style="margin-top:12px; justify-content:flex-end">
            <el-button type="primary" size="small" :loading="savingContainers" @click="saveContainers"><el-icon><Check /></el-icon>保存箱信息</el-button>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`财务(${detail.finance.length})`" name="finance">
        <div class="page-card">
          <div class="table-topbar">
            <div class="left">
              <el-button type="primary" size="small" @click="finDialog=true; finForm={orderId:detail.order.id,direction:'receivable',currency:'USD'}"><el-icon><Plus /></el-icon>新增费用</el-button>
              <el-select v-model="selectedTemplate" placeholder="费用模板一键套用" filterable clearable size="small" style="width:200px;margin-left:8px" @change="applyFeeTemplate">
                <el-option v-for="t in feeTemplates" :key="t.id" :label="t.name" :value="t.id" />
              </el-select>
            </div>
            <div class="left">
              <span class="fin-sum">应收 <b class="recv">{{ money(finSum('receivable')) }}</b></span>
              <span class="fin-sum">应付 <b class="pay">{{ money(finSum('payable')) }}</b></span>
              <span class="fin-sum">毛利 <b :class="profit>=0?'profit':'loss'">{{ money(profit) }}</b></span>
            </div>
          </div>
          <el-table :data="detail.finance" size="small" stripe>
            <el-table-column label="方向" width="80">
              <template #default="{ row }"><el-tag :type="FIN_DIRECTION[row.direction].type" size="small">{{ FIN_DIRECTION[row.direction].text }}</el-tag></template>
            </el-table-column>
            <el-table-column label="类别" width="120">
              <template #default="{ row }">{{ dictText(FIN_CATEGORY, row.category) }}</template>
            </el-table-column>
            <el-table-column prop="description" label="说明" min-width="160" />
            <el-table-column label="金额" width="120" align="right">
              <template #default="{ row }">{{ row.amount }} {{ row.currency }}</template>
            </el-table-column>
            <el-table-column label="已收付" width="110" align="right">
              <template #default="{ row }">{{ row.paidAmount }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><el-tag :type="statusOf(FIN_STATUS, row.status).type" size="small">{{ statusOf(FIN_STATUS, row.status).text }}</el-tag></template>
            </el-table-column>
          </el-table>
        </div>

        <!-- N1 多行快录 -->
        <div class="page-card quick-fee-card">
          <div class="table-topbar">
            <div class="left">
              <span class="hint">多行快录：模板套用或逐行添加，一次批量保存（已保存费用见上表）</span>
            </div>
            <div class="left">
              <el-button size="small" @click="addFeeRow"><el-icon><Plus /></el-icon>添加一行</el-button>
              <el-button size="small" type="primary" :loading="feeSaving" @click="saveFeeRows"><el-icon><Check /></el-icon>批量保存</el-button>
            </div>
          </div>
          <el-table :data="feeRows" size="small" border>
            <el-table-column label="方向" width="90">
              <template #default="{ row }">
                <el-select v-model="row.direction" size="small"><el-option label="应收" value="receivable" /><el-option label="应付" value="payable" /></el-select>
              </template>
            </el-table-column>
            <el-table-column label="类别" width="140">
              <template #default="{ row }">
                <el-select v-model="row.category" size="small" filterable>
                  <el-option v-for="(label, val) in FIN_CATEGORY" :key="val" :label="label" :value="val" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="180">
              <template #default="{ row }"><el-input v-model="row.description" size="small" placeholder="费用说明" /></template>
            </el-table-column>
            <el-table-column label="币种" width="90">
              <template #default="{ row }"><el-input v-model="row.currency" size="small" placeholder="USD" /></template>
            </el-table-column>
            <el-table-column label="金额" width="140">
              <template #default="{ row }"><el-input-number v-model="row.amount" :min="0" :precision="2" size="small" style="width:100%" /></template>
            </el-table-column>
            <el-table-column label="" width="60" align="center">
              <template #default="{ $index }">
                <el-button link type="danger" @click="feeRows.splice($index, 1)"><el-icon><Delete /></el-icon></el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!feeRows.length" description="暂无待录入费用：可选上方「费用模板」一键套用，或点「添加一行」" :image-size="60" />
        </div>

        <!-- B8 放单控制 -->
        <div class="page-card">
          <div class="table-topbar">
            <div class="left">
              <span class="tl-hint">放单前校验应收结清：未结清自动进入审批流</span>
              <el-tag v-if="releaseData.order" size="small" :type="releaseData.order.releaseStatus==='approved'?'success':'warning'" style="margin-left:12px">
                {{ REL_STATUS[releaseData.order.releaseStatus] || '未放单' }}
              </el-tag>
              <span class="fin-sum">应收未收 <b :class="releaseData.receivableBalance>0?'recv':'profit'">{{ money(releaseData.receivableBalance) }}</b></span>
            </div>
            <div class="left">
              <el-button type="primary" size="small" @click="openReleaseDialog"><el-icon><Check /></el-icon>申请放单</el-button>
            </div>
          </div>
          <el-table :data="releaseData.records" size="small" stripe>
            <el-table-column label="放单方式" width="110">
              <template #default="{ row }">{{ RELEASE_TYPE[row.releaseType] || row.releaseType }}</template>
            </el-table-column>
            <el-table-column prop="releaseNo" label="放单号" width="130" />
            <el-table-column label="应收未收" width="120" align="right">
              <template #default="{ row }">{{ money(row.receivableBalance) }}</template>
            </el-table-column>
            <el-table-column label="审批状态" width="110">
              <template #default="{ row }"><el-tag :type="row.approvalStatus==='approved'?'success':(row.approvalStatus==='pending'?'warning':'danger')" size="small">{{ APPROVAL_STATUS[row.approvalStatus] || row.approvalStatus }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="operatorName" label="申请人" width="110" />
            <el-table-column prop="approverName" label="审批人" width="110">
              <template #default="{ row }">{{ row.approverName || '-' }}</template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="140" />
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.approvalStatus==='pending'" link type="success" size="small" @click="approveRelease(row, true)">通过</el-button>
                <el-button v-if="row.approvalStatus==='pending'" link type="danger" size="small" @click="approveRelease(row, false)">驳回</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!releaseData.records.length" description="暂无放单记录" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 业务节点流转（A6） -->
    <!-- D2 提单信息编辑 -->
    <el-dialog v-model="blDialog" title="编辑提单信息" width="640px">
      <el-form :model="blForm" label-width="120px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="发货人"><el-input v-model="blForm.shipperName" placeholder="SHIPPER" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="收货人"><el-input v-model="blForm.consigneeName" placeholder="CONSIGNEE" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="发货人地址"><el-input v-model="blForm.shipperAddress" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="收货人地址"><el-input v-model="blForm.consigneeAddress" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="通知方"><el-input v-model="blForm.notifyParty" placeholder="NOTIFY PARTY" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="唛头"><el-input v-model="blForm.marksNumbers" type="textarea" :rows="2" placeholder="MARKS &amp; NUMBERS" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="收货地"><el-input v-model="blForm.placeOfReceipt" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="交货地"><el-input v-model="blForm.placeOfDelivery" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="运费条款"><el-input v-model="blForm.freightCharges" placeholder="如 FREIGHT PREPAID" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="正本份数"><el-input-number v-model="blForm.originalBLCount" :min="0" :max="10" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="电放"><el-switch v-model="blForm.telexRelease" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="blDialog = false">取消</el-button>
        <el-button type="primary" :loading="blSaving" @click="saveBl">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="statusDialog" title="订单业务节点流转" width="640px">      <div class="flow-stage">
        <el-steps :active="flowData.currentIndex" align-center finish-status="success">
          <el-step v-for="n in flowData.nodes" :key="n.key" :title="n.label" :status="stageStatus(n)" />
        </el-steps>
      </div>
      <div class="flow-desc">
        当前节点 <b>{{ flowData.currentIndex < flowData.nodes.length ? flowData.nodes[flowData.currentIndex].label : '已完成全部节点' }}</b>
        · 已推进 {{ flowData.reachedCount }}/{{ flowData.total }}
        <el-tag v-if="flowData.statusChanged" type="warning" size="small" effect="plain">推进后订单状态将更新为「{{ statusOf(ORDER_STATUS, flowData.derivedStatus).text }}」</el-tag>
      </div>
      <div class="status-actions">
        <el-button v-if="flowData.currentIndex < flowData.nodes.length" type="primary" @click="advanceNode(flowData.nodes[flowData.currentIndex])">
          推进「{{ flowData.nodes[flowData.currentIndex].label }}」
        </el-button>
      </div>
    </el-dialog>

    <!-- 新增订舱 -->
    <el-dialog v-model="bookingDialog" title="新增订舱" width="560px">
      <el-form :model="bookingForm" label-width="90px">
        <el-form-item label="承运人"><el-select v-model="bookingForm.supplierId" filterable style="width:100%"><el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="船名/航班"><el-input v-model="bookingForm.vesselName" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="航次"><el-input v-model="bookingForm.voyageNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="箱型"><el-select v-model="bookingForm.containerType" style="width:100%"><el-option v-for="t in ['20GP','40GP','40HQ','LCL','AIR']" :key="t" :label="t" :value="t" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="箱量"><el-input-number v-model="bookingForm.containerQty" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="运费"><el-input-number v-model="bookingForm.freightCharge" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="订舱日期"><el-date-picker v-model="bookingForm.bookingDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer><el-button @click="bookingDialog=false">取消</el-button><el-button type="primary" @click="saveBooking">保存</el-button></template>
    </el-dialog>

    <!-- 新增报关 -->
    <el-dialog v-model="customsDialog" title="新增报关" width="560px">
      <el-form :model="customsForm" label-width="90px">
        <el-form-item label="报关行"><el-select v-model="customsForm.supplierId" filterable style="width:100%"><el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="类型"><el-select v-model="customsForm.type" style="width:100%"><el-option label="出口清关" value="export_clearance" /><el-option label="进口清关" value="import_clearance" /><el-option label="查验" value="inspection" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="HS编码"><el-input v-model="customsForm.hsCode" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="申报值"><el-input-number v-model="customsForm.customsValue" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="关税"><el-input-number v-model="customsForm.taxAmount" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer><el-button @click="customsDialog=false">取消</el-button><el-button type="primary" @click="saveCustoms">保存</el-button></template>
    </el-dialog>

    <!-- 新增单证 -->
    <el-dialog v-model="docDialog" title="新增单证" width="520px">
      <el-form :model="docForm" label-width="90px">
        <el-form-item label="类型"><el-select v-model="docForm.docType" style="width:100%"><el-option v-for="(t,k) in DOC_TYPE" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="单证号"><el-input v-model="docForm.docNo" /></el-form-item>
        <el-form-item label="标题"><el-input v-model="docForm.title" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="docDialog=false">取消</el-button><el-button type="primary" @click="saveDoc">保存</el-button></template>
    </el-dialog>

    <!-- 新增跟踪节点 -->
    <el-dialog v-model="trackDialog" title="新增运输节点" width="520px">
      <el-form :model="trackForm" label-width="90px">
        <el-form-item label="阶段"><el-select v-model="trackForm.stage" style="width:100%"><el-option v-for="(t,k) in TRACK_STAGE" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="地点"><el-input v-model="trackForm.location" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="trackForm.description" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="trackDialog=false">取消</el-button><el-button type="primary" @click="saveTrack">保存</el-button></template>
    </el-dialog>

    <!-- 新增财务 -->
    <el-dialog v-model="finDialog" title="新增费用" width="560px">
      <el-form :model="finForm" label-width="90px">
        <el-form-item label="方向"><el-radio-group v-model="finForm.direction"><el-radio value="receivable">应收</el-radio><el-radio value="payable">应付</el-radio></el-radio-group></el-form-item>
        <el-form-item label="类别"><el-select v-model="finForm.category" style="width:100%"><el-option v-for="(t,k) in FIN_CATEGORY" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="说明"><el-input v-model="finForm.description" /></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="金额"><el-input-number v-model="finForm.amount" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="币种"><el-input v-model="finForm.currency" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer><el-button @click="finDialog=false">取消</el-button><el-button type="primary" @click="saveFinance">保存</el-button></template>
    </el-dialog>

    <!-- B8 申请放单 -->
    <el-dialog v-model="releaseDialog" title="申请放单" width="480px">
      <el-form :model="releaseForm" label-width="90px">
        <el-form-item label="放单方式">
          <el-radio-group v-model="releaseForm.releaseType">
            <el-radio label="original">正本</el-radio>
            <el-radio label="telex">电放</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="放单号"><el-input v-model="releaseForm.releaseNo" placeholder="如 BL/CIMC20260808001 或电放号" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="releaseForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="releaseDialog=false">取消</el-button>
        <el-button type="primary" :loading="releaseSaving" @click="submitRelease">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { orderDetailAPI, orderTimelineAPI, orderFlowAPI, orderAdvanceAPI, orderNodesAPI, updateOrderNodeAPI, bookingAPI, customsAPI, documentAPI, trackAPI, financeAPI, financeBatchAPI, feeTemplateAPI, supplierAPI, orderAPI, orderContainersAPI, saveOrderContainersAPI, releaseAPI } from '@/api';
import {
  ORDER_STATUS, ORDER_TYPE, MODE, SERVICE_TYPE, BOOKING_STATUS, CUSTOMS_STATUS,
  DOC_TYPE, DOC_STATUS, TRACK_STAGE, FIN_DIRECTION, FIN_CATEGORY, FIN_STATUS,
  dictText, statusOf, money,
} from '@/utils/dicts';

const route = useRoute();
const detail = ref(null);
const suppliers = ref([]);
const tab = ref('info');
const timeline = ref([]);

// D2 提单信息编辑
const blDialog = ref(false);
const blSaving = ref(false);
const blForm = ref({});
function openBlEdit() {
  const o = detail.value?.order || {};
  blForm.value = {
    shipperName: o.shipperName || '', shipperAddress: o.shipperAddress || '',
    consigneeName: o.consigneeName || '', consigneeAddress: o.consigneeAddress || '',
    notifyParty: o.notifyParty || '', marksNumbers: o.marksNumbers || '',
    placeOfReceipt: o.placeOfReceipt || '', placeOfDelivery: o.placeOfDelivery || '',
    freightCharges: o.freightCharges || '', originalBLCount: o.originalBLCount ?? 3,
    telexRelease: !!o.telexRelease,
  };
  blDialog.value = true;
}
async function saveBl() {
  blSaving.value = true;
  try {
    await orderAPI.update(detail.value.order.id, blForm.value);
    detail.value.order = { ...detail.value.order, ...blForm.value };
    blDialog.value = false;
    ElMessage.success('提单信息已保存');
  } catch (e) { /* 拦截后由拦截器提示 */ }
  finally { blSaving.value = false; }
}

// N1 费用多行快录
const feeTemplates = ref([]);
const selectedTemplate = ref(null);
const feeSaving = ref(false);
const feeRows = ref([]);
const newFeeRow = () => ({ direction: 'receivable', category: 'ocean_freight', description: '', currency: 'USD', amount: 0 });
async function loadFeeTemplates() {
  try { feeTemplates.value = await feeTemplateAPI.list({ pageSize: 100 }); } catch { feeTemplates.value = []; }
}
function addFeeRow() { feeRows.value.push(newFeeRow()); }
async function applyFeeTemplate(id) {
  if (!id) return;
  const tpl = feeTemplates.value.find((t) => t.id === id);
  if (!tpl) return;
  let items = [];
  try { items = typeof tpl.items === 'string' ? JSON.parse(tpl.items) : (tpl.items || []); } catch { items = []; }
  if (items.length) {
    feeRows.value = items.map((i) => ({ direction: i.direction, category: i.category, description: i.description, currency: i.currency, amount: Number(i.amount) || 0 }));
    ElMessage.success(`已套用模板「${tpl.name}」${items.length} 条费用`);
  }
}
async function saveFeeRows() {
  const items = feeRows.value.filter((r) => Number(r.amount) > 0);
  if (!items.length) { ElMessage.warning('请先填写至少一行有效费用（金额>0）'); return; }
  feeSaving.value = true;
  try {
    const res = await financeBatchAPI({ orderId: detail.value.order.id, items });
    ElMessage.success(res.msg || `已创建 ${res.count || items.length} 条费用`);
    feeRows.value = [];
    selectedTemplate.value = null;
    await load();
  } catch (e) { /* 拦截器提示 */ }
  finally { feeSaving.value = false; }
}

// 窄屏（<768px）描述列表降为单列，避免挤压
const isMobile = ref(false);
const desCol = computed(() => (isMobile.value ? 1 : 3));
let mql = null;

const TIMELINE_TYPE = { order: '订单', booking: '订舱', customs: '报关', track: '运输', finance: '财务', release: '放单' };
const tlType = (n) => ({ booking: 'primary', customs: 'warning', track: 'success', finance: 'danger', release: 'info', order: 'info' }[n.type] || 'info');

const bookingDialog = ref(false), bookingForm = ref({});
const customsDialog = ref(false), customsForm = ref({});
const docDialog = ref(false), docForm = ref({});
const trackDialog = ref(false), trackForm = ref({});
const finDialog = ref(false), finForm = ref({});
const statusDialog = ref(false);
// B8 放单控制
const releaseData = ref({ order: null, receivableBalance: 0, records: [] });
const releaseDialog = ref(false);
const releaseSaving = ref(false);
const releaseForm = ref({ releaseType: 'original', releaseNo: '', remark: '' });
const RELEASE_TYPE = { original: '正本', telex: '电放' };
const APPROVAL_STATUS = { pending: '待审批', approved: '已通过', rejected: '已驳回', none: '' };
const REL_STATUS = { pending: '待放单', approved: '已放单', none: '' };
const flowData = ref({ nodes: [], currentIndex: 0, reachedCount: 0, total: 0, statusChanged: false, derivedStatus: '' });
const orderNodes = ref([]);
const doneNodeCount = computed(() => orderNodes.value.filter((n) => n.status === 'done').length);

// C6 一单多箱
const CONTAINER_STATUS = { planned: '计划', gate_in: '已进港', loaded: '已装船', arrived: '已到港', delivered: '已送达' };
const containers = ref([]);
const savingContainers = ref(false);
function addContainer() {
  containers.value.push({ orderId: detail.value.order.id, sizeType: '40', status: 'planned', weight: 0, volume: 0, packageCount: 0 });
}
function removeContainer(idx) { containers.value.splice(idx, 1); }
async function loadContainers() {
  try { containers.value = await orderContainersAPI(route.params.id); } catch (e) { containers.value = []; }
}
async function saveContainers() {
  savingContainers.value = true;
  try {
    await saveOrderContainersAPI(route.params.id, { items: containers.value });
    ElMessage.success('箱信息已保存');
    load(); loadContainers();
  } finally { savingContainers.value = false; }
}

// B3 加载订单实例节点
async function loadOrderNodes() {
  try {
    const data = await orderNodesAPI(route.params.id);
    orderNodes.value = data.nodes || [];
  } catch (e) { orderNodes.value = []; }
}
async function markNode(n, status) {
  await updateOrderNodeAPI(route.params.id, n.nodeCode, { status });
  ElMessage.success(status === 'done' ? `已标记「${n.nodeName}」完成` : status === 'blocked' ? `已标记「${n.nodeName}」卡点` : '已重置');
  loadOrderNodes();
}

// A6 节点步骤状态：已到达=success，当前=process，未到=wait
function stageStatus(n) {
  if (!n) return 'wait';
  if (n.reached) return 'success';
  if (n.current) return 'process';
  return 'wait';
}

const supplierName = (id) => suppliers.value.find((s) => s.id === id)?.name || '-';
const formatTime = (t) => (t ? String(t).replace('T', ' ').slice(0, 16) : '-');

const finSum = (dir) => detail.value.finance.filter((f) => f.direction === dir).reduce((s, f) => s + Number(f.amount), 0);
const profit = computed(() => finSum('receivable') - finSum('payable'));

async function load() {
  const [d, tl] = await Promise.all([
    orderDetailAPI(route.params.id),
    orderTimelineAPI(route.params.id),
  ]);
  detail.value = d;
  timeline.value = tl.nodes || [];
  loadOrderNodes();
  loadContainers();
  loadRelease();
}

async function changeStatus() {
  flowData.value = await orderFlowAPI(route.params.id);
  statusDialog.value = true;
}
// A6 手动推进业务节点
async function advanceNode(node) {
  if (!node) return;
  await orderAdvanceAPI(route.params.id, node.key);
  ElMessage.success(`已推进至「${node.label}」`);
  statusDialog.value = false;
  load();
}

async function saveBooking() {
  await bookingAPI.create({ ...bookingForm.value, status: 'new' });
  ElMessage.success('订舱已保存'); bookingDialog.value = false; load();
}
async function saveCustoms() {
  await customsAPI.create({ ...customsForm.value, status: 'prepared' });
  ElMessage.success('报关已保存'); customsDialog.value = false; load();
}
async function saveDoc() {
  await documentAPI.create({ ...docForm.value, status: 'draft' });
  ElMessage.success('单证已保存'); docDialog.value = false; load();
}
async function saveTrack() {
  await trackAPI.create(trackForm.value);
  ElMessage.success('节点已保存'); trackDialog.value = false; load();
}
async function saveFinance() {
  await financeAPI.create({ ...finForm.value, status: 'unpaid', paidAmount: 0 });
  ElMessage.success('费用已保存'); finDialog.value = false; load();
}

// B8 放单控制
async function loadRelease() {
  try { releaseData.value = await releaseAPI.records(route.params.id); } catch (e) { releaseData.value = { order: null, receivableBalance: 0, records: [] }; }
}
function openReleaseDialog() {
  releaseForm.value = { releaseType: 'original', releaseNo: '', remark: '' };
  releaseDialog.value = true;
}
async function submitRelease() {
  releaseSaving.value = true;
  try {
    await releaseAPI.apply(route.params.id, releaseForm.value);
    ElMessage.success('放单申请已提交');
    releaseDialog.value = false;
    loadRelease();
  } catch (e) { /* 拦截器提示 */ }
  finally { releaseSaving.value = false; }
}
async function approveRelease(rec, approve) {
  await releaseAPI.approve(rec.id, { approve });
  ElMessage.success(approve ? '放单已审批通过' : '放单已驳回');
  loadRelease();
}

onMounted(async () => {
  load();
  loadFeeTemplates(); // N1 费用模板
  const s = await supplierAPI.list({ page: 1, pageSize: 200 });
  suppliers.value = s.list;
  mql = window.matchMedia('(max-width: 768px)');
  isMobile.value = mql.matches;
  mql.addEventListener('change', onMobileChange);
});

onUnmounted(() => {
  mql?.removeEventListener('change', onMobileChange);
});

function onMobileChange(e) {
  isMobile.value = e.matches;
}
</script>

<style scoped>
.header-card { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.head-left { display: flex; align-items: center; gap: 8px; }
.hd-title { margin: 0; font-size: 20px; }
.hd-sub { color: var(--text-sub); font-size: 13px; }
.head-right { display: flex; align-items: center; gap: 12px; }
.detail-tabs { background: #fff; border-radius: var(--radius); padding: 8px 20px 20px; box-shadow: var(--shadow); }
.tl-head { display: flex; align-items: center; gap: 10px; }
.tl-loc { font-weight: 600; }
.tl-desc { color: var(--text-main); margin: 4px 0; }
.tl-op { color: var(--text-sub); font-size: 12px; }
.tl-hint { color: var(--text-sub); font-size: 12px; margin-left: 12px; }
.fin-sum { font-size: 14px; color: var(--text-sub); margin-left: 16px; }
.recv { color: var(--danger); } .pay { color: var(--success); }
.profit { color: var(--success); } .loss { color: var(--danger); }
.flow-stage { padding: 8px 0 16px; }
.flow-desc { text-align: center; color: var(--text-sub); margin: 8px 0 4px; display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap; }
.status-actions { margin-top: 24px; text-align: center; }
.page-card { margin-bottom: 16px; }
.table-topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.left { display:flex; align-items:center; }

/* 窄屏适配：头部堆叠、工具栏换行、弹窗占满宽度 */
@media (max-width: 768px) {
  .header-card { flex-direction: column; align-items: flex-start; gap: 10px; }
  .head-right { width: 100%; justify-content: space-between; }
  .detail-tabs { padding: 8px 12px 12px; }
  .table-topbar { flex-wrap: wrap; gap: 8px; }
  .left { flex-wrap: wrap; }
  .tl-hint { margin-left: 0; width: 100%; }
  .fin-sum { margin-left: 0; }
  :deep(.el-dialog) { width: 92vw !important; }
  :deep(.el-dialog__body) { padding: 12px; }
}
</style>