# 欧洲历史：分流与交汇

独立时间画布，覆盖约公元前1900年的爱琴海宫殿到2026年 България 采用 euro。共 **585 个点事件、13 条时期线、673 条关系**，81 个政权／地区／主题类别。编选记录截至 2026-10-16；最新收录事件为2026年1月1日，并非逐日更新的新闻或现势地图。

打开 [欧洲历史画布](./europe-history.json)。说明使用中文，人名、政权、机构和主要事件中的专名保留原语言字形；对照见 [NAMES](./NAMES.md)。

## 阅读方式

先按时间范围缩小到一个阶段，再选择 Type／Track 中的地区或政权。颜色表示分类，不是固定的一条国家轨道。希腊诸邦、Roma、Ῥωμανία、西欧、中东欧、北欧、巴尔干和欧洲整合线路并行；殖民活动包含被征服者、奴役、抵抗与独立的视角。

点的年份表示事件坐标，非默认1月1日；约年和传统纪年会在 precision 中说明。大多数国家的成立、制度变革、战争、条约和灭亡均用点表达，只有13个必要的制度／战争时期保留线段。每条边有含义说明：普通先后不等于因果，交汇也不等于和平合并。图中年份跨度很大，adaptive 轴可压缩空白；需要比较真实时长时切换线性时间轴。

## 分期导读

- [爱琴海、希腊诸邦与罗马](./notes/ancient.md) · 84 个点事件 · [逐项目录](./notes/ancient-catalog.md)
- [中世纪的并立与交往](./notes/medieval.md) · 116 个点事件 · [逐项目录](./notes/medieval-catalog.md)
- [宗教改革、海洋扩张与王权](./notes/early-modern.md) · 106 个点事件 · [逐项目录](./notes/earlyModern-catalog.md)
- [革命、工业与民族国家](./notes/nineteenth.md) · 98 个点事件 · [逐项目录](./notes/nineteenth-catalog.md)
- [世界大战、独裁与冷战](./notes/twentieth.md) · 126 个点事件 · [逐项目录](./notes/twentieth-catalog.md)
- [1989年以来的欧洲](./notes/contemporary.md) · 55 个点事件 · [逐项目录](./notes/contemporary-catalog.md)

这些分期为阅读服务，界线可以重叠。1444年 Lagos 奴隶交易放在海洋扩张篇，1455年印刷节点也与改革篇相连。欧洲边界及身份随时代变化；希腊、罗马和现代国家之间没有一条必然、排他的文明继承线。

## 可追溯性与维护

每个节点都有来源链接、中文解释、纪年限定及相关导读。博物馆、档案、条约文本和官方机构资源用于关键核验；其余大量节点以注明性质的二手综述提供进一步阅读入口，不声称全部来自一手史料。见 [来源索引与方法](./SOURCES.md)。

数据源位于项目 scripts/data/europe-history/，生成器为 scripts/build-europe-history.mjs。修改后执行 npm run examples:europe-history，再执行 npm run examples:europe-history:check。导读为独立维护文件，生成器不会覆盖。此画布与中国历史同属 Human History 工作区，分别保存在独立图文件中，打开示例后编辑的是副本。
