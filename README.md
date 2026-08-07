# GridFox

舒尔特方格挑战网页应用。面向小红书分享场景：在线完成挑战，记录用时，并生成两分钟竖屏发布素材。

## 功能

- 4x4、5x5、6x6 三档难度，默认 6x6 / 1-36。
- 实时计时、错误点击反馈、完成用时和本地最佳成绩。
- 完成后复制分享文案。
- 可选择顺序查找或倒序查找。
- 可选择标准方格或圆盘舒尔特版式。
- 圆盘版支持慢速/快速旋转动态挑战。
- 可选择数字颜色数量和页面主题。
- 提供 5x5 红黑交替玩法：黑 1、红 1、黑 2、红 2，依次找到黑 13。
- 红黑玩法包含入门和进阶规则；进阶版使用黑色升序、红色降序交替查找。
- 本地离线生成 9:16 MP4 发布素材，含 3 秒倒计时前导。
- 提供折叠式发布助手，根据当前玩法生成小红书发布文案，可一键复制。
- 提供每日发布建议，一键应用当天玩法，并可离线导出固定种子的每日挑战视频。

## 开发

```bash
npm install
npm run dev
```

本地访问：

```text
http://127.0.0.1:5173/
```

生产构建：

```bash
npm run build
```

生成小红书 MP4：

```bash
npm run video:promo
```

常用预设：

```bash
# 5x5，无音乐，适合发布后自行配小红书音乐
npm run video:xhs

# 今日发布建议，无音乐，固定当天玩法和方格
npm run video:xhs:daily

# 5x5，倒序查找，无音乐
npm run video:xhs:desc

# 6x6，圆盘舒尔特，无音乐
npm run video:xhs:radial

# 6x6，旋转圆盘舒尔特，无音乐
npm run video:xhs:rotate

# 6x6，倒序圆盘舒尔特，无音乐
npm run video:xhs:radial:desc

# 6x6，圆盘舒尔特，内置轻音乐
npm run video:xhs:radial:music

# 5x5，内置轻音乐
npm run video:xhs:music

# 5x5，每 10 秒刷新，60 秒共 6 轮，霓虹主题
npm run video:xhs:shuffle:3x4

# 6x6，无音乐，难度更高
npm run video:xhs:6x6

# 5x5 红黑交替，3:4，无音乐
npm run video:xhs:redblack:3x4

# 5x5 红黑进阶，3:4，无音乐
npm run video:xhs:redblack:advanced:3x4
```

可选参数：

```bash
npm run video:promo -- --size 6 --layout radial --order asc --theme vivid --colors 4 --music soft --duration 120 --output dist/gridfox-xiaohongshu.mp4
```

`--duration` 是正式计时段长度；输出视频会额外包含 3 秒前导倒计时。
`--layout` 支持 `grid`、`radial`、`hex`、`mosaic`、`float`、`spiral`、`maze`、`wave`、`dual`、`breathe`、`star`、`mixed`、`redblack`；默认 `grid`。
`redblack` 固定使用 5x5 红黑同号交替规则，`--size`、`--order` 和 `--colors` 不影响棋盘内容。
传入 `--redblack-rule advanced` 可导出黑升红降的进阶规则。
`--rotation` 可选 `none`、`slow` 或 `fast`，只对 `radial` 生效；默认 `none`。旋转圆盘会按外圈顺时针、中圈逆时针、内圈顺时针运动。
旋转视频默认用 `--capture-fps 12` 截帧；如需更顺滑可传 `--capture-fps 24`，生成时间也会相应增加。
`--order` 可选 `asc` 或 `desc`；默认 `asc`。
`--daily` 会使用当天发布建议的玩法、主题、颜色数量和固定种子。
默认每次生成随机方格；如需复现同一版方格，可传 `--seed 1234`。
传入 `--shuffle-interval 10` 可让普通方格每 10 秒重新排列；每轮会提示轮次，刷新后从 1 重新开始。默认关闭。
音乐可选 `soft`、`focus`、`energy`、`none`；默认 `soft`。
也可以把自己的音乐文件放进 `assets/music`，然后只传文件名：

```bash
npm run video:xhs:neon:3x4 -- --music-track focus-night.mp3
```

文件名包含空格时需要加引号：

```bash
npm run video:xhs:neon:3x4 -- --music-track "focus night.mp3"
```

脚本会自动循环音乐，使其覆盖完整视频，并在开始和结尾加入淡入淡出。音乐文件不会被 Git 提交。

在倒计时前加入自动生成的中文规则语音：

```bash
npm run video:promo -- --layout voronoi --size 6 --voice-over true --day 33 --music-track foundation.mp3 --duration 90 --output dist/gridfox-voice.mp4
```

语音内容会根据玩法、数字范围、正序/倒序、旋转和刷新间隔自动生成。默认通过 macOS 语音框架使用较自然的 `Li-Mu` 普通话男声和 175 语速；也可通过 `--voice-name Yu-shu` 切换为女声，或使用 `--voice-name Tingting` 保留旧音色。`--voice-rate` 可调整语速，传入 `--voice-text` 可以完全覆盖自动文案。默认在语音进行到 50% 时切换到倒计时画面，可用 `--voice-countdown-at 0.5` 调整切换比例。数字 3 和 2 各至少显示 1 秒，数字 1 会保持到语音结束，确保完整显示后再进入挑战。语音会经过轻量 EQ 和动态压缩；背景音乐从倒计时开始播放，并在人声结束前自动降低音量。

仍然可以通过 `--music-file` 使用目录外的文件：

```bash
npm run video:promo -- --music-file /path/to/music.mp3 --output dist/gridfox-with-music.mp4
```

快速检查视频导出：

```bash
npm run video:check
```

该命令会生成两个短样片，检查 `--music none` 是否没有音轨，以及输出时长是否包含 3 秒前导倒计时。
