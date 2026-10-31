package com.jterrazz.hoverfly

import java.io.File

/** A GUI-launched IDE does not inherit the shell PATH, so `PATH` is probed only after the usual install locations. */
object NodeResolver {

    fun resolve(): String? {
        for (candidate in candidates()) {
            if (candidate != null && isExecutable(candidate)) {
                return candidate
            }
        }
        return null
    }

    private fun candidates(): Sequence<String?> = sequence {
        yield(System.getenv("HOVERFLY_LSP_NODE"))

        yield("/opt/homebrew/bin/node") // macOS arm64 Homebrew
        yield("/usr/local/bin/node") // macOS x86_64 Homebrew / generic
        yield("/usr/bin/node") // Linux distro packages

        yieldAll(nvmNodes())

        val home = System.getProperty("user.home")
        if (home != null) {
            yieldAll(globNewest(File(home, ".local/share/fnm/node-versions"), "*/installation/bin/node"))
            yieldAll(globNewest(File(home, ".local/share/mise/installs/node"), "*/bin/node"))
        }

        yield(whichNode())

        yieldAll(windowsNodes())
    }

    private fun nvmNodes(): Sequence<String> {
        val home = System.getProperty("user.home") ?: return emptySequence()
        return globNewest(File(home, ".nvm/versions/node"), "*/bin/node")
    }

    private fun windowsNodes(): Sequence<String> = sequence {
        if (!isWindows()) return@sequence
        System.getenv("ProgramFiles")?.let { yield("$it\\nodejs\\node.exe") }
        System.getenv("ProgramW6432")?.let { yield("$it\\nodejs\\node.exe") }
        System.getenv("APPDATA")?.let { yield("$it\\npm\\node.exe") }
    }

    /** Newest by descending name, which is lexicographic: `v9` sorts above `v20`. */
    private fun globNewest(versionsDir: File, relative: String): Sequence<String> = sequence {
        if (!versionsDir.isDirectory) return@sequence
        val children = versionsDir.listFiles { f -> f.isDirectory } ?: return@sequence
        val sorted = children.sortedByDescending { it.name.removePrefix("v") }
        val suffix = relative.substringAfter("*/")
        for (versionDir in sorted) {
            val bin = File(versionDir, suffix)
            if (bin.isFile) yield(bin.absolutePath)
        }
    }

    private fun whichNode(): String? {
        return try {
            val cmd = if (isWindows()) listOf("where", "node") else listOf("/usr/bin/which", "node")
            val process = ProcessBuilder(cmd).redirectErrorStream(true).start()
            val output = process.inputStream.bufferedReader().readLine()?.trim()
            process.waitFor()
            output?.takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            null
        }
    }

    private fun isExecutable(path: String): Boolean {
        val file = File(path)
        return file.isFile && file.canExecute()
    }

    private fun isWindows(): Boolean =
        System.getProperty("os.name").orEmpty().lowercase().contains("win")
}
