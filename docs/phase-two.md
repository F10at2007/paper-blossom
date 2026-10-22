# 第二阶段：自由剪艺与透明 PNG

## 使用

```powershell
.\.venv\Scripts\Activate.ps1
python manage.py runserver
```

打开 http://127.0.0.1:8000/workshop/free/ 。按下拖动绘制轮廓，松手自动闭合，圈内区域真正被剪去。支持鼠标与单指操作。点击“下载作品”生成 `一纸生花_自由剪纸.png`（2048×2048）。

剪裁路径仅在当前页面内保留。刷新或离开页面会丢失；“保存作品”仍为明确的占位入口。

## 实现

- **坐标与事件**：Pointer Events 统一处理鼠标和触控，setPointerCapture 保证画布外松手可结束绘制。每个采样点从当前 bounding rect 映射到 [0,1] 归一化坐标。CSS `touch-action: none` 只应用于绘图区，阻止绘图时的默认滚动与手势。
- **结束与中断**：pointerup 自动闭合提交；pointercancel、lostpointercapture、窗口失焦、页面隐藏、Escape 和绘制中尺寸变化取消当前临时路径，保留之前的作品。固定提示区高度，避免反馈文字变化移动画布。ResizeObserver 与事件在页面销毁时清理，BFCache 返回时保留监听。
- **实时反馈**：画布位图 1024×1024，CSS 负责响应式显示；独立透明覆盖层用 requestAnimationFrame 绘制双对比描边和轻微填充的临时闭合区域。作品层在提交时才更新，小预览与放大预览不包含辅助路径。
- **镂空**：每次更新先清除位图，填充完整纸色，再重放历史轮廓，通过 `destination-out` 和 evenodd 填充移除像素。棋盘格仅为 CSS 背景，不在纸张图层内。自交轮廓按奇偶规则镂空；单击、直线及极小无面积路径被忽略。
- **历史**：保存路径数据，不保存历史截图。撤销/重做分别移动路径栈；新有效剪裁清除重做分支，无效笔画不影响分支。清空前使用原生确认框，确认后清除两个栈并恢复当前颜色的完整纸张。按钮随历史与绘制状态启用/禁用。
- **颜色**：朱砂红、正红、暖米白、墨黑。颜色变化只更新完整纸张底色，已保存的剪裁路径重新重放，透明区域保留。颜色本身不占剪裁撤销步数。
- **导出**：独立 Canvas 按 2048×2048 使用相同路径与纸色重建，再调用 toBlob。没有 DOM 截图或背景合成。空纸也能正常下载。处理空 Blob、编码异常、重复点击及下载启动异常，释放临时下载链接；Blob URL 延迟 10 秒释放，离开页面时也会清理。提示为“已交给浏览器下载”，不声称已经写入用户指定的磁盘位置。

## 新增文件

- `core/static/core/js/free-paper.js`：几何校验、路径历史、作品渲染与 PNG 编码。
- `core/static/core/js/free-workshop.js`：工作台生命周期、指针、工具、预览与下载。
- `core/static/core/css/free-workshop.css`：自由模式专属样式。
- `core/templates/core/components/free_workspace.html`、`free_tools.html`：复用共用工具栏外壳的自由模式界面。
- `tests/free-paper.test.mjs`：无需第三方依赖的逻辑测试。
- `tests/browser-free-cut.mjs`：使用 Chrome DevTools Protocol 的实际浏览器验收。
- 本文档。

## 修改文件

- `core/templates/core/base.html`：按页资源入口和通用占位提示标题。
- `core/templates/core/workshop.html`、`components/toolbar.html`：仅 free 分支加载真实交互；其他模式保持静态。
- `core/modes.py`：自由模式操作说明。
- `core/templates/core/index.html`、`modes.html`：更新自由剪艺可用状态。
- `core/static/core/js/app.js`：占位提示只描述当前点击的未开放入口。
- `core/tests.py`：区分自由模式真实功能与其他模式占位边界。
- `README.md`：使用方法、目录、当前范围与测试方法。

