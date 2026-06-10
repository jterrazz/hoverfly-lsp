//! Zed extension for the Hoverfly simulation language server.
//!
//! All intelligence (diagnostics, completion, hover) lives in the `hoverfly-lsp`
//! npm package. This extension only resolves that binary and tells Zed how to
//! launch it over stdio. Resolution order:
//!
//!   1. A project-local install: `<worktree>/node_modules/.bin/hoverfly-lsp`.
//!   2. A global install on `$PATH` (e.g. `npm i -g hoverfly-lsp`).
//!   3. A Zed-managed npm install of the `hoverfly-lsp` package, run via Node.
//!   4. Otherwise, an error explaining how to install the server.

use std::env;
use std::fs;
use std::path::Path;

use zed_extension_api::{self as zed, LanguageServerId, Result};

/// npm package that ships the language server.
const PACKAGE_NAME: &str = "hoverfly-lsp";
/// `bin` name exposed by that package (`node_modules/.bin/<BINARY_NAME>`).
const BINARY_NAME: &str = "hoverfly-lsp";
/// Entry script inside the installed package, run with Node when Zed manages
/// the install. Mirrors the package's `bin` field (`./bin/hoverfly-lsp.js`).
const SERVER_SCRIPT_PATH: &str = "node_modules/hoverfly-lsp/bin/hoverfly-lsp.js";

struct HoverflyExtension {
    /// Cached absolute path to the Zed-managed server script, to skip the npm
    /// version check on subsequent launches once it is installed.
    cached_script_path: Option<String>,
}

impl HoverflyExtension {
    /// Returns the project-local server binary if one is installed in the
    /// worktree's `node_modules/.bin`. `worktree.which` only consults `$PATH`,
    /// so the project-local case is checked explicitly against the worktree
    /// root.
    fn worktree_local_binary(worktree: &zed::Worktree) -> Option<String> {
        let candidate = Path::new(&worktree.root_path())
            .join("node_modules")
            .join(".bin")
            .join(BINARY_NAME);
        if fs::metadata(&candidate).is_ok_and(|stat| stat.is_file()) {
            Some(candidate.to_string_lossy().into_owned())
        } else {
            None
        }
    }

    /// Ensures the `hoverfly-lsp` npm package is installed in the extension's
    /// working directory and returns the absolute path to its entry script.
    fn ensure_managed_script(&mut self, language_server_id: &LanguageServerId) -> Result<String> {
        let script_exists =
            fs::metadata(SERVER_SCRIPT_PATH).is_ok_and(|stat| stat.is_file());
        if let Some(path) = &self.cached_script_path {
            if script_exists {
                return Ok(path.clone());
            }
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        let latest_version = zed::npm_package_latest_version(PACKAGE_NAME)?;
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
                // A failed update is non-fatal if a previous install is present.
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
        // 1. Project-local install (node_modules/.bin/hoverfly-lsp).
        if let Some(local) = Self::worktree_local_binary(worktree) {
            return Ok(zed::Command {
                command: local,
                args: vec!["--stdio".into()],
                env: Default::default(),
            });
        }

        // 2. Global install on $PATH.
        if let Some(on_path) = worktree.which(BINARY_NAME) {
            return Ok(zed::Command {
                command: on_path,
                args: vec!["--stdio".into()],
                env: Default::default(),
            });
        }

        // 3. Zed-managed npm install, launched via Node.
        let script = self.ensure_managed_script(language_server_id)?;
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![script, "--stdio".into()],
            env: Default::default(),
        })
    }
}

zed::register_extension!(HoverflyExtension);
