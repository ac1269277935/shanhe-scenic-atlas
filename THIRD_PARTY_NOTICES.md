# 第三方资料与依赖

## D3 7.9.0

- 作者：Mike Bostock 及贡献者。
- 来源：https://github.com/d3/d3/tree/v7.9.0
- 分发文件：`vendor/d3.v7.9.0.min.js`，构建时内嵌于 `index.html`。
- 许可证：ISC，完整文本见 [vendor/LICENSE-D3.txt](vendor/LICENSE-D3.txt)。

## 景区名录、批次及简介

- 文旅部名录：https://sjfw.mct.gov.cn/site/dataservice/rural?type=10
- 批次汇编：https://zh.wikipedia.org/wiki/国家5A级旅游景区
- 简介依据文旅部知识库的景区介绍压缩改写，逐条来源保留在 `introSource`。
- 已核对的批次公告链接保留在 `batchSource`；`batchStatus` 区分公告核对与公开汇编。
- 名录快照截至 2025-03-11，原始资料核对日期为 2026-09-16。本项目不是文旅部官方产品。

## 坐标与地图边界

- 坐标来源：Lore Routes / https://github.com/tuansuwu/china-5a-scenic-areas ，CC BY-SA 4.0（https://creativecommons.org/licenses/by-sa/4.0/）。其上游资料包括 Wikipedia、Wikidata 和 OpenStreetMap contributors。
- 本项目对记录进行了官方名录匹配、联合景区合并、个别点位修订与字段整理。衍生坐标数据保留 CC BY-SA 4.0 署名及相同方式共享要求。
- 地图边界来源：DataV 地理小工具，https://datav.aliyun.com/portal/school/atlas/area_selector 。对边界做了精度压缩及环绕方向处理；保留南海诸岛。使用此边界时仍应遵循来源方的适用条件。
- 不将任何第三方内容重新声明为本项目原创或统一归入项目代码许可证。
