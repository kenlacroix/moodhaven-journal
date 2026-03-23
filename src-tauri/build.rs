fn main() {
    // Declare "wear" as an InlinedPlugin so its permissions are resolved under the
    // "wear" ACL namespace (wear:allow-wear-check-connection, etc.) rather than
    // __app-acl__.  This is required for `invoke('plugin:wear|*')` ACL resolution:
    // Tauri looks up plugin commands under the plugin's own namespace, not __app-acl__.
    // The permission definitions are read from permissions/wear/**/*.toml.
    tauri_build::try_build(
        tauri_build::Attributes::new().plugin("wear", tauri_build::InlinedPlugin::new()),
    )
    .expect("failed to run tauri-build");
}
