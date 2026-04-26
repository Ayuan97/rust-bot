#!/usr/bin/env node
// 结构化 diff：对比 extracted.json (从 Rust 服务器 dll 抽出) 和本地 lib/rustplus/rustplus.proto
// 输出"游戏更新了什么"报告：新增 message、新增字段、新增枚举值、类型变更

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTRACTED = path.join(ROOT, 'tools/extracted.json');
const LOCAL_PROTO = path.join(ROOT, 'backend/lib/rustplus/rustplus.proto');

// ---------- 解析本地 .proto ----------
function parseProto(text) {
    // 极简 proto2 解析器：只抓 message / enum 名、字段名+tag+type、enum 值
    const messages = {};
    const enums = {};
    const lines = text.split('\n');
    let cur = null; // { kind:'message'|'enum', name, fields|values }
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('//')) continue;

        const mMatch = line.match(/^message\s+(\w+)\s*{?$/);
        const eMatch = line.match(/^enum\s+(\w+)\s*{?$/);
        if (mMatch) { cur = { kind: 'message', name: mMatch[1], fields: {} }; messages[mMatch[1]] = cur; continue; }
        if (eMatch) { cur = { kind: 'enum', name: eMatch[1], values: {} }; enums[eMatch[1]] = cur; continue; }
        if (line === '}') { cur = null; continue; }
        if (!cur) continue;

        if (cur.kind === 'message') {
            // optional/required/repeated TYPE NAME = N;
            const f = line.match(/^(?:(optional|required|repeated)\s+)?([\w\.]+)\s+(\w+)\s*=\s*(\d+)\s*;/);
            if (f) {
                cur.fields[f[3]] = { modifier: f[1] || 'optional', type: f[2], tag: parseInt(f[4], 10) };
            }
        } else if (cur.kind === 'enum') {
            const v = line.match(/^(\w+)\s*=\s*(-?\d+)\s*;/);
            if (v) cur.values[v[1]] = parseInt(v[2], 10);
        }
    }
    return { messages, enums };
}

// ---------- 加载服务器端结构 ----------
const server = JSON.parse(fs.readFileSync(EXTRACTED, 'utf8').replace(/^﻿/, ''));

// 把 server JSON 改写成跟 local 同样的结构
function normalizeServer(server) {
    const messages = {};
    const enums = {};
    for (const e of server.enums) {
        const values = {};
        for (const v of e.Values) values[v.Name] = v.Value;
        enums[e.Name] = { name: e.Name, values };
    }
    for (const m of server.messages) {
        const fields = {};
        for (const f of m.Fields) {
            // 注意：解析器里同 tag 重复时只保留第一次（已在 PowerShell 端去重）
            fields[f.Field] = { modifier: 'optional', type: f.ProtoType, tag: f.Tag, wireType: f.WireType, netType: f.NetType };
        }
        messages[m.Name] = { name: m.Name, fields };
    }
    return { messages, enums };
}

const local = parseProto(fs.readFileSync(LOCAL_PROTO, 'utf8'));
const remote = normalizeServer(server);

// ---------- 计算差异 ----------
const report = { addedMessages: [], removedMessages: [], addedEnums: [], removedEnums: [], messageDeltas: [], enumDeltas: [] };

// 新/删 message
for (const name of Object.keys(remote.messages)) {
    if (!(name in local.messages)) report.addedMessages.push({ name, fields: remote.messages[name].fields });
}
for (const name of Object.keys(local.messages)) {
    if (!(name in remote.messages)) report.removedMessages.push(name);
}

// 新/删 enum
for (const name of Object.keys(remote.enums)) {
    if (!(name in local.enums)) report.addedEnums.push({ name, values: remote.enums[name].values });
}
for (const name of Object.keys(local.enums)) {
    if (!(name in remote.enums)) report.removedEnums.push(name);
}

// 现有 message 字段 delta
for (const name of Object.keys(local.messages)) {
    if (!(name in remote.messages)) continue;
    const l = local.messages[name].fields;
    const r = remote.messages[name].fields;
    const added = [], removed = [], changed = [];
    for (const fname of Object.keys(r)) {
        if (!(fname in l)) {
            added.push({ name: fname, ...r[fname] });
        } else {
            // tag/type 变更（忽略 NetworkableId/uint32 这种已知 wrapper 等价）
            const lt = l[fname], rt = r[fname];
            const known_equiv = (
                (lt.type === 'uint32' && rt.type === 'NetworkableId') ||
                (lt.type === 'NetworkableId' && rt.type === 'uint32')
            );
            if (lt.tag !== rt.tag) changed.push({ name: fname, kind: 'tag', from: lt.tag, to: rt.tag });
            if (!known_equiv && lt.type !== rt.type) changed.push({ name: fname, kind: 'type', from: lt.type, to: rt.type });
        }
    }
    for (const fname of Object.keys(l)) if (!(fname in r)) removed.push({ name: fname, ...l[fname] });
    if (added.length || removed.length || changed.length) report.messageDeltas.push({ name, added, removed, changed });
}

