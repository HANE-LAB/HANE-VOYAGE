# 开发指南

[文档目录](README.md)

## 环境

浏览构建好的页面只需要 Chrome 或 Edge。开发需要 Node.js 24 和 npm，在项目根目录运行：

```powershell
npm install        # 第一次，或 package-lock.json 变化后
npm run dev        # 开发服务器 http://127.0.0.1:8770/，改动保存后自动刷新
npm run check      # TypeScript 类型检查
npm run build      # 类型检查后构建 dist/index.html
npm run preview    # 在 http://127.0.0.1:8771/ 预览构建结果
```

`dist/index.html` 是一个独立文件：脚本、样式、着色器和 three.js 都在里面，双击就能打开。只有字体从 Google Fonts 加载，没有网络时用系统字体。

配乐 `public/senbazuru.m4a` 不内嵌：内嵌后每个观众都要多下载约 1.5 MB，不开配乐的人也一样。Vite 把它原样复制到 `dist/`，页面在观众点右上角的喇叭时才下载，离线版和桌面版也带着它。它是 Kevin MacLeod 的《Senbazuru》（incompetech.com，CC BY 4.0），也是第二期视频的主旋律。文件截掉了开头 0.5 秒和结尾约 2 秒的静音，末尾加 0.8 秒淡出，所以循环时约半秒后重新开始；响度降到 −22 LUFS，编码成 AAC 96 kbps，共 91.5 秒、1.1 MB。iPhone 的网页不能调音量，所以音量直接做在文件里。署名写在「如何读图」的最后一段。

