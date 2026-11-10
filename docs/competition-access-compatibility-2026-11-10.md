# 比赛访问与首页门厅验收（2026-11-10）

## 现场入口判断

- README 原有启动方式是 Django 本机开发服务器，原示例地址 `http://127.0.0.1:8000/`，适用于比赛电脑本机演示。
- 手机或评委设备需要走普通 HTTP 局域网地址。项目没有记载比赛现场地址；比赛实际 IP **待确认**。本机网卡本次为 `192.168.0.102`，用它验证了局域网来源与 Django 主机校验。跨实体手机/评委设备访问及现场 Wi-Fi、防火墙仍待验证。
- 项目没有 HTTPS 域名、证书或反向代理配置，HTTPS 实际地址**待确认**，没有公网部署或绕过浏览器安全限制。

## 修改

- 门厅在 HTML 中默认隐藏；视频节点与跳过、声音、重看、结束、出错、键盘退出事件绑定完后才有机会显示。门厅模块未加载时，四个首页工坊入口仍可用。
- 首播与重播共用结束、出错、播放失败及卡住处理。每轮独立计时器及序号使淡出期间立即重看时，旧淡出、播放失败回调和旧 `ended` 事件不能关闭新一轮。关闭后移除滚动锁。
- 同会话已看、减少动态效果、`?intro=0` 跳过自动播放；`intro=0` 不渲染不可用的重看按钮。门厅锁定背景焦点、将焦点送入可操作按钮、Escape 可跳过，淡入前跳过按钮不进入键盘焦点；关闭后焦点回到重看入口。
- 作品及拼接元素 ID 优先调用 `crypto.randomUUID()`；缺失时以 `crypto.getRandomValues()` 生成 UUID v4 格式。作品校验、保存版本和 JSON 结构未变，旧作品可读。
- `DJANGO_ALLOWED_HOSTS` 支持比赛本机显式添加局域网 IP；未设置时仅允许 `localhost,127.0.0.1`。README 记录现场启动方式及地址待确认事项。

## Chrome 129 访问上下文实测

Chrome for Testing `129.0.6668.100`，同一台电脑运行 Django 和浏览器：

| 访问方式 | 本次测试 URL | `isSecureContext` | `crypto.randomUUID` | 结果 |
| --- | --- | --- | --- | --- |
| 本机名 | `http://localhost:8000/` | `true` | `function` | 首页与门厅专项通过 |
| 回环地址 | `http://127.0.0.1:8000/` | `true` | `function` | 首页与门厅专项通过 |
| 普通 HTTP 网卡 IP | `http://192.168.0.102:8000/` | `false` | `undefined` | 门厅专项、四模式完整工作流通过；UUID 回退实际生效 |
| HTTPS 域名 | 实际地址待确认 | 未测 | 未测 | 无域名/证书；需现场验证 |

局域网验证是通过本机网卡 IP 发起，未使用第二台实体设备。普通 HTTP 局域网中，浏览器还提示 Django 的 COOP 头因来源不安全而被忽略；该浏览器提示不影响功能。四模式回归只过滤这条确定的 COOP 来源提示，其他浏览器或脚本错误仍会失败。

## 可重复验证

项目目录 PowerShell：

```powershell
$env:DJANGO_ALLOWED_HOSTS='localhost,127.0.0.1,192.168.0.102'
python manage.py runserver 0.0.0.0:8000 --noreload
```

另一个终端启动 Chrome 129 独立配置（关闭日常浏览器并使用项目内独立测试配置），再运行：

```powershell
$env:BASE_URL='http://localhost:8000'
node tests/browser-intro-gate.mjs
$env:BASE_URL='http://127.0.0.1:8000'
node tests/browser-intro-gate.mjs
$env:BASE_URL='http://192.168.0.102:8000'
node tests/browser-intro-gate.mjs
node tests/browser-phase-four.mjs
```

门厅脚本重复验证首次真实视频自然结束、同会话跳过自动播放、淡出期跳过后立即重看、焦点进入、脚本请求阻断、三种宽度与 `intro=0`。局域网 phase-four 验证进入四模式、百纹成画添加/复制/拖动、首次保存、刷新恢复、下载 PNG 并解码。

本次结果：门厅脚本 10 项（localhost、127.0.0.1、LAN 各通过；修改焦点时序后 localhost 再通过）；局域网四模式 74 项、6 次下载通过；本机 `manage.py check` 及 Django 4 项测试通过；Node 单元测试 24 项通过。其他现有浏览器回归：refinements 46、phase-four 74、fold-cut 41、radial-cut 46、composition-box 24 均通过。`browser-free-cut.mjs` 两次运行未通过：一次出现 `No dialog is showing`，另一次在首页 1920 宽度资源检查失败；该既有脚本时序/资源断言不在本次范围，未修改。

报告和截图目录均在忽略的 `.qa/`：

- 门厅本机名最终报告：`.qa/intro-gate-1794303583529/report.json`
- 回环地址报告：`.qa/intro-gate-1794303320240/report.json`
- 局域网地址最终报告：`.qa/intro-gate-1794303532247/report.json`
- 局域网完整四模式工作流：`.qa/phase-four-1794303548760/report.json`
- 其他回归：`.qa/refinements-1794303409349/report.json`、`.qa/phase-four-1794303414171/report.json`、`.qa/phase-three-1794303421927/report.json`、`.qa/radial-1794303476339/`、`.qa/bounding-box-1794303488962/report.json`

## 现场待办

确认比赛电脑、现场 Wi-Fi 下服务电脑的局域网 IP 与端口；确认防火墙放行；用真实手机或评委设备访问并完成百纹成画保存/恢复/PNG 流程。如果比赛规定 HTTPS，提供实际域名与证书后再验证安全上下文和作品持久化。
