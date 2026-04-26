#!/usr/bin/env node
// Full field-level diff for all App*/Clan* messages, including silent mismatches
// (fields present in both but with different tag/type, or fields removed locally).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTRACTED = path.join(ROOT, 'tools/extracted.json');
const LOCAL_PROTO = path.join(ROOT, 'backend/lib/rustplus/rustplus.proto');

function parseProto(text) {
    const messages = {};
    const enums = {};
    const lines = text.split('\n');
    let cur = null;
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
            const f = line.match(/^(?:(optional|required|repeated)\s+)?([\w\.]+)\s+(\w+)\s*=\s*(\d+)\s*;/);
            if (f) cur.fields[f[3]] = { modifier: f[1] || 'optional', type: f[2], tag: parseInt(f[4], 10) };
        } else if (cur.kind === 'enum') {
            const v = line.match(/^(\w+)\s*=\s*(-?\d+)\s*;/);
            if (v) cur.values[v[1]] = parseInt(v[2], 10);
        }
    }
    return { messages, enums };
}

const server = JSON.parse(fs.readFileSync(EXTRACTED, 'utf8').replace(/^﻿/, ''));
const remote = { messages: {}, enums: {} };
for (const e of server.enums) {
    const values = {}; for (const v of e.Values) values[v.Name] = v.Value;
    remote.enums[e.Name] = { name: e.Name, values };
}
for (const m of server.messages) {
    const fields = {};
    for (const f of m.Fields) fields[f.Field] = { modifier: 'optional', type: f.ProtoType, tag: f.Tag, wireType: f.WireType, netType: f.NetType };
    remote.messages[m.Name] = { name: m.Name, fields };
}
const local = parseProto(fs.readFileSync(LOCAL_PROTO, 'utf8'));

// equivalences considered non-issues
const TYPE_EQUIVALENT = (a, b) => {
    if (a === b) return true;
    const pairs = [
        ['uint32', 'NetworkableId'],
        ['bytes', 'ArraySegment`1'],
        ['sint32', 'int32'], // wire-compatible varint, semantic differs only for negatives
    ];
    return pairs.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
};

const targetPrefix = (name) => name.startsWith('App') || name.startsWith('Clan') || name === 'Vector2' || name === 'Vector3' || name === 'Vector4' || name === 'Color' || name === 'Half3' || name === 'Ray';

console.log('# 完整字段级对照 (App*/Clan* + 基础 Vector/Color/Ray)');
console.log('');

// 1. 服务器端有 message、本地无
const onlyServer = Object.keys(remote.messages).filter(n => targetPrefix(n) && !(n in local.messages)).sort();
console.log('## 1. 服务器端有，本地基线无的 message');
if (onlyServer.length === 0) console.log('  _none_');
else for (const n of onlyServer) console.log('  + ' + n);
console.log('');

// 2. 本地有 message、服务器端无
const onlyLocal = Object.keys(local.messages).filter(n => targetPrefix(n) && !(n in remote.messages)).sort();
console.log('## 2. 本地基线有，服务器端无的 message（可能已被游戏移除）');
if (onlyLocal.length === 0) console.log('  _none_');
else for (const n of onlyLocal) console.log('  - ' + n);
console.log('');

// 3. 两边都有，但字段层有差异
console.log('## 3. 两边都有但字段不一致的 message');
const issues = [];
for (const name of Object.keys(local.messages).filter(targetPrefix).sort()) {
    if (!(name in remote.messages)) continue;
    const l = local.messages[name].fields;
    const r = remote.messages[name].fields;
    const added = [];
    const removed = [];
    const tagMismatch = [];
    const typeMismatch = [];
    const lTagToName = Object.fromEntries(Object.entries(l).map(([k, v]) => [v.tag, k]));
    const rTagToName = Object.fromEntries(Object.entries(r).map(([k, v]) => [v.tag, k]));

    for (const fname of Object.keys(r)) {
        if (!(fname in l)) added.push({ name: fname, ...r[fname] });
        else {
            const lt = l[fname], rt = r[fname];
            if (lt.tag !== rt.tag) tagMismatch.push({ name: fname, local: lt.tag, server: rt.tag });
            if (!TYPE_EQUIVALENT(lt.type, rt.type)) typeMismatch.push({ name: fname, local: lt.type, server: rt.type });
        }
    }
    for (const fname of Object.keys(l)) {
        if (!(fname in r)) removed.push({ name: fname, ...l[fname] });
    }

    // detect rename: same tag, different field name
    const renamed = [];
    for (const tag of Object.keys(rTagToName)) {
        const rName = rTagToName[tag];
        const lName = lTagToName[tag];
        if (lName && rName && lName !== rName) renamed.push({ tag, local: lName, server: rName });
    }

    if (added.length || removed.length || tagMismatch.length || typeMismatch.length || renamed.length) {
        issues.push({ name, added, removed, tagMismatch, typeMismatch, renamed });
    }
}

if (issues.length === 0) console.log('  _all aligned_');
else {
    for (const issue of issues) {
        console.log('### ' + issue.name);
        for (const f of issue.added) console.log('  + 新增字段 ' + f.name + ': ' + f.type + ' = ' + f.tag);
        for (const f of issue.removed) console.log('  - 本地有但服务器无 ' + f.name + ': ' + f.type + ' = ' + f.tag + '  (可能已被移除)');
        for (const c of issue.tagMismatch) console.log('  ! 字段编号变了 ' + c.name + ': 本地=' + c.local + ' 服务器=' + c.server);
        for (const c of issue.typeMismatch) console.log('  ! 字段类型变了 ' + c.name + ': 本地=' + c.local + ' 服务器=' + c.server);
        for (const r of issue.renamed) console.log('  ~ 同 tag 字段改名 tag=' + r.tag + ': 本地=' + r.local + ' -> 服务器=' + r.server);
    }
}
console.log('');

// 4. enum 完整对照
console.log('## 4. 枚举完整对照');
for (const name of Object.keys(local.enums).sort()) {
    if (!(name in remote.enums)) {
        console.log('### ' + name + ' (服务器端已无此 enum)');
        continue;
    }
    const lv = local.enums[name].values, rv = remote.enums[name].values;
    const addedV = Object.keys(rv).filter(k => !(k in lv));
    const removedV = Object.keys(lv).filter(k => !(k in rv));
    const changedV = Object.keys(lv).filter(k => k in rv && lv[k] !== rv[k]);
    if (!addedV.length && !removedV.length && !changedV.length) continue;
    console.log('### ' + name);
    for (const k of addedV) console.log('  + 新增值 ' + k + ' = ' + rv[k]);
    for (const k of removedV) console.log('  - 本地有但服务器无 ' + k + ' = ' + lv[k]);
    for (const k of changedV) console.log('  ! 数值变了 ' + k + ': 本地=' + lv[k] + ' 服务器=' + rv[k]);
}
