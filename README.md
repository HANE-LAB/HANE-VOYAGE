# HANE Voyage · 火羽舰队

火羽ひのめ的大航海可视化（非官方）。名单上的每一个人是一艘船，跟着她的船从 2021 年航行到今天。

[在线浏览](https://hane-lab.github.io/HANE-VOYAGE/) · [离线版](https://github.com/HANE-LAB/HANE-VOYAGE/releases/download/offline/HANE-Voyage-offline.zip) · [Windows 桌面版](https://github.com/HANE-LAB/HANE-VOYAGE/releases/download/offline/HANE-Voyage-setup.exe) · [源码](https://github.com/HANE-LAB/HANE-VOYAGE)

## 功能

- 按天回放 2021-02-03 至今的大航海人数、粉丝数和开播日
- 每位舰长、提督、总督一艘船，按上舰先后编号
- 「寻舟」：按昵称、UID 或编号找到自己的船
- 每月一座海中鸟居，陪伴满一年的名字刻在鸟居上
- 二次元、写实两种画风，电影模式
- 数据每天日本时间 03:00 自动更新

画面里每样东西代表什么、按钮怎么用，见 [画面与操作](docs/GUIDE.md)。

## 运行

浏览：打开在线网站；或者解压离线版，用 Chrome 或 Edge 打开 `index.html`。

开发（Node.js 24）：

```powershell
npm install
npm run dev      # http://127.0.0.1:8770/
npm run build    # 单文件 dist/index.html
```

## 文档

| 文档 | 内容 |
|---|---|
| [画面与操作](docs/GUIDE.md) | 画面元素和数据的对应，按钮和快捷键 |
| [数据](docs/DATA.md) | 来源、格式、采集、编号、名字与隐私 |
| [开发指南](docs/DEVELOPMENT.md) | 环境、代码结构、参数、调试和检查 |
| [部署](docs/DEPLOY.md) | 网站、离线版和桌面版的发布 |

## 数据与隐私

- 来源：vtbs.moe（每天的人数和粉丝数）、B 站直播间的大航海名单、Danmakus（开播日和直播时的上舰记录），都不需要登录。
- 只存 UID 的哈希，不存头像和 UID；输入的 UID 只在浏览器里比对。
- 名字只在点船、悬停或寻舟时显示，陪伴一年以上的除外。要删除名字，联系维护者，见 [名字与隐私](docs/DATA.md#名字与隐私)。

配乐：Kevin MacLeod《Senbazuru》（incompetech.com），CC BY 4.0。
