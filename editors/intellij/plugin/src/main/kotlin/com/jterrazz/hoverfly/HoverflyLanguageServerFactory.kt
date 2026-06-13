package com.jterrazz.hoverfly

import com.intellij.openapi.project.Project
import com.redhat.devtools.lsp4ij.LanguageServerFactory
import com.redhat.devtools.lsp4ij.server.StreamConnectionProvider

/**
 * LSP4IJ factory that wires the bundled Hoverfly language server.
 *
 * Registered via the `com.redhat.devtools.lsp4ij.server` extension point in plugin.xml.
 */
class HoverflyLanguageServerFactory : LanguageServerFactory {
    override fun createConnectionProvider(project: Project): StreamConnectionProvider =
        HoverflyServerConnectionProvider()
}