桌面版用 [Tauri 2](https://v2.tauri.app/) 把同一个 `dist/index.html` 装进 WebView2 窗口。构建桌面版需要 Rust（用 rustup 安装）和 Visual Studio 的 C++ 生成工具；Windows 11 已自带 WebView2。

```powershell
npm run tauri dev      # 开发服务器加桌面窗口
npm run tauri build    # 免安装 exe 在 src-tauri/target/release/，安装包在 src-tauri/target/release/bundle/nsis/
```

Python 工具由 [uv](https://docs.astral.sh/uv/) 管理：`uv sync` 按 `pyproject.toml` 和 `uv.lock` 准备 `.venv/`，`uv run` 在其中运行命令。增加依赖用 `uv add`，不要另建 requirements.txt。生成烟花头像和压缩人物模型的脚本要用 OpenCV，它在单独的依赖组 `shapes` 里，平时的 `uv run` 不安装，用法见「烟花头像」和「人物模型」。Windows 上运行 Python 脚本时加 `-X utf8`。大航海数据的采集程序在 `voyage/`，用法见[数据](DATA.md#采集)。

## 代码结构

源码在 `src/`，用 TypeScript 写，Vite 构建。three.js 是 0.186（npm 的 `three`），后期处理和 GLTFLoader 从 `three/addons/` 导入。

画面是在 three.js r128 上调好的，升级后保留了两处 r128 的做法，让画面不变：

- 颜色管线：`renderer.ts` 关闭 `ColorManagement`，输出线性颜色。代码里写的颜色值原样使用，十六进制颜色不做 sRGB 转换，输出时也不编码。
- Bloom：`bloom.ts` 是移植的 r128 `UnrealBloomPass`。three.js 自带的新版改用 16 位浮点 mip、Rec.709 亮度、新的模糊核和不乘 alpha 的混合，辉光的强度和范围都会变。2026-10-21 用截图试过：画面中部平均亮 4% 到 32%，旗舰船帆和舰队的光晕更大。r128 的最后一步是把光晕加法画回场景缓冲；这里改在 `grade.frag.glsl` 里读光晕纹理再相加，公式相同，少解析一次多重采样缓冲。

`src/main.ts` 是入口。每个模块在被导入时创建自己那部分场景，所以导入顺序就是创建顺序。three.js 给绘制排序时，并列的物体按创建顺序先后，因此新模块要按画面层次插在合适的位置，不要随意调换顺序。

| 文件 | 职责 |
|---|---|
| `main.ts` | 入口：按顺序导入各模块；播放、输入、窗口尺寸、自动降画质、每帧更新、控制台调试函数 |
| `data.ts` | 导入 `data/voyage.json`，转成数据格式 `VoyageData`，再算出每天有名字的船数、每天各档老船长的人数、篝火的亮度（最近开播的频率）等；格式见[数据](DATA.md) |
| `renderer.ts` | 渲染器、场景、相机、HDR 判断；没有 WebGL 时显示提示并停止；减少动态的状态（默认完整，不读系统设置；页面的「动态」按钮可以切换，`onMotion` 通知只设置一次的地方） |
| `uniforms.ts` | 共享 uniform `U`、画风开关、每个视角的固定光向量 `TOON_KEYS`、海浪高度 `swellJS` |
| `geometry.ts` | 低多边形建模工具 `Builder`（每个顶点可以带上缩小后的位置 `aFar`）、描线用的平滑法线 |
| `ships.ts` | 船队的五种船，页面载入时按程序生成：舰长（挂一面纸帆的小弁才船）、提督（船尾多一层屋形）、总督（两层屋形加唐破风、一对幟）、旗舰（管絃祭的御座船：三艘船并成一个甲板，挂灯的屋形，四盏高张提灯，左舷船头的篝火）、无名之舰（蓝帆小船）；舰长和无名之舰另有远模型；船灯、桅顶和纹章的位置 |
| `sky.ts` | 银河（预渲染成全景贴图）、天空、星星＝粉丝 |
| `ocean.ts` | 海面与镜像反射（半分辨率反射贴图，带 mipmap；看不清的小波变成粗糙度，把倒影竖向拉长；二次元下倒影只留灯光、按浪断成横条，海面分三块平涂，画横向短笔触和倒影里的闪光） |
| `water.ts` | 海面的小波：每帧把 32 个 Gerstner 波画进一张 128² 的可平铺纹理（坡度、高度、坡度平方），海面按两个尺度取样；没有半浮点渲染目标时，海面退回原来的五道正弦 |
| `fleet.ts` | 约 8000 个实例的数据；每种船一个实例化网格，舰长和无名之舰在远处画远模型，每帧把屏幕上够大的船挑进短表改画详细模型（`cullShips`）；船的材质（写实／二次元两个分支，远模型用省掉细节的 `FAR` 版本）、描线（同样每帧只给屏幕上够大的船画）、尾迹、船灯 |
| `veterans.ts` | 老船长：按播放到那天的陪伴天数分档，桅顶的渔火光柱（`shaders/vet_pillar.*.glsl`）；画出来的档位按时钟缓动，换档时光柱在约一秒内长高（只画约 134 条会到档的船） |
| `glow.ts` | 篝火火星的发光点；烟花共用它的片元着色器 |
| `torii.ts` | 每月一座的海中鸟居、描线、自发光月份匾（文字画在 canvas 图集上）；按当月人数分档的火羽和素木，冬季的积雪与冰柱，年份鸟居的注连绳 |
| `inscriptions.ts` | 鸟居上的名字：陪伴一年以上的人每满一年，「奉納」和名字竖写在那个月鸟居柱朝回望的一面（文字画在 canvas 图集上），按屏幕像素淡出 |
| `rise.ts` | 鸟居出水：记下每根横梁离水的时刻（按时钟计秒，观众移动时间轴时清空）；出水后约 12 秒内，每帧在船头前方画一张 160² 的纹理（深水色散的环形波、破水前的水穹、泡沫），海面读它；横梁泻下的水很快撕开、碎成小水珠，只留几股细水；水花和水珠；14 个滴点越滴越慢，每滴先挂在梁下，再落进海里留下小环；鸟居刚出水时变湿（湿的样子、按高度变干和柱面细流在 `shaders/torii.frag.glsl`）；另记门停止升起后的秒数，变干和装饰的抖动用它。只在这段时间里，海面和鸟居的着色器才编进这部分代码 |
| `seasons.ts` | 鸟居的四季装扮：樱花、提灯、银杏红叶和水面的花筏落叶（画在 canvas 图集上的卡片），冬天梁上飘下的雪粉；装扮随风轻摆、出水时抖动（`shaders/deco.vert.glsl`）；镜头周围按当天季节的天气 |
| `flagship.ts` | 她屋形破风上的纹章；她和 Kobuta 在船头的站位和身高（`BOW`） |
| `figures.ts` | 船头的火羽和 Kobuta：载入压缩过的人物模型（`src/figures/`），按日期换她的三期形象，播放经过换装时新衣装从脚到头扫过；挥手，转头看前方的鸟居和烟花；二次元和写实两种着色与描线在 `shaders/figure.*.glsl` |
| `formation.ts` | 羽毛队形：羽轴放提督／总督和鸟居（总督一列走正中最前，提督在两侧，同等级按入队时间），羽枝按入队时间排位；启动时算好每天每条船的泊位，每帧让船沿羽枝或羽轴来去 |
| `names.ts` | 舰长的名字：点选和悬停（区分点击和拖动）、名牌、选中后的水面圆环、「寻舟」按名字或 UID 找船；选中后让镜头跟住那条船（`camera.ts` 的 `camFocus`）。`data/voyage.json` 没有名字时不显示名字 |
| `uid.ts` | 把观众输入的 UID 用 WebCrypto 算成和采集程序相同的 id |
| `camera.ts` | 回望、俯瞰、远望三个机位，选中一条船时移过去，烟花时抬镜头，并按抬起后的取景选烟花的位置和大小（`fwSpot`：读数板或屏幕上缘和地平线之间的天空）；宽屏回望让鸟居破水的地方留在底部控制条之上（`clearDock`） |
| `fx.ts` | 篝火与烟花：球形和火羽 1–3、kobuta 的头像五种轮流；烟花的运动在 `shaders/firework.vert.glsl` 里，CPU 只在发射时写一次顶点属性 |
| `fwShapes.ts` | 烟花头像的星位，由开发仓库里的脚本从图片生成，不要手改（见「烟花头像」） |
| `post.ts` | 后期链：Bloom、ACES、暗角、颗粒、二次元调色（启动时烘焙成 3D LUT）；反射渲染 |
| `bloom.ts` | 移植的 r128 Bloom，着色器是 `shaders/bloom_*.glsl` |
| `hud.ts` | 左上角当天船上的人（大航海、陪伴至今、后来离开、老船长）、右上角的日期和星与篝火、底部时间轴；人数越过 100、1000……时二次元画风的 cut-in 横幅 |
| `style.css` | 页面样式，包括二次元画风的平面叠层（`.toon`）和 cut-in；构建时原样内联，不压缩 |
| `shaders/` | 各材质的顶点与片元着色器 `*.vert.glsl`、`*.frag.glsl`，公共片段在 `shaders/chunks/` |

`src-tauri/` 是桌面版外壳：`tauri.conf.json` 定窗口和打包方式，`src/main.rs` 只打开窗口，不加原生功能。图标由 `app-icon.svg` 生成：运行 `npx tauri icon src-tauri/app-icon.svg`，再删掉移动端和 Windows 商店用的图标，只留 `icons/` 下原有的六个文件。图案是立在海里的鸟居、它的倒影和月亮（2026-10-24 起，原来和 HANE 一样只有一座鸟居）。网页的图标是同一张图，直接写在 `index.html` 的 `<link rel="icon">` 里（`#` 写成 `%23`），因为单独的图标文件会被 Vite 拆出单文件页面；改图标时两处一起改。

着色器之间用 `#include <voyage/名字>` 共用片段（`swell`、`fog`、`sky`、`torii`、`torii_place`、`torii_shape`、`hatch`、`rise_age`）。这些片段登记在 `shaders/index.ts`，three.js 编译着色器时替换进去。

有六组数值或公式同时写在 TypeScript 和 GLSL 里，改动时两边一起改：

- 海浪：`uniforms.ts` 的 `K` 与 `shaders/chunks/swell.glsl`
- 鸟居宽度 `TORII_W`：`torii.ts` 与 `shaders/chunks/torii_place.glsl`、`shaders/deco.vert.glsl`
- 匾额图集的格子 `ACOLS / AROWS`：`torii.ts` 与 `shaders/plaque.vert.glsl`
- 二次元环境的褪色：`uniforms.ts` 的 `FOG_TOON`（雾色）与 `shaders/chunks/sky.glsl` 的 `envGrade`（天空、银河、海面）用同一个公式
- 笠木的弧度 `kasaY` 与笠木顶高 0.943：`torii.ts` 与 `shaders/chunks/torii_shape.glsl`、`shaders/deco.vert.glsl`（素木鸟居把笠木和上面的装饰拉直）、`shaders/feather.vert.glsl`（火羽的根部）、`shaders/riseFx.*.glsl` 的 `edgeY`（水从哪里泻下、滴下）
- 鸟居沉在水下的深度 1.10 与三根横梁的高度 0.92 / 0.665 / 0.43：`shaders/chunks/torii_place.glsl`、`rise.ts` 的 `BEAM_AT` 与 `shaders/chunks/rise_age.glsl` 的 `outAge`；1.10 还在 `riseFx.vert.glsl`、`deco.vert.glsl`、`feather.vert.glsl`

## 常调参数

| 参数 | 位置 | 作用 |
|---|---|---|
| `toonGrade()` | `post.ts` | 二次元调色：饱和度、冷暗部暖亮部的分色、暗部的靛蓝提亮；启动时烘焙成 3D LUT |
| `uEnv` / `uCastSat` | `uniforms.ts` | 二次元下环境（天空、银河、海面、雾）留下的饱和度和色调；船和鸟居额外加的饱和度 |
| `hatchLines()` 的 7 px 与 0.6–1.5 px | `shaders/chunks/hatch.glsl` | 二次元暗部排线的最小间距（最大是它的两倍）和线宽；船和鸟居各自的深浅是 `ship.frag.glsl` 的 0.46 与 `torii.frag.glsl` 的 0.42 |
| `uRimC` | `uniforms.ts` | 二次元边缘光的颜色（月光色，亮度要留在 Bloom 阈值 0.60 以下）；出现的宽窄是 `ship.frag.glsl`、`torii.frag.glsl` 里的 0.32 |
| `TOON_KEYS` | `uniforms.ts` | 三个视角各自的固定主光方向；二次元明暗只由它和面朝向决定 |
| `RMS` / `NW` | `water.ts` | 海面小波的总坡度（0.05，平静的夜海）和波数；坡度越大，倒影越碎、拉得越长 |
| 倒影的 `0.12` 与 `0.25` | `shaders/ocean.frag.glsl` | 倒影跟着小波倾斜的程度，以及看不清的小波把倒影竖向拉长的程度 |
| `toriiToon()` 中的 `litC / shdC / top / bot` | `shaders/chunks/torii.glsl` | 鸟居受光面、暗面、顶面、底面四个色调 |
| `uLineW` | `uniforms.ts` | 描线像素宽度；鸟居描线在 `shaders/torii_lines.vert.glsl` 里按屏幕尺寸开关 |
| `uTierK / uTierT / uTierS` | `uniforms.ts` | 舰长／提督／总督的纹章颜色（占位色，待确认） |
| `TORII_W / TORII_H / TORII_HY` | `torii.ts` | 鸟居宽高；一月的年份鸟居更高 |
| `TDECO` 的分档线 `0.85 / 0.35` | `torii.ts` | 当月平均人数排在前 15% 的鸟居插火羽，后 35% 是素木 |
| `snowToon()` | `shaders/chunks/torii.glsl` | 积雪的月光色；顶面亮度要留在 Bloom 阈值 0.60 以下 |
| `K` 与各横梁的振幅 `0.12 / 0.08 / 0.035` | `shaders/ripples.frag.glsl` | 出水环形波的主波长（约 2.5 单位）和高度；二次元每高 0.03 画一条等高线 |
| `POURS` / `V0` / `FALL_G` | `rise.ts` | 每根梁每侧的水股汇集点（世界单位的 x，正中 ±2 留空）、水离开梁边的初速、泻下和滴落的水下落的加速度（18，比 9.8 快，水才不显得黏）；水股多宽、流多久、远处的水何时停也在这里抽取；水帘何时撕开、细丝的疏密和粗细、何时碎成水珠在 `shaders/riseFx.frag.glsl` 的 `stream()` |
| 水花、水珠的数量与高度 | `rise.ts` | 破水处的水柱高度、喷溅的数量和速度；它们怎样落下在 `shaders/riseFx.vert.glsl` |
| 干的快慢、湿的颜色、细流 | `shaders/torii.frag.glsl` | 光泽和暗色在各高度出水后何时退去（顶部 0.5–2.5 秒和 1.5–4.5 秒，越往下越晚）；朱漆和素木湿了暗多少（×0.86 / ×0.62）、光泽多少；主柱每面三条细流的速度、走走停停的幅度、湿痕变淡的 3 秒 |
| `DRIPS` / `DROPS`，水滴半径 `0.05 / 0.06` | `rise.ts`、`shaders/riseFx.vert.glsl` | 每座门的 14 个滴点（哪根梁，世界单位的 x、z，正中 ±2 留空）和每个滴点轮流用的下落水滴数；每点滴几滴、时间尺度 s0、何时开始在 `rise.ts` 里抽取；写实和二次元的水滴半径 |
| 水的颜色与像素下限 | `shaders/riseFx.frag.glsl` | 二次元水体、白边、暗边、墨线的颜色（亮度 0.50 / 0.58 / 0.32）和画成白点、描墨线的宽度门槛；写实水体和亮边的颜色与不透明度；线和点在屏幕上的最小宽度（写实 1 像素、二次元 1.5 像素）；所有水的亮度上限 0.58（Bloom 阈值 0.60） |
| 装饰的摆动与抖动 | `shaders/deco.vert.glsl` | 平时随风轻摆的幅度（转 0.07 弧度、平移半宽的 5%，风强在 0.3 到 1 之间）和周期；出水时抖动的幅度和衰减（0.45 秒）、门停下时的第二次抖动；冬天雪粉多久飘一次（4–9 秒）、每阵多久（1.6 秒）；雪粉卡片的位置在 `seasons.ts` 的 `cards`（mode 3） |
| `cards` | `seasons.ts` | 每季装饰卡片的位置（鸟居单位：x、z 乘 9.5，y 乘门高）、大小（世界单位）、图集格子和朝向 |
| `BOX`、每季的大小与颜色 | `shaders/weather.vert.glsl` | 镜头周围天气的空间、飘落速度和夜间颜色 |
| `KT` / `FS` / `SCALE_BY_LEVEL` | `uniforms.ts` | 每天航行距离、旗舰大小、各等级船的大小 |
| 各部件的尺寸和颜色 | `ships.ts` | 五种船的船身（`HullO`：船宽、深、艉艏翘起）、帆、屋形、提灯和篝火的位置大小；颜色表在文件开头，受光面要留在 Bloom 阈值 0.60 以下；纸窗（`SHOJI`）最亮约 0.55 在 `ship.frag.glsl` |
| `uLod` / `LOD_PX` | `uniforms.ts` / `fleet.ts` | 舰长和无名之舰从远模型长成详细模型的范围（船在屏幕上 24 到 40 像素长）；每帧把船挑进详细模型短表的门槛（20 像素，按离镜头最近的可能位置算），要低于 `uLod` 的下限 |
| `LIT_IN` | `formation.ts` | 驶入的船船灯先压到多低（0.25），驶过一半后点亮 |
| `BOW` | `flagship.ts` | 她和 Kobuta 站在船头的位置（船长单位的 x、甲板高度 y、z）和身高（船长的 0.32 和 0.19）；每帧生效，可以在控制台改着看；旗舰的甲板改了以后改这里 |
| `KEY`，受光面 0.58、暗面 0.50，上限 0.58 | `figures.ts`、`shaders/figure.frag.glsl` | 人物二次元的固定光向量（在人物自己的坐标里，随船转）；受光面和暗面各乘底色多少；亮度最后缓压到 0.58，会动的光全部加满也越不过 Bloom 阈值 0.60 |
| `CHANGE`，转头的范围 | `figures.ts` | 换装从脚扫到头的秒数（0.9）；转头最多左右 1.2、向上 0.6、向下 0.35 弧度，胸、颈、头各分 0.2、0.35、0.45 |
| `VET_T` | `data.ts` | 老船长的门槛：陪伴满 30、180、365 天（按播放到的那天） |
| `LAMP_DAYS` | `data.ts` | 篝火的亮度按「几天前」指数加权的时间常数（10 天）；读数的旺、燃、微、熄按 0.85、0.5、0.2 分在 `hud.ts` |
| `FW_T` / `FW_DAY` / `fwShells` | `fx.ts` | 放烟花的人数门槛、一天最多几发（8），以及大事里人数增加的日子放几发（1 + 1.5·log2 剧烈程度） |
| `FW_N` / `FW_QMAX` / `FW_GAP` | `fx.ts` | 同时在空中最多几发（8）、最多排队几发（12）、相邻两发隔几秒（0.6） |
| `SHAPE_*`、`FW_PLACES` | `fx.ts`、`camera.ts` | 头像的大小、亮度、衰减和下落；头像的三个位置和大小 |
| 光柱的高度 1.4 / 2.6 / 4.0，之后每年 +0.9 | `shaders/vet_pillar.vert.glsl` | 满月、半年、一年的光柱高度（世界单位，舰长的船长为 1），一年以上每多一年再加高；宽 0.20，屏幕上至少 2 像素；颜色、各档亮度和光环在 `vet_pillar.frag.glsl` |
| 档位缓动 0.4 秒 | `veterans.ts` | 换档时光柱长高、变亮的时间常数 |
| `BASE` | `main.ts` | 1× 时每秒播放几天（16） |
| `SLOW_Z` / `SLOW_IN` / `SLOW_OUT` | `main.ts` | 逢潮缓行：剧烈程度（\|当天变化\| / √较大的总数）超过多少算大事（1）、之前和之后渐入渐出的天数（8、12）；峰值倍数 1 + 8 × (程度 − 1)^0.7 写在 `EVENTS` 旁边 |
| 船的放慢 `1/3` | `main.ts` | 慢放时船进出的速度乘放慢倍数的 −1/4 次方，最低三分之一 |
| `DIN` / `DOUT` / `HOLD` / `COOL` | `formation.ts` | 来船从泊位外多少个泊位处出现、离开的船驶出多少个泊位后消失、刚到的灯至少停几秒、灯离开后那条羽枝多少天内不再进新灯 |

## 烟花头像

烟花的四个头像（火羽 1、2、3 号和 kobuta）是 `src/fwShapes.ts` 里的星位，由开发仓库里的脚本从四张头像图（`1.png`、`2.png`、`3.png`、`kobuta.png`）生成。头像图不进公开仓库，只有生成的星位进来，不要手改。脚本只取每张图头部框里的几类线：剪影的轮廓、脸的轮廓、五官和发饰，沿线等距取星，每个头像正好 1040 颗。换图或改参数后，在页面里用 `fleetFirework("1")` 这类命令放出来，在三个视角和手机上看。

## 人物模型

船头的火羽三期和 Kobuta 是外部制作的 3D 模型，原始文件不进公开仓库。页面用的是开发仓库里的脚本压出来的副本 `src/figures/*.glb`，构建时以 base64 内嵌进 `dist/index.html`，所以人物模型随页面公开。脚本对每个模型做这几件事：

- 只留底色贴图和它用的那套 UV。法线贴图（强度 0.05–0.35）、ORM（AO 全白，粗糙度近似常数）和切线去掉，页面的着色器不用它们。
- 底色贴图按 UV 覆盖的区域向外扩 2 像素，其余像素从岛的边缘向外填满（push-pull）。烘焙图集的底是黑的，不填的话 mipmap 会把黑底混进小岛，远看出现黑边。然后缩到 1024²（Kobuta 512²），存成 WebP。
- 网格和动画交给 gltfpack（npm 的开发依赖，WASM 版不能压贴图）：火羽减到四分之一的三角面（3 万面变成约 1.2 万面，顶点从约 2.5 万减到约 1.2 万），Kobuta 减到一半；然后顶点量化，meshopt 压缩，动画按 30 Hz 重采样，去掉不动的轨道。页面用 three.js 自带的 `MeshoptDecoder` 解码。人物在船头只有几十像素高，核显的瓶颈又在顶点，所以减面；在极近处比较，只有发梢和裙边的轮廓略简化。

2026-10-24 的结果：三期火羽各 323–402 KB，Kobuta 82 KB，合计 1.17 MB；页面从 1.24 MB 变成 2.93 MB。

页面先解码今天那一期和 Kobuta，另外两期在空闲时解码。解码时间见下面的「人物检查」。

## 调试

浏览器控制台：

```js
fleetSeek("2022-10-16")    // 跳到某天
fleetView(0)               // 0 回望 / 1 俯瞰 / 2 远望
fleetStyle("toon")         // "toon" 二次元 / "real" 写实
fleetOrbit(0.12, 0, 0.22)  // 方位角、仰角、缩放
fleetFirework()            // 放一发烟花，按轮换选样子
fleetFirework("kobuta")    // 放指定的一种："round"、"1"、"2"、"3"、"kobuta"
fleetCinema(true)          // 电影模式
fleetLineup(24)            // 五种船排成一排停在她船头前方的空海上看，参数是镜头距离；fleetLineup(0) 放回船队
fleetLineup(2.5, 0, 3)     // 只看一种（0 旗舰 / 1 总督 / 2 提督 / 3 舰长 / 4 无名之舰），距离按船长算；第二个参数绕着转
fleetLineup(1, 0, -1, 10)  // 整排，镜头退到舰长在屏幕上约 10 像素高
fleetPick(0)               // 选中名单里按上船先后的第 k 条船，镜头移过去；fleetPick() 放开
```

`data/voyage.json` 里还没有名字时，在开发服务器的地址后加 `?sample-names`（例如 `http://127.0.0.1:8770/?sample-names`），页面会编一些示意名字，名牌上标「示意」，用来看名牌、寻舟和鸟居上的名字。构建好的页面没有这个开关。

截图测试用的开关需在页面脚本运行前设置：`window.__fixedQuality = true` 关闭自动降画质，`window.__dtMax` 限制每帧最大时间步长，`window.__samples` 指定多重采样数（0 关闭）。页面把船的实例数据和 `updateFleet` 放在 `window.__fleet` 上，给下面的船位检查用。

## 检查

- 提交前 `npm run build` 通过，它会先做类型检查。
- 改了 `voyage/` 的采集程序或 `src/uid.ts` 后运行 `uv run python -X utf8 dev/test_voyage.py`。它只用很小的假数据，不联网；其中一项用 Node 运行 `src/uid.ts`，检查页面和采集程序算出的 UID 哈希相同。
- 改页面、画面、着色器、名牌或船头的人物时，还要跑开发仓库里的截图对比、闪烁、性能、名字和人物检查。
