'use strict';

const crypto = require('crypto');

function databaseId(owner, clientId) {
  return crypto.createHash('sha256').update(JSON.stringify([owner, clientId])).digest('hex');
}

function createRepository(database) {
  const collection = database.collection('bead-works');

  async function get(owner, clientId) {
    const result = await collection.where({ _id: databaseId(owner, clientId), owner, clientId }).limit(1).get();
    return result.data[0] || null;
  }

  async function compareAndSwap(owner, clientId, baseRevision, next) {
    if (next.owner !== owner || next.clientId !== clientId || next.revision !== baseRevision + 1) throw new Error('Invalid repository mutation');
    const documentId = databaseId(owner, clientId);
    if (baseRevision === 0) {
      try {
        const result = await collection.add(Object.assign({}, next, { _id: documentId }));
        if (result.id !== documentId) throw new Error('Invalid insert result');
        return true;
      } catch (error) {
        const existing = await get(owner, clientId);
        if (existing) return false;
        throw error;
      }
    }
    const patch = Object.assign({}, next);
    delete patch.owner;
    delete patch.clientId;
    delete patch.createdAt;
    if (patch.pattern) patch.pattern = database.command.set(patch.pattern);
    if (patch.completedRows) patch.completedRows = database.command.set(patch.completedRows);
    const result = await collection.where({ _id: documentId, owner, clientId, revision: baseRevision }).update(patch);
    if (result.updated !== 0 && result.updated !== 1) throw new Error('Invalid update result');
    return result.updated === 1;
  }

  async function list(owner, after, limit) {
    const conditions = { owner };
    if (after) conditions.clientId = database.command.gt(after);
    const result = await collection.where(conditions).orderBy('clientId', 'asc').limit(limit).get();
    return result.data;
  }

  return { get, compareAndSwap, list };
}

module.exports = { createRepository };
