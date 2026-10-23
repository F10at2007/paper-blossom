# 百纹成画矩形选框交互验收

## 实现

仅修改模式四交互，不修改其他三个模式的绘制控制器、素材数据、最终合成或 PNG 下载。

- 新增 `core/static/core/js/composition-box.js`：从纹样外轮廓求局部矩形，用已有 x/y/size/rotation 映射四角；指针逆旋转后做矩形命中。
- 修改 `core/static/core/js/compose-workshop.js`：单选、矩形内移动、四角等比缩放；现有辅助 Canvas 绘制米白/墨色细框与朱砂角点。辅助尺寸按屏幕像素调整，触控使用更大的角点命中范围。
- 缩放以原元素中心为固定基准，将指针位移投影到原角点方向，得到统一比例；限制 8%–80%，不允许反转或产生非有限值。保留旋转按钮。
- 普通矩形命中从后往前寻找最上层元素；已选元素角点优先缩放。透明孔洞也属于矩形操作区，这是本次指定的新交互，替代上一轮按实际纸片命中的行为。
- 移动/缩放保存初始快照，松手一次提交历史；pointercancel、lostpointercapture、失焦、页面隐藏、Escape 和画布尺寸变化撤回未完成操作。松手位置会参与最终计算。
- 作品数据仍使用原字段，不增加选框数据，不改变保存格式。导出、作品预览仅渲染原元素，排除辅助 Canvas。

## 文件清单

新增：`composition-box.js`、`tests/composition-box.test.mjs`、`tests/browser-composition-box.mjs`、本记录。
修改：`compose-workshop.js`、`core/templates/core/components/compose_workspace.html`（操作说明）、`tests/browser-refinements.mjs`（更新圆环透明中心的矩形命中预期）、`README.md`。

## 实际测试

Chrome for Testing 129.0.6668.100，Windows；未新增依赖。

- 新增浏览器 24 项：框与辅助画布、透明中心拖动、四角等比缩放及逐操作撤销重做、30 度旋转后缩放、重叠优先与切换选择、空白取消、删除选中、最小尺寸、失焦撤销缩放、模拟触控缩放且不滚动、作品预览与 PNG 不含选框，以及 1920/1440/720/390 无横向溢出。
- 原第四阶段 61 项、交互优化 46 项、折纸 41 项、自由剪艺 59 项回归均通过。总计 231 项浏览器断言，错误数组为空。触控移动由原第四阶段脚本验证。
- JavaScript 20 项通过，其中新增 2 项覆盖所有十二款素材、多个旋转角度、矩形顶点包围、四角索引、比例、中心和有限值保护。
- Django 4 项通过，项目检查通过。
- 实际下载并解码本轮选框作品 PNG，逐像素与仅使用保存数据重新渲染的图像比较一致；原四模式 PNG 回归仍通过。
- 已查看 1440 宽度的实际选框截图。

证据位于被忽略的 `.qa/`：
- `bounding-box-1792731483773/report.json`
- `phase-four-1792731513275/report.json`
- `refinements-1792731528327/report.json`
- `phase-three-1792731537829/report.json`
- `phase-two-1792731551407/report.json`

浏览器使用独立测试配置，本地测试作品在结束后恢复；没有修改日常浏览器数据。触控为模拟输入，未进行实体触屏设备验证。没有新增复杂图层、吸附或高级编辑功能。
