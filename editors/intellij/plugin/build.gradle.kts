import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    kotlin("jvm") version "2.3.21"
    id("org.jetbrains.intellij.platform") version "2.16.0"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

// Every tool of this repository writes under `.artifacts/<tool>/`; Gradle's `.gradle/` cannot move.
layout.buildDirectory = layout.projectDirectory.dir(".artifacts/gradle")

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        // Community editions stop at build 253, so the SDK is the unified IntellijIdea distribution.
        create(
            IntelliJPlatformType.IntellijIdea,
            providers.gradleProperty("platformVersion").get(),
        )

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
            // The since-build floor and a recent build, across the IDE family.
            create(IntelliJPlatformType.IntellijIdeaCommunity, "2025.2")
            create(IntelliJPlatformType.IntellijIdea, "2026.1")
            create(IntelliJPlatformType.PyCharmCommunity, "2025.2")
            create(IntelliJPlatformType.PyCharm, "2026.1")
            create(IntelliJPlatformType.WebStorm, "2025.2")
            create(IntelliJPlatformType.WebStorm, "2026.1")
            create(IntelliJPlatformType.GoLand, "2025.2")
            create(IntelliJPlatformType.GoLand, "2026.1")
        }
    }

    // Works only after the first manual Marketplace upload; unsigned, as the Marketplace re-signs.
    publishing {
        token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
        channels = listOf("default")
    }
}

val serverBundle = layout.projectDirectory.file("../../../packages/server/dist/cli.cjs")

val bundledServerDir = layout.buildDirectory.dir("bundledServer")

// HoverflyServerConnectionProvider reads the bundle from the `server/cli.cjs` resource.
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
