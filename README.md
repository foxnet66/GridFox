# GridFox

舒尔特方格挑战网页应用。面向小红书分享场景：在线完成挑战，记录用时，并生成两分钟竖屏发布素材。

## 功能

- 4x4、5x5、6x6 三档难度，默认 6x6 / 1-36。
- 实时计时、错误点击反馈、完成用时和本地最佳成绩。
- 完成后复制分享文案。
- 可选择顺序查找或倒序查找。
- 可选择标准方格或圆盘舒尔特版式。
- 可选择数字颜色数量和页面主题。
- 生成 9:16 WebM 非交互式自动演示视频，含 3 秒倒计时前导，可下载发布。
- 本地离线生成 9:16 MP4 发布素材，含 3 秒倒计时前导。
- 提供折叠式发布助手，根据当前玩法生成小红书发布文案，可一键复制。

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

# 5x5，倒序查找，无音乐
npm run video:xhs:desc

# 6x6，圆盘舒尔特，无音乐
npm run video:xhs:radial

# 6x6，倒序圆盘舒尔特，无音乐
npm run video:xhs:radial:desc

# 6x6，圆盘舒尔特，内置轻音乐
npm run video:xhs:radial:music

# 5x5，内置轻音乐
npm run video:xhs:music

# 6x6，无音乐，难度更高
npm run video:xhs:6x6
```

可选参数：

```bash
npm run video:promo -- --size 6 --layout radial --order asc --theme vivid --colors 4 --music soft --duration 120 --output dist/gridfox-xiaohongshu.mp4
```

`--duration` 是正式计时段长度；输出视频会额外包含 3 秒前导倒计时。
`--layout` 可选 `grid` 或 `radial`；默认 `grid`。
`--order` 可选 `asc` 或 `desc`；默认 `asc`。
默认每次生成随机方格；如需复现同一版方格，可传 `--seed 1234`。
音乐可选 `soft`、`focus`、`energy`、`none`；默认 `soft`。
也可以使用自己的音乐文件：

```bash
npm run video:promo -- --music-file /path/to/music.mp3 --output dist/gridfox-with-music.mp4
```

快速检查视频导出：

```bash
npm run video:check
```

该命令会生成两个短样片，检查 `--music none` 是否没有音轨，以及输出时长是否包含 3 秒前导倒计时。
