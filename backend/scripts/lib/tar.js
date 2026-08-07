'use strict';

/**
 * 极简 ustar 打包/解包实现。
 *
 * 为什么自己写：备份是"丢数据即死"的功能，不能依赖 npm 第三方包的版本漂移，
 * 也不能依赖宿主机是否装了 GNU tar（Windows 上是 bsdtar，Alpine 上是 busybox tar，行为有差异）。
 * 只用 Node 内置的 zlib / fs / stream，任何装了 Node 的机器都能跑。
 *
 * 支持：普通文件、目录条目、长路径（ustar prefix/name 拆分，上限 255 字节）。
 * 不支持：符号链接、硬链接、稀疏文件、pax 扩展头（备份场景用不到）。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const BLOCK = 512;

// ---------------------------------------------------------------- 头部编码

function octalField(value, len) {
  // ustar 数值字段：右对齐补零的八进制 + 结尾 NUL
  return Buffer.from(value.toString(8).padStart(len - 1, '0') + '\0', 'ascii');
}

function splitName(name) {
  const buf = Buffer.from(name, 'utf8');
  if (buf.length <= 100) return { name, prefix: '' };
  // 超过 100 字节时从路径分隔符处切开，前半段放 prefix(<=155)，后半段放 name(<=100)
  for (let i = buf.length - 101; i >= 0; i--) {
    if (buf[i] !== 0x2f) continue;
    const prefix = buf.subarray(0, i).toString('utf8');
    const rest = buf.subarray(i + 1).toString('utf8');
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) return { name: rest, prefix };
  }
  return null;
}

function buildHeader(entry) {
  const parts = splitName(entry.name);
  if (!parts) throw new Error(`路径超出 tar 格式上限(255 字节)，无法归档: ${entry.name}`);

  const h = Buffer.alloc(BLOCK);
  h.write(parts.name, 0, 100, 'utf8');
  octalField(entry.mode & 0o7777, 8).copy(h, 100);
  octalField(0, 8).copy(h, 108); // uid：统一置 0，避免跨机恢复时 uid 对不上
  octalField(0, 8).copy(h, 116); // gid
  octalField(entry.size, 12).copy(h, 124);
  octalField(Math.floor(entry.mtime / 1000), 12).copy(h, 136);
  h.write('        ', 148, 8, 'ascii'); // 校验和字段先填 8 个空格
  h.write(entry.type === 'directory' ? '5' : '0', 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'latin1');
  h.write('00', 263, 2, 'ascii');
  h.write('root', 265, 32, 'ascii');
  h.write('root', 297, 32, 'ascii');
  if (parts.prefix) h.write(parts.prefix, 345, 155, 'utf8');

  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

// ---------------------------------------------------------------- 头部解码

function readStr(buf, off, len) {
  const s = buf.subarray(off, off + len);
  const end = s.indexOf(0);
  return (end === -1 ? s : s.subarray(0, end)).toString('utf8');
}

function readOctal(buf, off, len) {
  const s = readStr(buf, off, len).trim();
  return s ? parseInt(s, 8) || 0 : 0;
}

function parseHeader(h) {
  const expected = readOctal(h, 148, 8);
  let calc = 0;
  for (let i = 0; i < BLOCK; i++) calc += i >= 148 && i < 156 ? 0x20 : h[i];
  if (calc !== expected) throw new Error('tar 头部校验和不匹配，备份文件可能已损坏');

  const name = readStr(h, 0, 100);
  const prefix = readStr(h, 345, 155);
  return {
    name: prefix ? `${prefix}/${name}` : name,
    mode: readOctal(h, 100, 8) || 0o644,
    size: readOctal(h, 124, 12),
    mtime: readOctal(h, 136, 12) * 1000,
    type: readStr(h, 156, 1) === '5' ? 'directory' : 'file',
  };
}

function isZeroBlock(b) {
  for (let i = 0; i < b.length; i++) if (b[i] !== 0) return false;
  return true;
}

// ---------------------------------------------------------------- 打包

/**
 * 把条目列表打包为 .tar.gz。
 * entry: { name, type: 'file'|'directory', size, mode, mtime, source?, content? }
 *   source  磁盘文件绝对路径（流式读取，适合大文件）
 *   content Buffer（适合清单等内存内容）
 */
async function packToGzip(entries, outFile, options = {}) {
  const level = options.level == null ? 9 : options.level;

  async function* blocks() {
    for (const e of entries) {
      yield buildHeader(e);
      if (e.type === 'directory' || e.size === 0) continue;

      let written = 0;
      if (e.content) {
        yield e.content;
        written = e.content.length;
      } else {
        for await (const chunk of fs.createReadStream(e.source)) {
          if (written + chunk.length >= e.size) {
            // 打包期间文件被追加写长了：截断到声明长度，保证归档结构合法
            yield chunk.subarray(0, e.size - written);
            written = e.size;
            break;
          }
          yield chunk;
          written += chunk.length;
        }
      }
      // 打包期间文件被截短：补零到声明长度，同样是为了不让归档结构错位
      if (written < e.size) yield Buffer.alloc(e.size - written);

      const rem = e.size % BLOCK;
      if (rem) yield Buffer.alloc(BLOCK - rem);
    }
    yield Buffer.alloc(BLOCK * 2); // 两个空块表示归档结束
  }

  await pipeline(Readable.from(blocks()), zlib.createGzip({ level }), fs.createWriteStream(outFile));
}

// ---------------------------------------------------------------- 解包

function safeJoin(root, name) {
  const base = path.resolve(root);
  const target = path.resolve(base, name);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`备份包含越界路径，已中止解包: ${name}`);
  }
  return target;
}

/** 解包 .tar.gz 到目标目录，返回条目清单 */
async function extractGzip(archiveFile, destDir) {
  const result = [];
  let pending = Buffer.alloc(0);
  let cur = null;
  let remain = 0;
  let pad = 0;
  let fd = null;
  let ended = false;

  fs.mkdirSync(destDir, { recursive: true });
  const src = fs.createReadStream(archiveFile).pipe(zlib.createGunzip());

  try {
    for await (const chunk of src) {
      if (ended) continue;
      pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);

      for (;;) {
        if (cur) {
          if (remain > 0) {
            if (pending.length === 0) break;
            const n = Math.min(remain, pending.length);
            fs.writeSync(fd, pending, 0, n);
            pending = pending.subarray(n);
            remain -= n;
            continue;
          }
          if (pad > 0) {
            if (pending.length === 0) break;
            const n = Math.min(pad, pending.length);
            pending = pending.subarray(n);
            pad -= n;
            continue;
          }
          fs.closeSync(fd);
          fd = null;
          cur = null;
          continue;
        }

        if (pending.length < BLOCK) break;
        const head = pending.subarray(0, BLOCK);
        pending = pending.subarray(BLOCK);
        if (isZeroBlock(head)) {
          ended = true;
          break;
        }

        const e = parseHeader(head);
        const target = safeJoin(destDir, e.name);
        result.push(e);

        if (e.type === 'directory') {
          fs.mkdirSync(target, { recursive: true });
          continue;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fd = fs.openSync(target, 'w');
        cur = e;
        remain = e.size;
        pad = e.size % BLOCK ? BLOCK - (e.size % BLOCK) : 0;
      }
    }
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }

  if (cur || remain > 0) throw new Error('备份文件在条目中途结束，归档不完整');
  return result;
}

/** 只读清单，不落盘：用于恢复前的预检 */
async function listGzip(archiveFile) {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'freight-tar-peek-'));
  try {
    return await extractGzip(archiveFile, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { packToGzip, extractGzip, listGzip, BLOCK };
