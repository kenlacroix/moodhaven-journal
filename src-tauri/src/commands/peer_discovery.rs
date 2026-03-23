//! Peer discovery via mDNS/DNS-SD for local network sync
//!
//! Advertises this MoodBloom instance on the LAN and discovers other instances.
//! Uses mdns-sd for cross-platform mDNS support (Linux/macOS/Windows).
//!
//! ## Event flow
//!
//! Background thread → AppHandle::emit("peer:discovered" | "peer:lost") → Frontend store
//!
//! ## State
//!
//! `PeerDiscoveryState` is managed by Tauri and stores the discovered peer list
//! plus a channel sender to stop the background discovery thread.

use crate::commands::peer_identity::get_or_create_device_identity;
use crate::commands::peer_sync_engine::sync_port_for_device;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const SERVICE_TYPE: &str = "_moodbloom._tcp.local.";
const UDP_DISCOVERY_PORT: u16 = 4243;
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

// ── Public types ──────────────────────────────────────────────────────────────

/// A peer discovered on the local network via mDNS
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredPeer {
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
    pub host: String,
    pub port: u16,
    pub version: String,
    pub pubkey_hint: String,
    pub is_trusted: bool,
    pub is_online: bool,
    pub last_seen: String,
}

/// Payload for the "peer:lost" Tauri event
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerLostEvent {
    pub device_id: String,
}

// ── Managed state ─────────────────────────────────────────────────────────────

/// Tauri managed state for peer discovery.
/// Stored in Tauri app state; accessed from commands and the background thread.
pub struct PeerDiscoveryState {
    /// Currently visible peers, keyed by device_id
    pub peers: Mutex<HashMap<String, DiscoveredPeer>>,
    /// Whether the background thread is running
    pub is_active: AtomicBool,
    /// Send () to ask the background thread to stop
    pub stop_tx: Mutex<Option<std::sync::mpsc::SyncSender<()>>>,
}

impl Default for PeerDiscoveryState {
    fn default() -> Self {
        Self {
            peers: Mutex::new(HashMap::new()),
            is_active: AtomicBool::new(false),
            stop_tx: Mutex::new(None),
        }
    }
}

impl PeerDiscoveryState {
    pub fn new() -> Self {
        Self::default()
    }
}

// AtomicBool + Mutex<T> are already Send+Sync; the unsafe impls make the
// outer struct visible to Tauri's state manager which requires Send+Sync.
unsafe impl Send for PeerDiscoveryState {}
unsafe impl Sync for PeerDiscoveryState {}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Sanitize a string for use as an mDNS instance name (no dots, no spaces)
fn sanitize_instance_name(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    cleaned.trim_matches('-').to_string()
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Detect the primary LAN IPv4 address by consulting the OS routing table.
/// Opens a UDP socket (no packets sent) and reads the local address the OS
/// selects — this is the IP that would be used to reach external hosts,
/// i.e. the address on the primary network interface.
/// Returns true for interface names that belong to VPN tunnels, virtual
/// bridges, or other non-physical interfaces that should never be used as
/// the mDNS announcement address.
fn is_virtual_iface(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    // VPN tunnel interfaces (Linux tun/tap, macOS utun, WireGuard, OpenVPN, IPsec, PPP)
    n.starts_with("tun") ||
    n.starts_with("tap") ||
    n.starts_with("utun") ||
    n.starts_with("wg") ||
    n.starts_with("ppp") ||
    n.starts_with("ipsec") ||
    // Common VPN named interfaces
    n.starts_with("vpn") ||
    n.starts_with("nordvpn") ||
    n.starts_with("mullvad") ||
    n.starts_with("proton") ||
    // VPN leak-protection pseudo-interfaces (seen on NordVPN/Mullvad on Linux)
    n.contains("leak") ||
    // Docker / VM virtual bridges
    n.starts_with("docker") ||
    n.starts_with("br-") ||
    n.starts_with("veth") ||
    n.starts_with("virbr") ||
    n.starts_with("vmnet") ||
    n.starts_with("vbox")
}

/// Score an interface name so we prefer physical LAN adapters.
/// Higher score = more preferred.
fn iface_preference(name: &str) -> u8 {
    let n = name.to_ascii_lowercase();
    if n.starts_with("eth") || n.starts_with("en") {
        3
    }
    // Ethernet (en0, eth0)
    else if n.starts_with("wlan") || n.starts_with("wl") {
        2
    }
    // Wi-Fi (wlan0, wlp3s0)
    else {
        1
    } // anything else non-virtual
}

/// Find the best local IPv4 address to advertise on the LAN.
///
/// Enumerates all network interfaces and selects the most suitable one,
/// skipping loopback, link-local, and VPN/virtual interfaces. Prefers
/// Ethernet, then Wi-Fi, then other physical adapters. Falls back to the
/// kernel routing trick (connect-to-8.8.8.8) only if enumeration yields
/// nothing — which handles edge-case OS configurations.
pub fn get_local_ipv4() -> Option<std::net::Ipv4Addr> {
    use std::net::IpAddr;

    // Collect all non-virtual, non-loopback, non-link-local IPv4 addresses
    // with their interface preference score.
    let mut candidates: Vec<(u8, std::net::Ipv4Addr)> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|iface| {
            // Skip virtual / VPN interfaces by name
            if is_virtual_iface(&iface.name) {
                return None;
            }
            match iface.addr.ip() {
                IpAddr::V4(ip) if !ip.is_loopback() && !ip.is_link_local() => {
                    Some((iface_preference(&iface.name), ip))
                }
                _ => None,
            }
        })
        .collect();

    if !candidates.is_empty() {
        // Highest preference first; stable sort keeps deterministic order within a tier.
        candidates.sort_by(|a, b| b.0.cmp(&a.0));
        eprintln!(
            "[peer] LAN IP candidates: {:?}",
            candidates
                .iter()
                .map(|(_, ip)| ip.to_string())
                .collect::<Vec<_>>()
        );
        return Some(candidates[0].1);
    }

    // Fallback: routing table trick. Works on simple setups without a VPN.
    eprintln!("[peer] Interface enumeration yielded nothing — falling back to routing trick");
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if !ip.is_loopback() => Some(ip),
        _ => None,
    }
}

