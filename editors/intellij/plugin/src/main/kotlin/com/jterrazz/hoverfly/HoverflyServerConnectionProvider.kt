package com.jterrazz.hoverfly

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.redhat.devtools.lsp4ij.server.OSProcessStreamConnectionProvider
import java.io.File

/**
 * Launches the bundled Hoverfly LSP server via `node <cli.cjs> --stdio`.
 *
 * The server bundle (`cli.cjs`) is packaged inside the plugin jar under `server/`.
 * We extract it from the plugin classpath to a stable temp location and launch it
 * from there, which works regardless of the plugin install path and uses only
 * public IntelliJ Platform APIs.
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
     * Extracts the bundled `server/cli.cjs` resource to a stable temp file and returns it.
     * The bundle is always packaged inside the plugin jar, so a classpath read is the most
     * reliable resolver and avoids any internal plugin-path APIs. The file is re-extracted
     * on every launch so an updated plugin always runs its own server version.
     */
    private fun resolveServerScript(): File? {
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
}
