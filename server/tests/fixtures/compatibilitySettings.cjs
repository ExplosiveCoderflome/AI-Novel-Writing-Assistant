// Isolate capability persistence from the developer app DB. No HTTP requests.
const { prisma } = require("../../dist/db/prisma.js");
const rows = new Map();
const original = { findMany: prisma.appSetting.findMany, findUnique: prisma.appSetting.findUnique, upsert: prisma.appSetting.upsert };
prisma.appSetting.findMany = async ({ where }) => [...rows].filter(([key]) => where.key.in.includes(key)).map(([key, value]) => ({ key, value }));
prisma.appSetting.findUnique = async ({ where }) => rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null;
prisma.appSetting.upsert = async ({ where, create, update }) => { const value = rows.has(where.key) ? update.value : create.value; rows.set(where.key, value); return { key: where.key, value }; };
module.exports = { rows, original };