// ── UDP broadcast fallback discovery ─────────────────────────────────────────

/// Parallel UDP broadcast discovery — runs alongside mDNS to handle networks
/// where multicast is filtered (some corporate Wi-Fi / VPNs).
///
/// Protocol (LAN broadcast, port 4243):
///   probe → broadcast  {type:"probe", device_id, device_name, device_type, public_key, version}
///   pong  → unicast    same fields, type:"pong"  (response to a probe)
///
/// On receiving either, we inject the sender into the shared peer map and emit
/// `peer:discovered` if not already present (mDNS takes priority).
fn run_udp_discovery(
    app: AppHandle,
    my_device_id: String,
    my_device_name: String,
    my_device_type: String,
    my_public_key: String,
    stop_flag: Arc<AtomicBool>,
) {
    use std::net::UdpSocket;

    let socket = match UdpSocket::bind(format!("0.0.0.0:{UDP_DISCOVERY_PORT}")) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[peer/udp] Failed to bind UDP port {UDP_DISCOVERY_PORT}: {e}");
            return;
        }
    };
    if let Err(e) = socket.set_read_timeout(Some(Duration::from_millis(500))) {
        eprintln!("[peer/udp] set_read_timeout failed: {e}");
    }
    if let Err(e) = socket.set_broadcast(true) {
        eprintln!("[peer/udp] set_broadcast failed: {e}");
    }

    let pubkey_hint = if my_public_key.len() >= 8 {
        &my_public_key[..8]
    } else {
        &my_public_key
    };
    let probe_json = serde_json::json!({
        "type": "probe",
        "device_id": my_device_id,
        "device_name": my_device_name,
        "device_type": my_device_type,
        "public_key": my_public_key,
        "pubkey_hint": pubkey_hint,
        "version": APP_VERSION,
    })
    .to_string();

    let broadcast_addr = format!("255.255.255.255:{UDP_DISCOVERY_PORT}");
    // Send initial probe immediately
    let _ = socket.send_to(probe_json.as_bytes(), &broadcast_addr);
    let mut last_probe = Instant::now();

    let mut buf = [0u8; 4096];
    loop {
        if stop_flag.load(Ordering::SeqCst) {
            break;
        }

        // Re-broadcast probe every 30 s
        if last_probe.elapsed() >= Duration::from_secs(30) {
            let _ = socket.send_to(probe_json.as_bytes(), &broadcast_addr);
            last_probe = Instant::now();
        }

        match socket.recv_from(&mut buf) {
            Ok((n, src_addr)) => {
                let Ok(json) = serde_json::from_slice::<serde_json::Value>(&buf[..n]) else {
                    continue;
                };
                let peer_id = json["device_id"].as_str().unwrap_or("").to_string();
                // Ignore own broadcasts and invalid payloads
                if peer_id.is_empty() || peer_id == my_device_id {
                    continue;
                }

                let msg_type = json["type"].as_str().unwrap_or("");

                // Respond to probes with a pong so the sender learns about us
                if msg_type == "probe" {
                    let pong_json = serde_json::json!({
                        "type": "pong",
                        "device_id": my_device_id,
                        "device_name": my_device_name,
                        "device_type": my_device_type,
                        "public_key": my_public_key,
                        "pubkey_hint": pubkey_hint,
                        "version": APP_VERSION,
                    })
                    .to_string();
                    let _ = socket.send_to(pong_json.as_bytes(), src_addr);
                }

                // Both probe and pong tell us about a peer — inject only if mDNS hasn't
                let peer_name = json["device_name"]
                    .as_str()
                    .unwrap_or("Unknown")
                    .to_string();
                let peer_type = json["device_type"]
                    .as_str()
                    .unwrap_or("desktop")
                    .to_string();
                let peer_pubkey = json["public_key"].as_str().unwrap_or("").to_string();
                let peer_version = json["version"].as_str().unwrap_or("?").to_string();
                let peer_hint = json["pubkey_hint"]
                    .as_str()
                    .unwrap_or(&peer_pubkey[..peer_pubkey.len().min(8)])
                    .to_string();
                let host = src_addr.ip().to_string();

                let peer = DiscoveredPeer {
                    device_id: peer_id.clone(),
                    device_name: peer_name.clone(),
                    device_type: peer_type,
                    host,
                    port: sync_port_for_device(&peer_id),
                    version: peer_version,
                    pubkey_hint: peer_hint,
                    is_trusted: crate::commands::peer_pairing::is_device_trusted(&app, &peer_id),
                    is_online: true,
                    last_seen: now_iso(),
                };

                if let Some(state) = app.try_state::<PeerDiscoveryState>() {
                    if let Ok(mut peers) = state.peers.lock() {
                        // Only inject if not already present (mDNS has richer info)
                        if !peers.contains_key(&peer_id) {
                            peers.insert(peer_id.clone(), peer.clone());
                            let _ = app.emit("peer:discovered", &peer);
                            eprintln!("[peer/udp] Discovered via UDP: {peer_name} ({peer_id})");
                        }
                    }
                }
            }
            Err(ref e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                // Timeout — normal, check stop flag and loop
            }
            Err(e) => {
                eprintln!("[peer/udp] Receive error: {e}");
            }
        }
    }
    eprintln!("[peer/udp] UDP discovery thread exiting");
}