// 现有 enum 值 delta
for (const name of Object.keys(local.enums)) {
    if (!(name in remote.enums)) continue;
    const l = local.enums[name].values;
    const r = remote.enums[name].values;
    const added = [], removed = [], changed = [];
    for (const k of Object.keys(r)) {
        if (!(k in l)) added.push({ name: k, value: r[k] });
        else if (l[k] !== r[k]) changed.push({ name: k, from: l[k], to: r[k] });
    }
    for (const k of Object.keys(l)) if (!(k in r)) removed.push({ name: k, value: l[k] });
    if (added.length || removed.length || changed.length) report.enumDeltas.push({ name, added, removed, changed });
}

// ---------- 渲染 Markdown 报告 ----------
const lines = [];
lines.push('# Rust+ 协议差异报告');
lines.push('');
lines.push(`- 本地基线: \`${path.relative(ROOT, LOCAL_PROTO)}\` (${Object.keys(local.messages).length} message, ${Object.keys(local.enums).length} enum)`);
lines.push(`- 服务器端实测: ${Object.keys(remote.messages).length} message, ${Object.keys(remote.enums).length} enum (Rust.Data.dll, 仅 ProtoBuf 命名空间)`);
lines.push('');

const onlyAppPrefix = (arr, key='name') => arr.filter(x => (x[key] ?? x).startsWith('App') || (x[key] ?? x).startsWith('Clan'));

lines.push('## 新增 message（游戏端有 / 本地基线无）');
const newApp = onlyAppPrefix(report.addedMessages);
if (newApp.length === 0) lines.push('_无_'); else {
    for (const m of newApp) {
        lines.push(`### \`${m.name}\``);
        for (const fname of Object.keys(m.fields).sort((a,b) => m.fields[a].tag - m.fields[b].tag)) {
            const f = m.fields[fname];
            lines.push(`- \`${fname}\`: ${f.type} = ${f.tag}`);
        }
        lines.push('');
    }
}
lines.push('');

lines.push('## 现有 message 中新增字段');
const messageDeltasApp = report.messageDeltas.filter(d => d.added.length && (d.name.startsWith('App') || d.name.startsWith('Clan')));
if (messageDeltasApp.length === 0) lines.push('_无_'); else {
    for (const d of messageDeltasApp) {
        if (!d.added.length) continue;
        lines.push(`### \`${d.name}\``);
        for (const f of d.added) lines.push(`- \`${f.name}\`: ${f.type} = ${f.tag}`);
        lines.push('');
    }
}
lines.push('');

lines.push('## 枚举新增值');
if (report.enumDeltas.length === 0) lines.push('_无_'); else {
    for (const d of report.enumDeltas) {
        if (!d.added.length) continue;
        lines.push(`### \`enum ${d.name}\``);
        for (const v of d.added) lines.push(`- \`${v.name}\` = ${v.value}`);
        lines.push('');
    }
}
lines.push('');

lines.push('## 字段类型/tag 变更（可能要小心）');
const changes = report.messageDeltas.filter(d => d.changed.length && (d.name.startsWith('App') || d.name.startsWith('Clan')));
if (changes.length === 0) lines.push('_无_'); else {
    for (const d of changes) {
        if (!d.changed.length) continue;
        lines.push(`### \`${d.name}\``);
        for (const c of d.changed) lines.push(`- \`${c.name}\`: ${c.kind} ${c.from} -> ${c.to}`);
        lines.push('');
    }
}
lines.push('');

lines.push('---');
lines.push('（本报告只关心 `App*` / `Clan*` 前缀，即 Rust+ 客户端面向的协议；其他游戏内部 protobuf message 不在 diff 范围。）');

const out = path.join(ROOT, 'tools/PROTO_DIFF.md');
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log('wrote:', path.relative(ROOT, out));
console.log('summary:');
console.log(`  added messages (App*/Clan*): ${onlyAppPrefix(report.addedMessages).length}`);
console.log(`  messages with new fields (App*/Clan*): ${messageDeltasApp.length}`);
console.log(`  enums with new values: ${report.enumDeltas.filter(d => d.added.length).length}`);
console.log(`  type/tag changes (App*/Clan*): ${changes.length}`);
