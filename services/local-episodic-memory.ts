import { File, Paths } from 'expo-file-system';

import { createEpisodicMemoryRepository } from './local-episodic-memory-core';

const memoryFile = new File(Paths.document, 'episodic-memories.json');

const repository = createEpisodicMemoryRepository({
  async read() {
    return memoryFile.exists ? memoryFile.text() : null;
  },
  async write(value) {
    memoryFile.create({ overwrite: true, intermediates: true });
    memoryFile.write(value);
  },
  async remove() {
    if (memoryFile.exists) memoryFile.delete();
  },
});

export const listLocalMemories = repository.list;
export const rememberLocalFact = repository.remember;
export const retrieveLocalMemories = repository.retrieve;
export const deleteLocalMemory = repository.deleteOne;
export const clearLocalMemories = repository.clear;
