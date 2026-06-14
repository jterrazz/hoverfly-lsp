import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    kotlin("jvm") version "2.3.21"
    id("org.jetbrains.intellij.platform") version "2.16.0"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        // IntelliJ IDEA Community (IC) is no longer published since 2025.3 (build 253);
        // the unified IntelliJ IDEA distribution (IntellijIdea) is used to resolve the SDK
        // for 2026.1. The plugin remains Community-compatible (depends only on
        // com.intellij.modules.platform + LSP4IJ).
        create(
            IntelliJPlatformType.IntellijIdea,
            providers.gradleProperty("platformVersion").get(),
        )

        // LSP4IJ — auto-installed by IntelliJ when the plugin is loaded.
        plugins("com.redhat.devtools.lsp4ij:${providers.gradleProperty("lsp4ijVersion").get()}")

        pluginVerifier()
        testFramework(TestFrameworkType.Platform)
    }
}

kotlin {
    jvmToolchain(21)
}

intellijPlatform {
    pluginConfiguration {
        name = providers.gradleProperty("pluginName")
        version = providers.gradleProperty("pluginVersion")

        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = provider { null }
        }
    }

    pluginVerification {
        ides {
            recommended()
        }
    }

    // Automated Marketplace updates AFTER the first manual web upload.
    // Generate a permanent token at https://plugins.jetbrains.com/author/me/tokens and
    // `export JETBRAINS_MARKETPLACE_TOKEN=...` before running `./gradlew publishPlugin`.
    // Marketplace signing is optional and skipped; the Marketplace re-signs on upload.
    publishing {
        token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
        // "default" channel = the stable, publicly listed release stream.
        channels = listOf("default")
    }
}

// Copy the freshly built LSP server bundle into the plugin resources so it is
// packaged inside the distribution zip. The launcher runs `node server/cli.cjs`.
val serverBundle = layout.projectDirectory.file("../../../packages/server/dist/cli.cjs")

val bundledServerDir = layout.buildDirectory.dir("bundledServer")

// Copies cli.cjs into <bundledServer>/server/cli.cjs. The base dir is added as a
// resource root, so it is packaged at `server/cli.cjs` inside the plugin jar.
val bundleServer by tasks.registering(Copy::class) {
    from(serverBundle)
    into(bundledServerDir.map { it.dir("server") })
    doFirst {
        require(serverBundle.asFile.exists()) {
            "LSP server bundle not found at ${serverBundle.asFile}. " +
                "Run `npm run build` at the repository root first."
        }
    }
}

sourceSets {
    named("main") {
        resources.srcDir(files(bundledServerDir).builtBy(bundleServer))
    }
}