没有增加应用依赖，没有修改数据库模型、作品管理数据逻辑或另外三种玩法。

## 实际验收

测试环境：Windows，Django 6.1.2、Python 3.12.14、Node 24.19.0、Chrome for Testing **129.0.6668.100**。浏览器来自 Google 官方 Chrome for Testing 清单，仅下载到 `.qa/chrome129/`，没有替换系统浏览器。

| 项目 | 结果与验证方法 |
| --- | --- |
| 页面与模式边界 | 4 项 Django 测试通过 |
| 历史与异常处理 | 5 项原生 Node 测试通过：历史往返、新分支、清空、无效轮廓、自交轮廓、编码异常 |
| 实际浏览器 | Chrome 129 中 68 项断言通过，未捕获到控制台或运行时错误 |
| 鼠标 | CDP 真实输入事件完成路径预览、自动闭合、多次剪裁、画布外松手、清空后重画 |
| 触控 | Chrome 129 触控模拟真实输入，完成剪裁、取消手势，检查页面 scrollY 不变；未以实体触屏设备手工验证 |
| 生命周期 | 窗口 blur、pointercancel、失去指针捕获、绘制中 resize 均取消未提交轮廓；先前已提交路径保留 |
| 镂空 | 检查作品与预览像素 alpha=0，纸张像素 alpha=255；四种换色不填回镂空；重复重建位图一致 |
| 历史 | 连续撤销重做、撤销后新操作清理分支、10 次连续剪裁和 10 次撤销/重做后位图一致 |
| 清空 | 原生确认框分别取消与确认，验证数据与按钮状态 |
| PNG | 浏览器真正下载空纸和镂空作品共 2 个文件；检查下载完成事件、默认文件名、PNG 签名及 2048×2048 尺寸；解码文件，验证透明度、当前纸色与归一化位置采样和画布一致 |
| 导出失败 | 注入 toBlob 空值与同步异常，均显示失败并恢复可重试状态；检查成功下载的 Blob URL 被释放 |
| 响应式 | 1920/1440/720 下各页面链接与资源正常，无横向溢出；分别实际绘制并检查位置；窗口缩放和 DPR=2 后旧位图保持一致、新剪裁坐标准确 |
| 放大预览 | 实际作品与透明区域正确，Escape 可关闭 |
| 工程 | JavaScript 语法检查、Django check、collectstatic 静态资源收集、git diff --check |

完整逐项断言、下载文件和截图在 `.qa/phase-two-*/`；该目录不纳入 Git。

### 复现自动验收

先启动 Django，并单独启动一个用于测试的 Chrome（与日常浏览器使用不同的 profile）：

```powershell
Start-Process -FilePath 'G:\网站学习\.qa\chrome129\chrome-win64\chrome.exe' -WindowStyle Hidden -ArgumentList '--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9222','--user-data-dir=G:\网站学习\.qa\chrome129-profile','about:blank'
node tests/browser-free-cut.mjs
node --test tests/free-paper.test.mjs
python manage.py test
```

测试脚本无 npm 依赖，需要 Node 22+ 的内置 WebSocket。Chrome 二进制不随源码分发；换目录时请调整路径。浏览器脚本在测试标签页进行绘制与下载，结果写入项目 `.qa/`。

## 验证边界与后续建议

- 触控通过浏览器模拟验证，尚未在实体手机/平板上验证。建议下一步先做实体触屏和比赛机器上的手工体验检查。
- 没有进行极大量路径、超长手势的压力测试；每次完成操作重放全部路径，当前实现优先简洁与可编辑性，大量复杂路径时需再测性能。
- PNG 按相同几何在更高分辨率重绘，抗锯齿边缘会有正常的采样差异；已验证内部像素、透明区域、比例及位置一致，不宣称两个分辨率逐像素相同。
- 作品不能跨刷新恢复，这是本阶段范围约束。下一阶段应先确认作品版本化数据结构，再按授权安排持久化或其他单一模式。
- 未开发折叠展开、临摹评分、纹样拼接、本地作品管理、账号或云端存储；不会在本阶段后自动继续。
