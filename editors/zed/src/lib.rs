//! Zed extension that launches the `@jterrazz/hoverfly-lsp` language server over stdio.
//!
//! Zed's wasm sandbox reaches only the extension work dir, never the installed
//! dir, so the server cannot ship as an extension asset: it is npm-installed
//! into the work dir instead. A project's own files are outside the sandbox
//! too, so its local install is probed through the worktree API, not `std::fs`.

use std::env;
use std::fs;
use std::path::Path;

use zed_extension_api::{self as zed, LanguageServerId, Result};

const PACKAGE_NAME: &str = "@jterrazz/hoverfly-lsp";
const BINARY_NAME: &str = "hoverfly-lsp";
/// Must match the `bin` field of the package's package.json. Relative to both
/// the extension work dir and a project root.
const SERVER_SCRIPT_PATH: &str = "node_modules/@jterrazz/hoverfly-lsp/bin/hoverfly-lsp.js";

struct HoverflyExtension {
    cached_script_path: Option<String>,
}

impl HoverflyExtension {
    /// `worktree.which` consults only `$PATH`, so a project-local install is
    /// looked up here.
    fn worktree_local_script(worktree: &zed::Worktree) -> Option<String> {
        worktree.read_text_file(SERVER_SCRIPT_PATH).ok()?;
        Some(
            Path::new(&worktree.root_path())
                .join(SERVER_SCRIPT_PATH)
                .to_string_lossy()
                .into_owned(),
        )
    }

    fn ensure_managed_script(&mut self, language_server_id: &LanguageServerId) -> Result<String> {
        let script_exists = fs::metadata(SERVER_SCRIPT_PATH).is_ok_and(|stat| stat.is_file());
        if let Some(path) = &self.cached_script_path {
            if script_exists {
                return Ok(path.clone());
            }
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        let latest_version = zed::npm_package_latest_version(PACKAGE_NAME).map_err(|error| {
            format!(
                "could not resolve the '{PACKAGE_NAME}' npm package ({error}). \
                 Install the server so Zed can find it: run `npm install {PACKAGE_NAME}` \
                 in your project, or `npm install -g {PACKAGE_NAME}`."
            )
        })?;
        let needs_install = !script_exists
            || zed::npm_package_installed_version(PACKAGE_NAME)?.as_deref()
                != Some(latest_version.as_str());

        if needs_install {
            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );
            match zed::npm_install_package(PACKAGE_NAME, &latest_version) {
                Ok(()) => {
                    if !fs::metadata(SERVER_SCRIPT_PATH).is_ok_and(|stat| stat.is_file()) {
                        return Err(format!(
                            "installed npm package '{PACKAGE_NAME}' did not contain expected entry '{SERVER_SCRIPT_PATH}'"
                        ));
                    }
                }
                // A failed update keeps a previous install.
                Err(error) => {
                    if !fs::metadata(SERVER_SCRIPT_PATH).is_ok_and(|stat| stat.is_file()) {
                        return Err(error);
                    }
                }
            }
        }

        let absolute = env::current_dir()
            .map_err(|err| format!("failed to resolve extension working directory: {err}"))?
            .join(SERVER_SCRIPT_PATH)
            .to_string_lossy()
            .into_owned();
        self.cached_script_path = Some(absolute.clone());
        Ok(absolute)
    }
}

impl zed::Extension for HoverflyExtension {
    fn new() -> Self {
        Self {
            cached_script_path: None,
        }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        if let Some(script) = Self::worktree_local_script(worktree) {
            return Ok(zed::Command {
                command: zed::node_binary_path()?,
                args: vec![script, "--stdio".into()],
                env: Default::default(),
            });
        }

        if let Some(on_path) = worktree.which(BINARY_NAME) {
            return Ok(zed::Command {
                command: on_path,
                args: vec!["--stdio".into()],
                env: Default::default(),
            });
        }

        let script = self.ensure_managed_script(language_server_id)?;
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![script, "--stdio".into()],
            env: Default::default(),
        })
    }
}

zed::register_extension!(HoverflyExtension);
