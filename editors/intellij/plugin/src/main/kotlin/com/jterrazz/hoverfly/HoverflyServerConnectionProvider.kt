package com.jterrazz.hoverfly

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.extensions.PluginId
import com.redhat.devtools.lsp4ij.server.OSProcessStreamConnectionProvider
import java.io.File

/**
 * Launches the bundled Hoverfly LSP server via `node <plugin>/server/cli.cjs --stdio`.
 *
 * The server bundle (`cli.cjs`) is packaged inside the plugin under `server/` and
 * unpacked into the plugin installation directory's `lib/` classes. We resolve it
 * relative to the plugin path so it works regardless of install location.
 */
class HoverflyServerConnectionProvider : OSProcessStreamConnectionProvider() {

    init {
        configure()
    }

    private fun configure() {
        val node = NodeResolver.resolve()
        if (node == null) {
            notifyError(
                "Node.js not found",
                "The Hoverfly language server requires Node.js (20+). Install Node, or set the " +
                    "HOVERFLY_LSP_NODE environment variable to the path of a node binary, then restart the IDE.",
            )
            return
        }

        val serverScript = resolveServerScript()
        if (serverScript == null) {
            notifyError(
                "Hoverfly server bundle missing",
                "Could not locate the bundled LSP server (server/cli.cjs) inside the plugin installation. " +
                    "Try reinstalling the Hoverfly plugin.",
            )
            return
        }

        val commandLine = GeneralCommandLine(node, serverScript.absolutePath, "--stdio")
            .withWorkDirectory(serverScript.parentFile)
        commandLine.charset = Charsets.UTF_8
        super.setCommandLine(commandLine)
    }

    /**
     * Finds `server/cli.cjs`. The plugin is delivered as a zip whose `lib/` dir
     * contains the plugin jar; bundled resources placed under `server/` in the jar
     * are also copied to the plugin root by the IntelliJ Platform Gradle plugin's
     * distribution layout. We probe the plugin path and the jar's resource as fallbacks.
     */
    private fun resolveServerScript(): File? {
        val pluginPath = PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))?.pluginPath?.toFile()
            ?: return extractFromClasspath()

        val candidates = listOf(
            File(pluginPath, "server/cli.cjs"),
            File(pluginPath, "lib/server/cli.cjs"),
        )
        candidates.firstOrNull { it.isFile }?.let { return it }

        // Resource is bundled inside the plugin jar -> extract to a temp file.
        return extractFromClasspath()
    }

    private fun extractFromClasspath(): File? {
        val stream = javaClass.classLoader.getResourceAsStream("server/cli.cjs") ?: return null
        return stream.use { input ->
            val tempDir = File(System.getProperty("java.io.tmpdir"), "hoverfly-lsp-server")
            tempDir.mkdirs()
            val target = File(tempDir, "cli.cjs")
            target.outputStream().use { output -> input.copyTo(output) }
            target
        }
    }

    private fun notifyError(title: String, content: String) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("Hoverfly LSP")
            .createNotification(title, content, NotificationType.ERROR)
            .notify(null)
    }

    companion object {
        private const val PLUGIN_ID = "com.jterrazz.hoverfly-lsp"
    }
}
