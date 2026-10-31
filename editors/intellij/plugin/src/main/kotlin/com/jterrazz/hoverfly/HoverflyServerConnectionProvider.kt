package com.jterrazz.hoverfly

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.redhat.devtools.lsp4ij.server.OSProcessStreamConnectionProvider
import java.io.File

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
     * Node cannot run a script inside the plugin jar, so the bundle is copied out on every
     * launch, which keeps an updated plugin on its own server. Every running IDE and plugin
     * version shares this one temp path.
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
