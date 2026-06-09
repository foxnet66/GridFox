# GridFox

舒尔特方格挑战网页应用。面向小红书分享场景：在线完成挑战，记录用时，并生成两分钟竖屏发布素材。

## 功能

- 4x4、5x5、6x6 三档难度，默认 6x6 / 1-36。
- 实时计时、错误点击反馈、完成用时和本地最佳成绩。
- 完成后复制分享文案。
- 可选择数字颜色数量和页面主题。
- 生成 9:16 WebM 非交互式自动演示视频，含 3 秒倒计时前导，可下载发布。
- 本地离线生成 9:16 MP4 发布素材，含 3 秒倒计时前导。

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

可选参数：

```bash
npm run video:promo -- --size 6 --theme vivid --colors 4 --duration 120 --output dist/gridfox-xiaohongshu.mp4
```

`--duration` 是正式计时段长度；输出视频会额外包含 3 秒前导倒计时。
