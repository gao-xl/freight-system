// freight-user-guide :: charts.js
// 图 2-1 各角色可访问的主要模块数量对比
(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  var el = document.getElementById('chart-role');
  if (!el || typeof echarts === 'undefined') return;

  var chart = echarts.init(el);
  var roles = ['客户', '销售', '操作员', '财务', '经理', '系统管理员'];
  var modules = [3, 5, 8, 7, 12, 14];

  chart.setOption({
    grid: { left: 8, right: 24, top: 20, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function (p) {
        return p[0].name + '：可访问 ' + p[0].value + ' 个模块';
      }
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'category',
      data: roles,
      axisLabel: { color: ink, fontSize: 13 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    series: [
      {
        type: 'bar',
        data: modules,
        barWidth: '58%',
        label: {
          show: true,
          position: 'right',
          color: accent,
          fontWeight: 600,
          formatter: '{c}'
        },
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: accent },
              { offset: 1, color: accent2 }
            ]
          }
        }
      }
    ]
  });

  window.addEventListener('resize', function () { chart.resize(); });
})();