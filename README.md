# Video Player Toolkit · 通用视频工具

**A player-attached, draggable video companion.** Automatic A–B clips, remembered loops, a saved-clip timeline and picture-in-picture, without a domain allowlist.

**吸附在播放器边缘、可拖动的视频工具。** 自动保存 A–B 片段、记忆循环区间、片段时间轴与画中画，不限制网站域名。

[Install / Update · 安装 / 更新](https://github.com/canceled9369/video-player-toolkit/raw/refs/heads/main/video-player-toolkit.user.js) · **v3.0.0**

## English

### What is this?

A **Tampermonkey userscript**, not a standalone video app. It detects standard HTML5 videos on HTTP/HTTPS pages and adds controls for repeating and bookmarking sections. It does not download or edit video files.

### Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) using its official browser-store link.
2. Enable **Allow user scripts**, if available, and grant access to the sites where you want the tool to run.
3. Open the **Install / Update** link above and confirm installation in Tampermonkey. If it displays source code instead, copy all of it into Tampermonkey → Create a new script, replacing the template, then save.
4. Disable older copies of this tool and duplicate anti-pause scripts. Refresh the video page.
5. The tool starts **collapsed** on the selected video's edge. Click **Loop** to expand it.

Use a recent desktop Chrome or Edge for full Document Picture-in-Picture support. Other environments may fall back to basic PiP.

### Loop and clip workflow

- Press `[` at the start, then `]` at the end. A valid range is **automatically saved**, named by its start/end times, selected, and looped. Setting the same range again reuses its existing clip and keeps its custom name.
- Refreshing restores the last range and selection. If looping was enabled, the tool seeks back to A **when playback starts**. It does not independently force autoplay.
- **Play selected clip** works before metadata has loaded: it requests playback and retries the pending seek on media readiness events. If a site blocks playback, start its original player.
- Select a saved clip in the list, then use **Play selected clip**.
- Hover over the tool's timeline and click **Play here** to play a saved interval containing that position. Scrubbing the tool's timeline pauses the current loop so you can explore other intervals. When intervals overlap, the shortest containing interval wins.
- The small blue bands below the timeline represent saved clips; click a band to play that clip directly.
- To rename: select a clip, type a new name, and press **Rename**. Delete requires a second confirmation click. Clearing the active range does not delete saved clips.

| Shortcut | Action |
| --- | --- |
| `[` | Set A |
| `]` | Set B, auto-save and enable loop |
| `L` | Toggle current loop |
| `P` | Open / close PiP |
| `\` | Clear active range and its resume memory |

Shortcuts require focus in the page or PiP window. They are ignored while typing in an input/select or editable field, including the tool's own Shadow DOM fields.

### Dock and appearance

- Collapsed on every page load; never pinned to the webpage's bottom-right corner.
- Drag the dotted handle to snap to any of the video's four edges. It remains attached while scrolling/resizing. With the handle focused, arrow keys move it to an edge.
- Dock position and language preference are saved locally. Use **EN / 中** to switch the UI language.
- Apple-inspired compact glass surface, system typography, restrained blue accents, and short expand/press/snap transitions. This is a web UI, not an Apple native component.
- Supports `prefers-reduced-motion`, visible keyboard focus, and a higher-contrast appearance. No dependency on animation libraries.
- For multiple videos, choose the player from the selector. The initial choice prioritizes a playing or larger video.

### Compatibility and privacy

No domain restriction does **not** mean every custom player is compatible. Standard `<video>` elements and open Shadow DOM are supported; canvas-based decoders and closed Shadow DOM are not. Embedded frames need userscript permission for their own origins and may only support basic PiP.

Recognized Plyr, Video.js and JW Player containers are moved as a whole for PiP; other videos use native controls. Existing thumbnail components may survive, depending on the site. The tool does **not** generate thumbnail images for its own timeline. Browser policy, protected media, native fullscreen and site DOM replacement can limit controls or PiP.

Data stays in the current site's browser `localStorage`; nothing is uploaded to GitHub. Same-origin website code can read this storage. Clearing site data removes records; browser profiles and domains do not sync. Keys use the page URL and player ID/slot, while ignoring `t`, `start` and `time_continue`. Other URL changes can create separate records. Playlists that swap media without changing URL/player identity cannot always be distinguished.

v2 records are retained. A remembered range that was never explicitly saved becomes a time-named clip. The earlier site-specific records are read as a fallback on matching single-video pages. Storage errors are surfaced instead of silently reporting success.

### Validation

Run the local behavior checks with Node.js: `node test.cjs`. No packages are required.

Syntax validation and **21 local behavior checks** passed: auto-save/deduplication, refresh and original-Play recovery, selection restoration, delayed metadata/seekability, looping, manual pause, interval lookup, deletion, URL identity, docking geometry, legacy recovery and storage failures.

Real Tampermonkey installation and visual/browser compatibility have **not** been verified for v3. The connected browser blocks access to extension settings, so no claim of live UI verification is made. Loop precision remains subject to media seeking and browser scheduling.

## 中文

### 用途与安装

这是一个 **Tampermonkey（油猴）脚本**，不是独立播放器。它在 HTTP/HTTPS 网页上检测标准 HTML5 视频，为重复观看和保存播放区间提供统一控制，不下载或剪辑视频。

1. 从 [Tampermonkey 官网](https://www.tampermonkey.net/) 提供的浏览器商店入口安装扩展。
2. 开启“允许用户脚本”（若提供），并允许在目标网站运行。
3. 点击顶部“安装 / 更新”，在油猴页面确认。若仅显示源码，将全部代码复制到油猴“添加新脚本”，替换模板并保存。
4. 停用旧版及重复的防暂停脚本，刷新视频页面。
5. 工具默认以**收起的胶囊按钮**吸附在视频边缘，点击“片段”展开。

新版桌面 Chrome / Edge 支持完整浮窗；其他环境可能回退为基础画中画。

### 自动片段与恢复播放

- 按 `[` 设置起点 A，按 `]` 设置终点 B。有效区间会**自动保存为起止时间命名的片段**，选中并开始循环。相同区间再次设置不会重复新增，也不会覆盖已改好的名字。
- 刷新后恢复上次区间和所选片段。上次循环开启时，**点击播放后会回到 A 点继续循环**；脚本不会自行强制自动播放。
- 视频元数据尚未加载时点击“播放所选片段”，会先触发加载并保留待跳转位置，在媒体就绪后重试。网站限制播放时，请点击原播放器的播放按钮。
- 在列表中选择任意片段，再点击“播放所选片段”。
- 鼠标悬停工具进度条，点击“播放此区间”，会播放包含该时间点的已保存片段。也可拖动工具进度条到某个区间内；拖动时当前循环会暂停，便于选择其他片段。重叠区间优先选择最短的一个。
- 进度条下方的蓝色短条代表已保存片段，点击即可直接播放。
- 选中片段、输入新名称、点击“改名”。删除需要再次确认；清除当前循环不会删除保存的片段。

| 快捷键 | 操作 |
| --- | --- |
| `[` | 设置起点 A |
| `]` | 设置终点 B，自动保存并开启循环 |
| `L` | 开关当前循环 |
| `P` | 打开 / 关闭浮窗 |
| `\` | 清除当前区间及其恢复记忆 |

快捷键需要网页或浮窗获得焦点；在输入框、选择框和可编辑区域中不会触发，包括工具自身的 Shadow DOM 输入框。

### 吸附、拖动与外观

- 每次打开页面默认收起，不再固定在网页右下角。
- 拖动点状手柄，吸附到视频上、下、左、右边缘；滚动和调整尺寸时跟随视频。手柄获得焦点后，也可用方向键切换边缘。
- 本地记忆吸附位置与语言；通过 **EN / 中** 切换界面语言。
- Apple 风格的紧凑半透明面板、系统字体、少量蓝色强调，以及短时展开、按压、吸附动效。它是网页实现，不是 Apple 原生控件。
- 支持系统“减少动态效果”、键盘焦点指示和增强对比度；没有引入第三方动效库。
- 多个视频时，可在选择器中切换控制对象；初次优先选择正在播放或画面较大的视频。

### 限制与本地数据

不限制域名不代表所有自定义播放器都已适配。支持标准 `<video>` 和开放 Shadow DOM；不支持直接控制 Canvas 自定义解码或封闭 Shadow DOM。iframe 需要对应来源的脚本执行权限，可能只能使用基础画中画。

完整浮窗会尝试整体移动 Plyr、Video.js、JW Player 容器；其他视频使用原生控件。原有缩略图能否保留取决于网站，工具自己的进度条不会生成缩略图。受保护媒体、原生全屏、浏览器策略或网站重建播放器可能限制功能。

记录仅保存在当前网站的 `localStorage`，不上传 GitHub；同源网站代码可以读取它。清除网站数据会删除记录，不跨浏览器/域名同步。记录按完整页面 URL 和播放器 ID/序号区分，忽略 `t`、`start`、`time_continue`。其他 URL 变化可能产生新记录；不改 URL 和播放器标识的播放列表暂时不能可靠区分内容。

兼容 v2 数据；以前只记忆、没保存的完整区间会转成时间命名片段。同站点单视频页面也会尝试读取早期版本记录。保存失败会明确提示，不会假报成功。

### 验证情况

本地使用 Node.js 运行 `node test.cjs`，无需安装依赖。

已通过语法检查和 **21 项本地行为测试**：自动保存/去重、刷新恢复、原播放器开始播放时恢复区间、片段选择、元数据/可定位区间延迟、循环边界、手动暂停、区间查找、删除、URL 区分、吸附坐标、旧记录恢复及存储失败。

v3 的油猴实机安装、真实界面与跨站兼容性**尚未验证**：当前连接的浏览器禁止访问扩展设置页，因此不宣称已完成实机 UI 验证。区间循环也不是逐帧精确剪辑。

## Changelog / 更新记录

- **3.0.0** — Auto-saved clips, deferred seek/resume fixes, timeline clip lookup, collapsed draggable dock, bilingual glass-style UI. / 自动片段、延迟定位与恢复修复、区间查找、默认收起的可拖动吸附工具、中英双语玻璃风格界面。
- **2.0.0** — Universal HTML5 video detection and multiple-player support. / 通用视频检测与多播放器选择。

To update, reinstall from the link above and refresh your video page. Automatic-update URLs are not configured. / 更新时重新打开安装链接，更新后刷新视频页面；未配置自动更新地址。
