# novel-scraper

quanben.io 小说下载工具，Node.js CLI。

## 用法

```bash
npm install
node index.js <路径> <章节数> <输出文件名>
```

示例：

```bash
node index.js <slug> <章节数> <输出文件名>

# 示例：
node index.js example 1000 书名.txt
```

## 技术栈

Node.js + axios + cheerio，支持并发下载、指数退避重试、命令行参数化。
