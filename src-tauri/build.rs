use std::fs;
use std::path::Path;

fn load_banned_patterns(banned_file: &Path) -> Vec<String> {
    let Ok(text) = fs::read_to_string(banned_file) else {
        return vec![];
    };
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| {
            if let Some(pat) = l.strip_prefix("regex:") {
                pat.to_string()
            } else {
                // Plain word: match with word boundaries (simple substring for Rust)
                l.to_ascii_lowercase()
            }
        })
        .collect()
}

fn scan_dir_for_banned(dir: &Path, banned: &[String]) -> Vec<String> {
    let mut violations = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return violations;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            violations.extend(scan_dir_for_banned(&path, banned));
        } else if path.extension().map(|e| e == "rs").unwrap_or(false) {
            let Ok(src) = fs::read_to_string(&path) else {
                continue;
            };
            let lines: Vec<&str> = src.lines().collect();
            for (i, line) in lines.iter().enumerate() {
                let lower = line.to_ascii_lowercase();
                // Check if the previous line contains allow-clinical
                let allowed = i > 0 && lines[i - 1].contains("allow-clinical:");
                if allowed {
                    continue;
                }
                for pat in banned {
                    if lower.contains(pat.as_str()) {
                        violations.push(format!(
                            "{}:{}: banned wellness term '{}' — use somatic/activation framing. Add // allow-clinical: <reason> above to suppress.",
                            path.display(),
                            i + 1,
                            pat
                        ));
                        break;
                    }
                }
            }
        }
    }
    violations
}

fn main() {
    // Wellness language lint: fail cargo check if banned clinical terms appear in Rust sources.
    let workspace_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or(Path::new(".."));
    let banned_file = workspace_root.join("wellness-language-banned.txt");
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");

    let banned = load_banned_patterns(&banned_file);
    if !banned.is_empty() {
        let violations = scan_dir_for_banned(&src_dir, &banned);
        if !violations.is_empty() {
            eprintln!("\n[build.rs] wellness-language lint FAILED — clinical terms found in Rust sources:");
            for v in &violations {
                eprintln!("  {v}");
            }
            eprintln!();
            panic!("wellness-language-banned violations found. See above.");
        }
    }

    // Declare "wear" as an InlinedPlugin so its permissions are resolved under the
    // "wear" ACL namespace (wear:allow-wear-check-connection, etc.) rather than
    // __app-acl__.  This is required for `invoke('plugin:wear|*')` ACL resolution:
    // Tauri looks up plugin commands under the plugin's own namespace, not __app-acl__.
    // The permission definitions are read from permissions/wear/**/*.toml.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .plugin("wear", tauri_build::InlinedPlugin::new())
            .plugin("opener", tauri_build::InlinedPlugin::new())
            .plugin("securekey", tauri_build::InlinedPlugin::new()),
    )
    .expect("failed to run tauri-build");
}