// ── Background discovery thread ───────────────────────────────────────────────

/// Runs in a dedicated OS thread (not a tokio task).
/// Creates the mDNS daemon, registers our service, browses for peers,
/// and emits Tauri events when peers appear or disappear.
fn run_discovery(
    app: AppHandle,
    device_id: String,
    device_name: String,
    device_type: String,
    public_key: String,
    stop_rx: std::sync::mpsc::Receiver<()>,
) {
    use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

    // Spawn UDP fallback thread — shared stop flag lets us shut it down cleanly
    let udp_stop = Arc::new(AtomicBool::new(false));
    let udp_stop_clone = udp_stop.clone();
    let udp_app = app.clone();
    let udp_device_id = device_id.clone();
    let udp_device_name = device_name.clone();
    let udp_device_type = device_type.clone();
    let udp_public_key = public_key.clone();
    let udp_handle = std::thread::spawn(move || {
        run_udp_discovery(
            udp_app,
            udp_device_id,
            udp_device_name,
            udp_device_type,
            udp_public_key,
            udp_stop_clone,
        );
    });

    let daemon = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[peer] Failed to create mDNS daemon: {e}");
            return;
        }
    };

    // Detect LAN IP — must be explicit; passing "" gives mdns-sd no address
    // to put in the DNS A record, so the announcement is never sent.
    let local_ip = get_local_ipv4();
    let local_ip_str = local_ip.map(|ip| ip.to_string()).unwrap_or_default();
    eprintln!("[peer] Local IP detected: {local_ip_str:?}");

    // Build TXT record properties
    let pubkey_hint = if public_key.len() >= 8 {
        &public_key[..8]
    } else {
        &public_key
    };
    let instance_name = sanitize_instance_name(&format!("moodbloom-{}", &device_id[..8]));

    let mut properties: HashMap<String, String> = HashMap::new();
    properties.insert("device_id".to_string(), device_id.clone());
    properties.insert("device_type".to_string(), device_type.clone());
    properties.insert("device_name".to_string(), device_name.clone());
    properties.insert("version".to_string(), APP_VERSION.to_string());
    properties.insert("pubkey_hint".to_string(), pubkey_hint.to_string());

    // Register this device as a service on the LAN.
    // host_name is the DNS hostname (.local); host_ipv4 is the A-record IP.
    let my_host = format!("{}.local.", instance_name);
    let sync_port = sync_port_for_device(&device_id);
    eprintln!(
        "[peer] Registering service: {instance_name}.{SERVICE_TYPE} @ {local_ip_str}:{sync_port}"
    );
    match ServiceInfo::new(
        SERVICE_TYPE,
        &instance_name,
        &my_host,
        local_ip_str.as_str(),
        sync_port,
        properties,
    ) {
        Ok(service) => {
            if let Err(e) = daemon.register(service) {
                eprintln!("[peer] Failed to register mDNS service: {e}");
                // Non-fatal — we can still browse without registering
            } else {
                eprintln!("[peer] Service registered successfully");
            }
        }
        Err(e) => {
            eprintln!("[peer] Failed to create ServiceInfo: {e}");
        }
    }

    // Browse for other MoodBloom instances
    let receiver = match daemon.browse(SERVICE_TYPE) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[peer] Failed to start mDNS browse: {e}");
            let _ = daemon.shutdown();
            return;
        }
    };

    eprintln!("[peer] Discovery started — advertising and browsing {SERVICE_TYPE}");

    loop {
        // Non-blocking check for stop signal
        if stop_rx.try_recv().is_ok() {
            break;
        }

        // Poll mDNS events with a 500 ms timeout so we check the stop channel regularly
        match receiver.recv_timeout(std::time::Duration::from_millis(500)) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let props = info.get_properties();

                // Extract TXT record fields; val_str() returns &str directly
                let peer_device_id = props
                    .get("device_id")
                    .map(|p| p.val_str())
                    .unwrap_or("")
                    .to_string();

                // Skip our own advertisement
                if peer_device_id == device_id || peer_device_id.is_empty() {
                    continue;
                }

                let peer_name = props
                    .get("device_name")
                    .map(|p| p.val_str())
                    .unwrap_or("Unknown Device")
                    .to_string();

                let peer_type = props
                    .get("device_type")
                    .map(|p| p.val_str())
                    .unwrap_or("desktop")
                    .to_string();

                let peer_version = props
                    .get("version")
                    .map(|p| p.val_str())
                    .unwrap_or("?")
                    .to_string();

                let peer_pubkey_hint = props
                    .get("pubkey_hint")
                    .map(|p| p.val_str())
                    .unwrap_or("")
                    .to_string();

                // Prefer first resolved IPv4 address, fall back to hostname
                let host = info
                    .get_addresses()
                    .iter()
                    .next()
                    .map(|a| a.to_string())
                    .unwrap_or_else(|| info.get_hostname().trim_end_matches('.').to_string());

                let peer = DiscoveredPeer {
                    device_id: peer_device_id.clone(),
                    device_name: peer_name,
                    device_type: peer_type,
                    host,
                    port: info.get_port(),
                    version: peer_version,
                    pubkey_hint: peer_pubkey_hint,
                    is_trusted: crate::commands::peer_pairing::is_device_trusted(
                        &app,
                        &peer_device_id,
                    ),
                    is_online: true,
                    last_seen: now_iso(),
                };

                // Update shared state; try_state returns Option (not Result)
                if let Some(state) = app.try_state::<PeerDiscoveryState>() {
                    if let Ok(mut peers) = state.peers.lock() {
                        peers.insert(peer_device_id.clone(), peer.clone());
                    }
                }

                // Emit event so the frontend store can react immediately
                let _ = app.emit("peer:discovered", &peer);
                eprintln!(
                    "[peer] Discovered: {} ({})",
                    peer.device_name, peer.device_id
                );
            }

            Ok(ServiceEvent::ServiceRemoved(_, fullname)) => {
                // Find which stored peer matches this fullname, remove it, and notify frontend
                let lost_id: Option<String> = {
                    if let Some(state) = app.try_state::<PeerDiscoveryState>() {
                        if let Ok(mut peers) = state.peers.lock() {
                            let found: Option<String> = peers
                                .values()
                                .find(|p| {
                                    // Instance names embed the first 8 chars of device_id
                                    p.device_id.len() >= 8 && fullname.contains(&p.device_id[..8])
                                })
                                .map(|p| p.device_id.clone());

                            if let Some(ref id) = found {
                                peers.remove(id);
                            }
                            found
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                };

                if let Some(gone_id) = lost_id {
                    let _ = app.emit(
                        "peer:lost",
                        PeerLostEvent {
                            device_id: gone_id.clone(),
                        },
                    );
                    eprintln!("[peer] Lost: {gone_id}");
                }
            }

            Ok(mdns_sd::ServiceEvent::SearchStarted(_)) => {
                // Fires every ~60 s per interface — expected, not worth logging
            }
            Ok(mdns_sd::ServiceEvent::ServiceFound(_, fullname)) => {
                eprintln!("[peer] Found (resolving): {fullname}");
            }
            Ok(_) => {
                // Other daemon events (cache expiry, etc.) — ignore
            }

            Err(flume::RecvTimeoutError::Timeout) => {
                // Expected — check the stop channel and loop again
            }

            Err(flume::RecvTimeoutError::Disconnected) => {
                // Daemon shut down its internal channel
                break;
            }
        }
    }

    eprintln!("[peer] Discovery thread exiting — shutting down mDNS daemon");
    let _ = daemon.stop_browse(SERVICE_TYPE);
    let _ = daemon.shutdown();

    // Signal UDP fallback thread to stop and wait for it
    udp_stop.store(true, Ordering::SeqCst);
    let _ = udp_handle.join();
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Start mDNS broadcast + browse. Safe to call multiple times (idempotent).
#[tauri::command]
pub async fn peer_discovery_start(
    app: AppHandle,
    state: State<'_, PeerDiscoveryState>,
) -> Result<(), String> {
    if state.is_active.load(Ordering::SeqCst) {
        return Ok(()); // already running
    }

    let identity = get_or_create_device_identity(&app)?;

    // Create a sync_channel so the stop signal is buffered (won't block sender)
    let (stop_tx, stop_rx) = std::sync::mpsc::sync_channel::<()>(1);
    {
        let mut guard = state.stop_tx.lock().map_err(|e| e.to_string())?;
        *guard = Some(stop_tx);
    }

    state.is_active.store(true, Ordering::SeqCst);

    let app_clone = app.clone();
    let device_id = identity.device_id.clone();
    let device_name = identity.device_name.clone();
    let device_type = identity.device_type.clone();
    let public_key = identity.public_key.clone();

    std::thread::spawn(move || {
        run_discovery(
            app_clone,
            device_id,
            device_name,
            device_type,
            public_key,
            stop_rx,
        );
        // Mark inactive so callers can restart if needed
        if let Some(state) = app.try_state::<PeerDiscoveryState>() {
            state.is_active.store(false, Ordering::SeqCst);
        }
    });

    Ok(())
}

/// Stop mDNS discovery and clear the peer list.
#[tauri::command]
pub fn peer_discovery_stop(state: State<'_, PeerDiscoveryState>) -> Result<(), String> {
    if let Ok(mut guard) = state.stop_tx.lock() {
        if let Some(tx) = guard.take() {
            let _ = tx.send(());
        }
    }
    state.is_active.store(false, Ordering::SeqCst);

    if let Ok(mut peers) = state.peers.lock() {
        peers.clear();
    }

    Ok(())
}

/// Snapshot of currently discovered nearby peers.
#[tauri::command]
pub fn peer_get_nearby(
    state: State<'_, PeerDiscoveryState>,
) -> Result<Vec<DiscoveredPeer>, String> {
    let peers = state.peers.lock().map_err(|e| e.to_string())?;
    Ok(peers.values().cloned().collect())
}

/// Whether the discovery background thread is currently active.
#[tauri::command]
pub fn peer_discovery_is_active(state: State<'_, PeerDiscoveryState>) -> bool {
    state.is_active.load(Ordering::SeqCst)
}
