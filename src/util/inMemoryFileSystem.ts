import * as path from "path"
import { FileSystemError } from "vscode"
import { FileType } from "../fileSystemProtocol/responses"

export class InMemoryFile {
  type: FileType
  ctime: number
  mtime: number
  size: number

  name: string
  data: Uint8Array

  constructor(name: string) {
    this.type = FileType.File
    this.ctime = Date.now()
    this.mtime = Date.now()
    this.size = 0
    this.name = name
    this.data = new Uint8Array()
  }
}

export class InMemoryDirectory {
  type: FileType
  ctime: number
  mtime: number
  size: number

  name: string
  entries: Map<string, InMemoryFile | InMemoryDirectory>

  constructor(name: string) {
    this.type = FileType.Directory
    this.ctime = Date.now()
    this.mtime = Date.now()
    this.size = 0
    this.name = name
    this.entries = new Map()
  }
}

export type Entry = InMemoryFile | InMemoryDirectory

export type InMemoryFileSystem = {
  lookup: (urlPath: string) => Entry | undefined
  lookupFile: (urlPath: string) => InMemoryFile
  lookupDirectory: (urlPath: string, silent: boolean) => InMemoryDirectory
  lookupParentDirectory: (urlPath: string) => InMemoryDirectory
  rename: (oldPath: string, newPath: string, options: { overwrite: boolean }) => void
  writeFile: (urlPath: string, content: Uint8Array, options: { create: boolean; overwrite: boolean }) => boolean
  deleteFile: (urlPath: string) => void
  createDirectory: (urlPath: string) => void
}

export function createInMemoryFileSystem(): InMemoryFileSystem {
  const root = new InMemoryDirectory("")

  function _lookup(urlPath: string, silent: false): Entry
  function _lookup(urlPath: string, silent: boolean): Entry | undefined
  function _lookup(urlPath: string, silent: boolean): Entry | undefined {
    const parts = urlPath.split("/")
    let entry: Entry = root
    for (const part of parts) {
      if (!part) {
        continue
      }
      let child: Entry | undefined
      if (entry instanceof InMemoryDirectory) {
        child = entry.entries.get(part)
      }
      if (!child) {
        if (!silent) {
          throw FileSystemError.FileNotFound(urlPath)
        } else {
          return undefined
        }
      }
      entry = child
    }
    return entry
  }

  function lookupDirectory(urlPath: string, silent: boolean): InMemoryDirectory {
    const entry = _lookup(urlPath, silent)
    if (entry instanceof InMemoryDirectory) {
      return entry
    }
    throw FileSystemError.FileNotADirectory(urlPath)
  }

  function lookupFile(urlPath: string): InMemoryFile {
    const entry = _lookup(urlPath, false)
    if (entry instanceof InMemoryFile) {
      return entry
    }
    throw FileSystemError.FileIsADirectory(urlPath)
  }

  function lookupParentDirectory(urlPath: string): InMemoryDirectory {
    return lookupDirectory(path.posix.dirname(urlPath), false)
  }

  function rename(oldPath: string, newPath: string, options: { overwrite: boolean }): void {
    if (!options.overwrite && _lookup(newPath, true)) {
      throw FileSystemError.FileExists(newPath)
    }

    const entry = _lookup(oldPath, false)
    const oldParent = lookupParentDirectory(oldPath)

    const newParent = lookupParentDirectory(newPath)
    const newName = path.posix.basename(newPath)

    oldParent.entries.delete(entry.name)
    entry.name = newName
    newParent.entries.set(newName, entry)
  }

  function writeFile(urlPath: string, content: Uint8Array, options: { create: boolean; overwrite: boolean }): boolean {
    // true if created

    const basename = path.posix.basename(urlPath)
    const parent = lookupParentDirectory(urlPath)
    let entry = parent.entries.get(basename)
    if (entry instanceof InMemoryDirectory) {
      throw FileSystemError.FileIsADirectory(urlPath)
    }
    if (!entry && !options.create) {
      throw FileSystemError.FileNotFound(urlPath)
    }
    if (entry && options.create && !options.overwrite) {
      throw FileSystemError.FileExists(urlPath)
    }

    let created
    if (entry) {
      created = false
    } else {
      created = true
      entry = new InMemoryFile(basename)
      parent.entries.set(basename, entry)
    }
    entry.mtime = Date.now()
    entry.size = content.byteLength
    entry.data = content

    return created
  }

  function deleteFile(urlPath: string): void {
    const dirname = path.posix.dirname(urlPath)
    const basename = path.posix.basename(urlPath)
    const parent = lookupDirectory(dirname, false)
    if (!parent.entries.has(basename)) {
      throw FileSystemError.FileNotFound(urlPath)
    }
    parent.entries.delete(basename)
    parent.mtime = Date.now()
    parent.size -= 1
  }

  function createDirectory(urlPath: string) {
    const dirname = path.posix.dirname(urlPath)
    const basename = path.posix.basename(urlPath)
    const parent = lookupDirectory(dirname, false)

    parent.entries.set(basename, new InMemoryDirectory(basename))
    parent.mtime = Date.now()
    parent.size += 1
  }

  return {
    lookup: (urlPath: string) => _lookup(urlPath, true),
    lookupFile,
    lookupDirectory,
    lookupParentDirectory,
    rename,
    writeFile,
    deleteFile,
    createDirectory,
  }
}
